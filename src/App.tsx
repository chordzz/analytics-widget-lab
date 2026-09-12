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

import { useEffect, useState } from 'react'
import { AnalyticsModule } from './analytics'
import { SignInScreen } from './auth/SignInScreen'
import { fakeSignInClient } from './auth/fake-sign-in'

/*
 * `#/sign-in` renders the sign-in screen against the fake client, so the copy
 * and the states can be reviewed now.
 *
 * It is deliberately a route rather than a gate. There is no real token
 * provider yet, so gating the whole app behind a fake sign-in would be theatre
 * that everyone using the fixtures has to click through. The gate lands with
 * `OtpTokenProvider` (integration plan, stage F) and replaces this route.
 */
const signInClient = fakeSignInClient()

export default function App() {
  const signingIn = useHashIs('#/sign-in')

  if (signingIn) {
    return (
      <SignInScreen
        client={signInClient}
        onSignedIn={() => {
          window.location.hash = '#/analytics'
        }}
      />
    )
  }

  return <AnalyticsModule />
}

function useHashIs(hash: string): boolean {
  const [matches, setMatches] = useState(() => window.location.hash === hash)

  useEffect(() => {
    const onChange = () => setMatches(window.location.hash === hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [hash])

  return matches
}
