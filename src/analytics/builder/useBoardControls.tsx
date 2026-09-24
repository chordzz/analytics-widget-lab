/**
 * A board's Controls, as a Viewer uses them.
 *
 * Merge Plan Stage 6.3. Two screens render a board — the published view and the
 * builder — and both need the same three things: somewhere to hold the Viewer's
 * control values, a per-widget contribution derived from them, and the values
 * kept *out* of the store.
 *
 * That last point is why this is a hook rather than reducer state. A Viewer
 * setting a date range is reading the Author's dashboard, not editing it;
 * persisting it would change what everyone else sees because one person looked.
 * Same rule as the exposed filters in 6.1.
 */

import { useCallback, useMemo, useState } from 'react'
import { defaultPeriod } from '../../domain/default-period'
import { contributionFor } from '../../composition/correspondence'
import { controlSubjectFor } from '../data/query'
import { useDatasets } from '../data/AnalyticsData'
import type { ControlValues } from '../../domain/composition'
import type { QueryContribution } from '../../composition/correspondence'
import type { Board, PlacedWidget } from './boards'
import type { Dataset } from '../data/types'

const NOTHING: QueryContribution = {}

export function useBoardControls(board: Board | undefined) {
  const { datasets } = useDatasets()
  const [chosen, setChosen] = useState<ControlValues>({})

  /**
   * What the Controls are showing: what a Viewer chose, or the default.
   *
   * A Control stores no value, so a board with one used to open with its range
   * empty and governing nothing. Filling it here rather than in state keeps the
   * distinction that matters — `chosen` is what somebody actually set, and
   * clearing a Control returns it to the default instead of to nothing.
   */
  const values = useMemo<ControlValues>(() => {
    const controls = board?.controls ?? []
    if (controls.length === 0) return chosen

    const filled: ControlValues = { ...chosen }
    for (const control of controls) {
      if (filled[control.id] != null) continue

      /*
       * Three layers, narrowest last: the Author's stated window, then the
       * render-time default where they stated none, then whatever the Viewer
       * has chosen — which is `chosen` above and why this only fills gaps.
       *
       * The Author's default is preferred over ours because it is a statement
       * about the board: a revenue board built around a quarter should open on
       * that quarter for everyone who visits. Ours is the fallback for a board
       * whose Author expressed no preference, and it stays relative so it does
       * not go stale.
       */
      if (control.defaultValue != null) {
        filled[control.id] = control.defaultValue
        continue
      }
      if (control.controlType === 'date-range') filled[control.id] = defaultPeriod()
    }
    return filled
  }, [board, chosen])

  const setValues = setChosen

  const byId = useMemo(() => {
    const map: Record<string, Dataset> = {}
    for (const dataset of datasets) map[dataset.id] = dataset
    return map
  }, [datasets])

  const contribution = useCallback(
    (widget: PlacedWidget): QueryContribution => {
      const dataset = byId[widget.datasetId]
      if (!board || !dataset || board.controls.length === 0) return NOTHING

      /*
       * Computed per widget, every time. A Control that cached which Widgets it
       * reached would be wrong the moment one was added — which is exactly the
       * stale-configuration bug FR-CO-06's "whose bound Dataset supports it"
       * avoids by never naming Widgets in the first place.
       */
      return contributionFor(board.controls, values, controlSubjectFor(widget, dataset), dataset)
    },
    [board, byId, values],
  )

  /**
   * The board's current date range, for a Widget being composed to inherit.
   *
   * The first date Control's value, because a board has one period — a second
   * date Control would be two answers to one question, and nothing offers a
   * way to add one.
   */
  const period = useMemo(() => {
    const control = board?.controls.find((entry) => entry.controlType === 'date-range')
    const value = control ? values[control.id] : undefined
    return value && typeof value === 'object' && ('from' in value || 'to' in value)
      ? (value as { from?: string; to?: string })
      : undefined
  }, [board, values])

  return { values, setValues, contribution, period }
}
