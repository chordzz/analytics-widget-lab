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

export type WidgetState = 'ready' | 'loading' | 'empty' | 'error'

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
  /** Rendered under the content, e.g. a legend or a footnote. */
  footer?: ReactNode
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
    footer,
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

      <div className="a-card__body">
        {state === 'ready' && children}
        {state === 'loading' && <LoadingState />}
        {state === 'empty' && <Placeholder tone="muted" message={emptyMessage ?? 'No data for this selection.'} />}
        {state === 'error' && (
          <Placeholder tone="critical" message={errorMessage ?? 'This widget could not load.'} />
        )}
      </div>

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

function Placeholder({ tone, message }: { tone: 'muted' | 'critical'; message: string }) {
  return (
    <div className={`a-placeholder a-placeholder--${tone}`} role="status">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none">
        {tone === 'critical' ? (
          <>
            <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10 6v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="10" cy="13.6" r="0.9" fill="currentColor" />
          </>
        ) : (
          <>
            <rect x="2.5" y="11" width="3.4" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="8.3" y="7" width="3.4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <rect x="14.1" y="13" width="3.4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
          </>
        )}
      </svg>
      <p>{message}</p>
    </div>
  )
}
