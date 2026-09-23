/**
 * Opening the composer, and committing what it returns.
 *
 * Extracted from `CreateScreen`, which was the only place a Widget could be
 * edited — not because anything else lacked the machinery, but because the
 * machinery was wired up there and nowhere else. `GridBoard` has carried an
 * `Edit` action on every card since it was written; `DashboardsScreen` rendered
 * the same component without `editable`, so the action was never drawn and the
 * board you actually look at was the one board you could not change.
 *
 * The composer edits everything a Widget is — its Type, its Dataset, its title,
 * its mapping, its exposed filters and sorts, its bound parameters and its
 * width. So "edit a Widget" needs no new surface, only a way to reach this one.
 */

import { useState } from 'react'
import type { ComposerDraft } from './WidgetComposer'
import type { PlacedWidget } from './boards'
import { useBoards } from './useBoards'

/** `new` from scratch, `{ datasetId }` with a source chosen, a Widget to edit. */
export type Composing = 'new' | { datasetId: string } | PlacedWidget

export const isEditing = (value: Composing | null): value is PlacedWidget =>
  value !== null && typeof value === 'object' && 'id' in value

export function useWidgetComposer(boardId: string | undefined) {
  const boards = useBoards()
  const [composing, setComposing] = useState<Composing | null>(null)

  /**
   * Add or update, decided by what the composer was opened with.
   *
   * The spread order matters on the edit branch: `...composing` carries the id
   * and anything the composer does not own, and the draft's fields overwrite
   * it. Reversing them would write the old values back over the edit.
   */
  const commit = (draft: ComposerDraft) => {
    if (!boardId) return

    const spec = {
      typeId: draft.typeId,
      datasetId: draft.datasetId,
      title: draft.title,
      mapping: draft.mapping,
      exposedFilters: draft.exposedFilters,
      exposedSorts: draft.exposedSorts,
      parameterBindings: draft.parameterBindings,
    }

    if (isEditing(composing)) boards.updateWidget(boardId, { ...composing, ...spec }, draft.span)
    else boards.addWidget(boardId, spec, { w: draft.span })

    setComposing(null)
  }

  /** What the composer should open holding, for a Widget being edited. */
  const initial = isEditing(composing)
    ? {
        typeId: composing.typeId,
        datasetId: composing.datasetId,
        title: composing.title ?? '',
        mapping: composing.mapping,
        span: composing.w,
        exposedFilters: composing.exposedFilters ?? [],
        exposedSorts: composing.exposedSorts ?? [],
        parameterBindings: composing.parameterBindings ?? {},
      }
    : undefined

  return {
    composing,
    open: setComposing,
    close: () => { setComposing(null) },
    commit,
    initial,
    /** A Dataset chosen ahead of the composer, when that is how it was opened. */
    startWith: composing !== null && composing !== 'new' && !isEditing(composing) ? composing : undefined,
  }
}
