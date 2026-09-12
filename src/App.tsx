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
import { AuthProvider } from './auth/AuthProvider'
import { SessionGate } from './auth/SessionGate'
import { SignInScreen } from './auth/SignInScreen'
import { fakeSignInClient } from './auth/fake-sign-in'

/*
 * The application is signed-in by default and talks to the real API.
 *
 * `#/fixtures` keeps the old behaviour — every screen, no backend, no sign-in.
 * It is not a debug flag to be embarrassed about: the fixtures are how the
 * whole module was built and they remain the only way to reach states a live
 * API will not produce on demand, like a withdrawn Dataset. A hash rather than
 * a build-time variable so switching costs nothing.
 *
 * `#/sign-in-preview` is there for the same reason, one level down: the sign-in
 * screen is mostly error handling, and the live API will not return a 503 or a
 * rejected code to order. The fake will.
 */
export default function App() {
  const onFixtures = useHashIs('#/fixtures')
  const previewingSignIn = useHashIs('#/sign-in-preview')

  if (onFixtures) return <AnalyticsModule />

  if (previewingSignIn) {
    return (
      <SignInScreen
        client={previewClient}
        onSignedIn={() => {
          window.location.hash = '#/fixtures'
        }}
      />
    )
  }

  return (
    <AuthProvider>
      <SessionGate />
    </AuthProvider>
  )
}

const previewClient = fakeSignInClient()

function useHashIs(hash: string): boolean {
  const [matches, setMatches] = useState(() => window.location.hash === hash)

  useEffect(() => {
    const onChange = () => setMatches(window.location.hash === hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [hash])

  return matches
}
