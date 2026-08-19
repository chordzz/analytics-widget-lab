/**
 * C4 — the chrome every Widget shares, implemented once rather than per
 * Visualization Type: title, exposed filters (FR-VZ-06), and the six render
 * states.
 *
 * The state treatments are the substance of this file. Each gets its own
 * colour, its own icon and its own wording, because the requirements turn on
 * a Viewer being able to tell them apart at a glance:
 *
 *   empty     neutral and quiet — this is not a fault (FR-VZ-10)
 *   denied    deliberate and legible — not an error, not zero (FR-DA-11)
 *   withdrawn cautionary — and explicit that figures are withheld, not absent (FR-DP-14)
 *   failed    the only treatment that says something is broken
 *
 * The content area is a container-query root so a Widget adapts to the space it
 * is given rather than to the page width — a Widget can sit in a narrow column
 * on a wide screen.
 */

import type { ReactNode } from 'react'
import type { WidgetRenderState } from '../retrieval/render-state'

export interface WidgetFrameProps {
  title: string
  description?: string
  sourceSystem?: string
  state: WidgetRenderState
  /** Exposed filter controls (FR-VZ-06). Hidden unless the Widget is showing data. */
  filters?: ReactNode
  /** Rendered visualization. The host supplies this only in the ready state. */
  children?: ReactNode
  /** Retrying is a read, so it belongs to the frame — never to a renderer. */
  onRetry?: () => void
}

export function WidgetFrame({
  title,
  description,
  sourceSystem,
  state,
  filters,
  children,
  onRetry,
}: WidgetFrameProps) {
  return (
    <section
      className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4 flex flex-col gap-3 h-full"
      data-widget-state={state.status}
      aria-busy={state.status === 'loading'}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[var(--analytics-text)] m-0 truncate">{title}</h3>
          {description && (
            <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-0.5">{description}</p>
          )}
        </div>
        {sourceSystem && (
          <span className="shrink-0 text-xs text-[var(--analytics-text-muted)]">{sourceSystem}</span>
        )}
      </header>

      {filters && state.status === 'ready' && (
        <div className="flex flex-wrap gap-2">{filters}</div>
      )}

      <div className="@container flex-1 min-h-0">
        <WidgetStateContent state={state} onRetry={onRetry}>
          {children}
        </WidgetStateContent>
      </div>
    </section>
  )
}

function WidgetStateContent({
  state,
  children,
  onRetry,
}: {
  state: WidgetRenderState
  children?: ReactNode
  onRetry?: () => void
}) {
  switch (state.status) {
    case 'ready':
      return <>{children}</>

    case 'loading':
      return (
        <div className="space-y-2 animate-pulse" role="status" aria-live="polite">
          <span className="sr-only">Loading</span>
          <div className="h-3 w-1/3 rounded bg-[var(--analytics-border)]" />
          <div className="h-24 rounded bg-[var(--analytics-border)]" />
        </div>
      )

    // FR-VZ-10 — distinguishable from a failure. Deliberately the quietest
    // treatment of the four: nothing is wrong, there is simply nothing to show.
    case 'empty':
      return (
        <StateNotice
          tone="var(--analytics-text-muted)"
          icon={<EmptyIcon />}
          heading="No data"
          body="This Dataset returned no records for the current selection."
        />
      )

    // FR-DA-11 — a denial drawn as an empty chart teaches the Viewer the figure
    // is zero; drawn as an error, that the system is broken. Say what happened.
    case 'denied':
      return (
        <StateNotice
          tone="var(--analytics-status-neutral)"
          tinted
          icon={<LockIcon />}
          heading="Access denied"
          body="You are not authorized to see the data behind this Widget. The rest of this Dashboard is unaffected."
        />
      )

    // FR-DP-14 — say the Dataset is gone. Never leave last-known figures on
    // screen, where they would read as current.
    case 'withdrawn':
      return (
        <StateNotice
          tone="var(--analytics-status-warning)"
          tinted
          icon={<WithdrawnIcon />}
          heading="Dataset no longer available"
          body="The Source System has withdrawn this Dataset. Earlier figures are withheld rather than shown, because they would no longer be current."
        />
      )

    case 'failed':
      return (
        <StateNotice
          tone="var(--analytics-status-negative)"
          tinted
          icon={<FailureIcon />}
          heading="Could not load"
          body={state.message}
          action={
            onRetry && (
              <button
                onClick={onRetry}
                className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)]"
              >
                Try again
              </button>
            )
          }
        />
      )
  }
}

function StateNotice({
  tone,
  tinted,
  icon,
  heading,
  body,
  action,
}: {
  tone: string
  tinted?: boolean
  icon: ReactNode
  heading: string
  body: string
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'h-full min-h-24 rounded flex flex-col items-center justify-center text-center gap-1 p-4',
        tinted ? 'border border-dashed' : '',
      ].join(' ')}
      style={tinted ? { borderColor: tone, color: tone } : { color: tone }}
    >
      <span aria-hidden="true">{icon}</span>
      <p className="text-sm font-medium m-0">{heading}</p>
      <p className="text-xs m-0 max-w-xs opacity-80">{body}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

// Distinct silhouettes matter as much as the colours — the four notices must be
// tellable apart before any text is read.

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const EmptyIcon = () => (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
  </svg>
)

const LockIcon = () => (
  <svg {...iconProps}>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
)

const WithdrawnIcon = () => (
  <svg {...iconProps}>
    <path d="M3 6h18v4H3z" />
    <path d="M5 10v10h14V10" />
    <path d="M9 14h6" />
  </svg>
)

const FailureIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3 2 20h20L12 3z" />
    <path d="M12 9v5" />
    <path d="M12 17h.01" />
  </svg>
)
