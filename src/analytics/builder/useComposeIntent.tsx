/**
 * "Build a widget from this" — a one-shot handoff between screens.
 *
 * Data sources sets it and navigates; Create reads it, opens the composer on
 * that dataset, and clears it. Deliberately its own context rather than a field
 * on the boards store: the boards store is serialised to localStorage, and an
 * intent persisted there would fire again on every reload, dragging you into the
 * composer for a dataset you looked at yesterday.
 *
 * It is also not routing. The host portal supplies navigation and knows only
 * about screen ids, so widening `onNavigate` to carry a payload would push
 * module-internal state into the host's contract. This stays inside the module.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

/**
 * Where a widget is headed, decided before the composer opens.
 *
 * `boardId` is optional and `null` is meaningful: it says *a new dashboard*,
 * which is a choice an Author made, as against `undefined` — nobody chose, use
 * whatever is open. Collapsing the two would make "New dashboard" silently
 * adopt the board you last had open.
 */
export interface ComposeIntent {
  datasetId: string
  boardId: string | null
}

interface ComposeIntentValue {
  /** Dataset to open the composer on, if a screen asked for one. */
  pendingDatasetId: string | null
  /** Ask the builder to start a new widget bound to this dataset. */
  composeWith: (datasetId: string, boardId?: string | null) => void
  /** Consume the intent. Returns what was pending, and clears it. */
  takeIntent: () => ComposeIntent | null
}

const ComposeIntentContext = createContext<ComposeIntentValue | null>(null)

export function ComposeIntentProvider({ children }: { children: ReactNode }) {
  const [pendingDatasetId, setPending] = useState<string | null>(null)

  /*
   * The pending id is mirrored in a ref so `takeIntent` can read and clear it
   * without depending on the rendered value. The Create screen consumes this
   * from an effect that React runs twice in development; going through state
   * alone, both passes would see the same id and the second would re-open a
   * composer the first had already opened.
   */
  const latest = useRef<ComposeIntent | null>(null)

  const composeWith = useCallback((datasetId: string, boardId: string | null = null) => {
    latest.current = { datasetId, boardId }
    setPending(datasetId)
  }, [])

  const takeIntent = useCallback(() => {
    const taken = latest.current
    latest.current = null
    if (taken !== null) setPending(null)
    return taken
  }, [])

  const value = useMemo(
    () => ({ pendingDatasetId, composeWith, takeIntent }),
    [pendingDatasetId, composeWith, takeIntent],
  )

  return <ComposeIntentContext.Provider value={value}>{children}</ComposeIntentContext.Provider>
}

export function useComposeIntent(): ComposeIntentValue {
  const value = useContext(ComposeIntentContext)
  if (!value) throw new Error('useComposeIntent must be used inside <ComposeIntentProvider>')
  return value
}
