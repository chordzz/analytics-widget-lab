/**
 * Widget chrome — the frame every widget wears.
 *
 * Built once so 42 widget types cannot drift into 42 slightly different
 * headers, and so loading, empty and error read identically wherever they
 * appear. A primitive never draws any of this; it draws the picture and nothing
 * else.
 *
 * The card establishes a container query context, so the primitive inside can
 * respond to *its own* width rather than the viewport's. A widget at a third of
 * the board should be a different composition, not a squashed one.
 */

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from 'react'

/**
 * The six render states, and why there are six.
 *
 * These are `WidgetRenderState`'s statuses from `retrieval/render-state.ts`,
 * deliberately the same six words — the model resolves an outcome into one of
 * them and the chrome draws it, and a card that could only show four would
 * force two of them to be rendered as something they are not.
 *
 * The requirements turn on the distinctions, so none may be collapsed:
 *
 *   empty      authorized, nothing to say. Not a fault (FR-VZ-10).
 *   denied     not authorized. Drawn as empty it teaches the Viewer the figure
 *              is zero; drawn as an error it teaches them the system is broken
 *              (FR-DA-10, FR-DA-11).
 *   withdrawn  the Dataset is gone. Figures are withheld rather than shown,
 *              because stale ones would read as current (FR-DP-13, FR-DP-14).
 *   failed     the only treatment that says something is broken.
 *
 * `failed` was `error` while the module was a parallel track. Renamed for the
 * same reason the type ids were: one vocabulary, and the model owns it.
 */
export type WidgetState = 'ready' | 'loading' | 'empty' | 'denied' | 'withdrawn' | 'failed'

export interface WidgetAction {
  label: string
  onSelect: () => void
  destructive?: boolean
}

export interface WidgetCardProps {
  title: string
  subtitle?: string
  /** Shown top-right, e.g. a delta or a period label. */
  badge?: ReactNode
  actions?: WidgetAction[]
  state?: WidgetState
  errorMessage?: string
  emptyMessage?: string
  /**
   * The publisher said this answer is not the whole answer.
   *
   * A qualifier on `ready` and `empty`, never a state of its own — the picture
   * is real and it is not all of the picture. Drawn below the body rather than
   * as a header badge for two reasons: a bare card has no header, and a note
   * that sits under the figure is read by someone who has just read the figure.
   */
  partial?: { reason: string | null }
  /** Rendered under the content, e.g. a legend or a footnote. */
  footer?: ReactNode
  /**
   * Viewer-facing controls, between the header and the picture.
   *
   * Above the body rather than below it because they change what the body says:
   * a filter a Viewer has to scroll past the chart to find is one they will read
   * the wrong number before noticing.
   */
  controls?: ReactNode
  /** Drops the header. For a stat tile whose value is its own headline. */
  bare?: boolean
  /**
   * Text-led rather than plot-led — keeps the roomier inset. A chart wants the
   * pixels; a number wants the breathing room.
   */
  textLed?: boolean
  selected?: boolean
  onSelect?: () => void
  className?: string
  children?: ReactNode
}

export const WidgetCard = forwardRef<
  HTMLElement,
  WidgetCardProps & Omit<HTMLAttributes<HTMLElement>, 'title' | 'children' | 'onSelect'>
>(function WidgetCard(
  {
    title,
    subtitle,
    badge,
    actions,
    state = 'ready',
    errorMessage,
    emptyMessage,
    partial,
    footer,
    controls,
    bare = false,
    textLed = false,
    selected = false,
    onSelect,
    className = '',
    children,
    ...rest
  },
  ref,
) {
  return (
    <section
      ref={ref}
      onClick={onSelect}
      aria-current={selected || undefined}
      className={[
        'a-card',
        bare ? 'a-card--bare' : '',
        textLed ? 'a-card--text' : '',
        selected ? 'a-card--selected' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {!bare && (
        <header className="a-card__head">
          <div className="a-card__titles">
            <h3 className="a-card__title">{title}</h3>
            {subtitle && <p className="a-card__subtitle">{subtitle}</p>}
          </div>
          <div className="a-card__head-end">
            {badge}
            {actions && actions.length > 0 && <ActionsMenu actions={actions} />}
          </div>
        </header>
      )}

      {controls && <div className="a-card__controls">{controls}</div>}

      <div className="a-card__body">
        {state === 'ready' && children}
        {state === 'loading' && <LoadingState />}
        {state !== 'ready' && state !== 'loading' && (
          <StatePanel
            state={state}
            emptyMessage={emptyMessage}
            errorMessage={errorMessage}
            partial={state === 'empty' ? partial : undefined}
          />
        )}
      </div>

      {/*
        Only alongside a picture. An empty card has one message slot and the
        panel already fills it — showing both gave "No data for this selection"
        directly above "None of this range could be served", which is two
        different accounts of the same card.
      */}
      {partial && state === 'ready' && <PartialNote reason={partial.reason} />}

      {footer && state === 'ready' && <footer className="a-card__foot">{footer}</footer>}
    </section>
  )
})

function ActionsMenu({ actions }: { actions: WidgetAction[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="a-menu">
      <button
        type="button"
        className="a-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Widget actions"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="3" r="1.4" fill="currentColor" />
          <circle cx="8" cy="8" r="1.4" fill="currentColor" />
          <circle cx="8" cy="13" r="1.4" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <>
          <div className="a-menu__scrim" onClick={() => setOpen(false)} />
          <div role="menu" className="a-menu__list">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={`a-menu__item ${action.destructive ? 'a-menu__item--destructive' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  setOpen(false)
                  action.onSelect()
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * "Part of the data — retention cut the range short."
 *
 * Always shown, never behind a hover: a tooltip is invisible to anyone reading a
 * dashboard on a touchscreen, glancing at it on a wall display, or screenshotting
 * a figure into a deck — which are three of the ways a wrong number travels.
 *
 * `role="status"` rather than `alert`: nothing is broken and nothing needs
 * interrupting. But it is announced, because the whole point is that the figure
 * above cannot be read at face value, and a sighted reader gets that from the
 * rule down the side.
 *
 * The empty case gets different words on purpose. "Nothing here" is a claim
 * about the data; a partial empty means the source served *none* of what was
 * asked for, which is a claim about the request — and telling someone their
 * range is empty when the truth is that it was refused sends them looking in the
 * wrong place.
 */
function PartialNote({ reason }: { reason: string | null }) {
  const sentence = partialSentence(reason, false)
  return (
    /*
     * `title` carries the full sentence because the visible one is line-clamped
     * on a narrow card. The clamp is visual only — the text stays whole in the
     * DOM, so nothing is lost to a screen reader, and what a sighted reader
     * loses is the publisher's *reason*, never the fact that the figure is
     * incomplete.
     */
    <p className="a-card__partial" role="status" title={sentence}>
      <span className="a-card__partial-mark" aria-hidden="true">
        !
      </span>
      <span className="a-card__partial-text">{sentence}</span>
    </p>
  )
}

/**
 * The empty case gets different words on purpose.
 *
 * "No data for this selection" is a claim about the data. A partial empty means
 * the source served *none* of what was asked for, which is a claim about the
 * request — and telling someone their range is empty when it was actually
 * refused sends them looking in the wrong place.
 */
export function partialSentence(reason: string | null, empty: boolean): string {
  const lead = empty ? 'None of this range could be served' : 'Part of the data'
  return reason ? `${lead} — ${reason}` : `${lead}. The source gave no reason.`
}

/** Shaped like a chart rather than a generic block, so the layout doesn't jump on load. */
function LoadingState() {
  return (
    <div className="a-skeleton" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading</span>
      {[62, 84, 46, 92, 71, 55].map((height, index) => (
        <span key={index} className="a-skeleton__bar" style={{ height: `${height}%` }} />
      ))}
    </div>
  )
}

/**
 * The four states that are not `ready` and not `loading`.
 *
 * Each gets its own tone, icon and wording. A shared "nothing here" treatment
 * would be less code and would defeat the point: the whole reason these are
 * four states rather than one is that a Viewer must be able to tell them apart
 * without asking anyone.
 */
function StatePanel({
  state,
  emptyMessage,
  errorMessage,
  partial,
}: {
  state: Exclude<WidgetState, 'ready' | 'loading'>
  emptyMessage?: string
  errorMessage?: string
  partial?: { reason: string | null }
}) {
  const panel = {
    empty: {
      /*
       * An empty that was truncated is warned rather than muted. Muted is the
       * right tone for "there is genuinely nothing here" and the wrong one for
       * "the source refused the range" — the second is something to act on.
       */
      tone: partial ? ('warning' as const) : ('muted' as const),
      icon: <BarsIcon />,
      heading: undefined,
      body: partial
        ? partialSentence(partial.reason, true)
        : (emptyMessage ?? 'No data for this selection.'),
    },
    denied: {
      tone: 'neutral' as const,
      icon: <LockIcon />,
      heading: 'Access denied',
      body: 'You are not authorized to view this data. This is not a zero — the figures exist and are withheld.',
    },
    withdrawn: {
      tone: 'warning' as const,
      icon: <WithdrawnIcon />,
      heading: 'Dataset withdrawn',
      body: 'The source system has withdrawn this dataset. Earlier figures are withheld rather than shown, because they would no longer be current.',
    },
    failed: {
      tone: 'critical' as const,
      icon: <FailureIcon />,
      heading: undefined,
      body: errorMessage ?? 'This widget could not load.',
    },
  }[state]

  return (
    <div className={`a-placeholder a-placeholder--${panel.tone}`} role="status">
      <span className="a-placeholder__icon" aria-hidden="true">
        {panel.icon}
      </span>
      {panel.heading && <p className="a-placeholder__heading">{panel.heading}</p>}
      <p>{panel.body}</p>
    </div>
  )
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  'aria-hidden': true,
} as const

/** Empty — chart-shaped, so the state reads as "this chart has no data". */
const BarsIcon = () => (
  <svg {...iconProps}>
    <rect x="2.5" y="11" width="3.4" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="8.3" y="7" width="3.4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
    <rect x="14.1" y="13" width="3.4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)

/** Denied — a lock, because the data exists and is being kept from you. */
const LockIcon = () => (
  <svg {...iconProps}>
    <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M7 9V6.8a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

/** Withdrawn — struck through, because it was here and is not any more. */
const WithdrawnIcon = () => (
  <svg {...iconProps}>
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5.2 5.2l9.6 9.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
)

/** Failed — the only one that means something is broken. */
const FailureIcon = () => (
  <svg {...iconProps}>
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10 6v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="10" cy="13.6" r="0.9" fill="currentColor" />
  </svg>
)
