/**
 * A widget drawn from the module's own sample data, offline.
 *
 * For the Gallery, which is a catalogue of widget *types* rather than of data. A
 * type is bound to a Dataset when an Author places it on a board, and not
 * before — so nothing here retrieves anything, and nothing here can fail because
 * a Source System is down.
 *
 * **Why it lives in `data/`.** Reaching the fixture registry is a data-layer
 * privilege, guarded by a test: a screen importing `datasets` re-couples the
 * module to an in-memory library, and the coupling stays invisible until a
 * backend is wired. That is precisely the bug this component fixes, arriving
 * from the other direction — the Gallery used to render through `Widget`, which
 * fetches, against sample specs naming fixture Datasets that a real Catalogue
 * has never heard of. `Widget` reads "no such Dataset" as a withdrawal, which is
 * right on a board where the binding existed once, and wrong in a gallery where
 * nothing was ever bound. The whole screen came up as withdrawn cards.
 *
 * So the Gallery imports a component and the fixture access stays here.
 */

import { WidgetView } from '../widgets/Widget'
import { SAMPLES } from '../widgets/samples'
import { datasetById } from './datasets'
import { rowsForWidget } from './query'
import type { WidgetState } from '../widgets/WidgetCard'

export interface SampleWidgetProps {
  typeId: string
  /** The Gallery's state switcher. Every treatment is reachable without a backend. */
  state?: WidgetState
  /** The partial-result note, which qualifies `ready` rather than replacing it. */
  partial?: { reason: string }
}

export function SampleWidget({ typeId, state = 'ready', partial }: SampleWidgetProps) {
  const sample = SAMPLES[typeId]
  const spec = { id: `gallery-${typeId}`, typeId, ...sample }
  const dataset = datasetById(sample.datasetId) ?? null

  /*
   * A sample naming a fixture that has since been removed is a wiring bug in
   * this repository, not a data state — so it says so rather than rendering an
   * empty frame, and the person who can fix it is the one looking at the screen.
   */
  return (
    <WidgetView
      spec={spec}
      dataset={dataset}
      rows={dataset ? rowsForWidget(spec, dataset) : []}
      state={dataset ? state : 'failed'}
      errorMessage={dataset ? undefined : `No sample data for ${sample.datasetId}.`}
      partial={partial}
    />
  )
}
