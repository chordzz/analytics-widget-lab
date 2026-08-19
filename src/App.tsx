import { useEffect, useState } from 'react'
import { EligibilityExplorer } from './ui/EligibilityExplorer'
import { WidgetRuntimeDemo } from './ui/WidgetRuntimeDemo'
import { AuthoringFlow } from './ui/AuthoringFlow'
import { DashboardView } from './ui/DashboardView'
import { AccessLog } from './ui/AccessLog'
import { GovernanceSurface } from './ui/GovernanceSurface'
import { PortsProvider, usePorts } from './composition-root'
import { registerBuiltInRenderers } from './renderers'
import { AnalyticsModule } from './analytics'

registerBuiltInRenderers()

const VIEWS = {
  authoring: { label: 'Authoring', caption: 'Phase 3 — UC-02: discover, bind, expose, publish' },
  dashboard: {
    label: 'Dashboard',
    caption:
      'Phase 5 — cross-source composition; each Control reaches exactly what it should, and says what it does not',
  },
  runtime: { label: 'Render states', caption: 'Phase 2 — the six render states, per Widget' },
  access: {
    label: 'Access record',
    caption: 'Phase 6 — FR-DA-14: who saw personal data, and when',
  },
  governance: {
    label: 'Governance',
    caption: 'Phase 7 — UC-07: catch a duplicate Dataset before it spreads',
  },
  eligibility: {
    label: 'Eligibility',
    caption: 'Phase 1 — which Types a Dataset may be presented by',
  },
} as const

type ViewId = keyof typeof VIEWS

export default function App() {
  // Two routes. `#/analytics` is the product module — a self-contained page with
  // its own shell. Everything else is the requirement-proving workbench, which
  // stays exactly as it was.
  const [hash, setHash] = useState(window.location.hash)

  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  if (hash.startsWith('#/analytics')) return <AnalyticsModule />

  return (
    <PortsProvider>
      <Shell />
    </PortsProvider>
  )
}

function Shell() {
  const { viewer, viewers, setViewerId } = usePorts()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [view, setView] = useState<ViewId>('authoring')
  const [reloadToken, setReloadToken] = useState(0)

  return (
    <div data-theme={theme} className="min-h-screen bg-[var(--analytics-bg)] p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-[var(--analytics-text)] m-0">
              Analytics widgets lab
            </h1>
            <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1">
              {VIEWS[view].caption}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-[var(--analytics-text-secondary)]">
              <span className="sr-only">Viewer</span>
              <select
                value={viewer.id}
                onChange={(event) => setViewerId(event.target.value)}
                className="rounded border border-[var(--analytics-border)] bg-[var(--analytics-surface)] text-[var(--analytics-text)] px-2 py-1 text-xs"
              >
                {viewers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName}
                  </option>
                ))}
              </select>
            </label>

            <div
              role="tablist"
              className="flex rounded border border-[var(--analytics-border)] overflow-hidden"
            >
              {(Object.keys(VIEWS) as ViewId[]).map((id) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  onClick={() => setView(id)}
                  className={[
                    'text-xs px-3 py-1',
                    view === id
                      ? 'bg-[var(--analytics-surface-hover)] text-[var(--analytics-text)]'
                      : 'text-[var(--analytics-text-secondary)]',
                  ].join(' ')}
                >
                  {VIEWS[id].label}
                </button>
              ))}
            </div>

            <button
              className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)]"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </div>
        </header>

        {view === 'authoring' && (
          <AuthoringFlow
            onPublished={() => {
              setReloadToken((n) => n + 1)
              setView('dashboard')
            }}
          />
        )}
        {view === 'dashboard' && <DashboardView reloadToken={reloadToken} />}
        {view === 'runtime' && <WidgetRuntimeDemo />}
        {view === 'access' && <AccessLog />}
        {view === 'governance' && <GovernanceSurface />}
        {view === 'eligibility' && <EligibilityExplorer embedded />}
      </div>
    </div>
  )
}
