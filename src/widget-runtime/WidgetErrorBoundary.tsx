/**
 * C2 — containment. One Widget must never take down its neighbours.
 *
 * FR-DA-10 requires the Dashboard to keep presenting the remaining Widgets when
 * one is denied. The same obligation holds for a renderer that throws: a
 * Dashboard composed of Widgets from several Source Systems is only as robust
 * as its weakest renderer unless each is isolated.
 *
 * This catches *render* failures. Retrieval failures are an outcome, not an
 * exception, and are handled by the `failed` state in WidgetFrame.
 */

import { Component, type ReactNode } from 'react'

interface Props {
  widgetId: string
  children: ReactNode
  onError?: (error: Error) => void
}

interface State {
  error: Error | null
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <section
        className="rounded-lg border border-dashed p-4 h-full flex flex-col items-center justify-center text-center gap-1"
        style={{ borderColor: 'var(--analytics-status-negative)', color: 'var(--analytics-status-negative)' }}
        data-widget-state="crashed"
        role="status"
      >
        <p className="text-sm font-medium m-0">This Widget could not be drawn</p>
        <p className="text-xs m-0 opacity-80">{this.state.error.message}</p>
        <p className="text-xs m-0 mt-1 text-[var(--analytics-text-muted)]">
          Other Widgets on this Dashboard are unaffected.
        </p>
      </section>
    )
  }
}
