/**
 * The application.
 *
 * Singular, as of merge §2. This file used to switch between two: the product
 * module on `#/analytics`, and a tabbed workbench of six harness screens on
 * every other hash. The workbench proved the FRD was implementable before the
 * backend existed, and every property it demonstrated now lives either in the
 * module's own surfaces or in a test:
 *
 *   - the eligibility explorer  → the create flow offers only what a Dataset
 *     satisfies, and `indeterminate` is unreachable for the module's datasets
 *     because they declare the semantics Finding 1 asked for
 *   - the render-state demo     → `widgets/states.test.tsx`, and the Gallery's
 *     own state switcher
 *   - the authoring flow        → `builder/WidgetComposer`
 *   - the dashboard + controls  → `builder/GridBoard` and `BoardControls`
 *   - the access record         → the Data sources screen, and
 *     `data/access-record.test.ts`
 *   - the governance surface    → `governance/governance.test.ts`
 *
 * What is deliberately *not* carried over is the retrieval-scenario switcher —
 * flipping a Dataset to denied or withdrawn by hand. The fixtures still carry
 * those scenarios and the six states are still exercised, but nothing in the
 * product lets a Viewer choose them, because nothing should.
 */

import { AnalyticsModule } from './analytics'

export default function App() {
  return <AnalyticsModule />
}
