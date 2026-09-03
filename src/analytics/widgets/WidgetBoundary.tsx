/**
 * Containment — one widget must never take down its neighbours.
 *
 * Ported from the workbench's `WidgetErrorBoundary` in merge §2, and the reason
 * it was ported rather than deleted: the module had **no error boundary at
 * all**, so a single throwing primitive blanked the whole board. That is
 * FR-DA-10's obligation read one step further — the requirement is about a
 * *denied* widget not taking its neighbours with it, and a board assembled from
 * several sources is only as robust as its weakest drawing.
 *
 * This catches **render** failures. Retrieval failures are an outcome rather
 * than an exception and are handled by the six states in `WidgetCard`, which is
 * why the fallback below says something different from the `failed` card: that
 * one means the data did not arrive, this one means the data arrived and the
 * drawing broke. Reporting them identically would send someone to look at the
 * wrong thing.
 *
 * A class component because that is the only thing React gives an error
 * boundary. There is no hook for this.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Named so a console line points at a card rather than at "a widget". */
  widgetId: string
  title?: string
  children: ReactNode
}

interface State {
  message: string | null
}

export class WidgetBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : 'Unknown error.' }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    /*
     * Logged, not swallowed. The card below tells a Viewer the board is still
     * usable; it must not also be the only trace a developer gets, or a
     * primitive that throws on one dataset in twenty is invisible.
     */
    console.error(
      `[analytics] widget "${this.props.title ?? this.props.widgetId}" failed to draw`,
      error,
      info.componentStack,
    )
  }

  render() {
    if (this.state.message === null) return this.props.children

    /*
     * The same `.a-placeholder` treatment every other non-ready state uses, at
     * the `critical` tone. A bespoke crash card would be the one state on the
     * board that looked like it came from somewhere else — which is exactly the
     * impression to avoid when the message is "this is still usable".
     */
    return (
      <section className="a-card" data-widget-state="crashed">
        <div className="a-card__body">
          <div className="a-placeholder a-placeholder--critical" role="status">
            <p className="a-placeholder__heading">This widget could not be drawn</p>
            <p>{this.state.message}</p>
            <p>Everything else on this board is unaffected.</p>
          </div>
        </div>
      </section>
    )
  }
}
