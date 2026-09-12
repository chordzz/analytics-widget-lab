/**
 * The gallery — the workbench for widget design.
 *
 * Every built widget rendered live, grouped by family, at a switchable size.
 * This is where look-and-feel decisions actually get made: comparing two bar
 * treatments side by side takes a second here and takes assembling a dashboard
 * anywhere else.
 *
 * The state switcher matters as much as the size one. Loading, empty and error
 * are what a widget spends a meaningful fraction of its life in, and they are
 * the states that get designed last and worst.
 */

import { useState } from 'react'
import { Widget } from '../widgets/Widget'
import type { WidgetState } from '../widgets/WidgetCard'
import { FAMILIES, WIDGET_TYPES, coverage, typesInFamily } from '../widgets/catalog'
import { SAMPLES } from '../widgets/samples'

const SIZES = [
  { id: 'sm', label: 'Small', span: 3, height: 200 },
  { id: 'md', label: 'Medium', span: 4, height: 268 },
  { id: 'lg', label: 'Large', span: 6, height: 320 },
] as const

/**
 * The six, plus one that is not a seventh.
 *
 * `partial` qualifies an answer rather than replacing one — the chart still
 * draws — so it cannot be a `WidgetState` and still needs a way to be looked at.
 * It belongs here for the same reason the other five do: a treatment nobody can
 * put on screen is a treatment nobody designs.
 */
type GalleryState = WidgetState | 'auto' | 'partial' | 'partial-empty'

const STATES: { id: GalleryState; label: string }[] = [
  { id: 'auto', label: 'Ready' },
  { id: 'loading', label: 'Loading' },
  { id: 'empty', label: 'Empty' },
  { id: 'denied', label: 'Denied' },
  { id: 'withdrawn', label: 'Withdrawn' },
  { id: 'failed', label: 'Failed' },
  { id: 'partial', label: 'Partial' },
  { id: 'partial-empty', label: 'Partial, empty' },
]

/** A publisher's reason, of the length one realistically arrives at. */
const SAMPLE_PARTIAL = {
  reason: 'date range exceeds retention; returned 2026-05-01 onward',
}

const overrideFor = (state: GalleryState): WidgetState | undefined => {
  if (state === 'auto' || state === 'partial') return undefined
  if (state === 'partial-empty') return 'empty'
  return state
}

export function GalleryScreen() {
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('md')
  const [state, setState] = useState<GalleryState>('auto')

  const active = SIZES.find((option) => option.id === size)!
  const stats = coverage()

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--a-space-4)',
          marginBottom: 'var(--a-space-5)',
          flexWrap: 'wrap',
        }}
      >
        <p className="a-muted" style={{ margin: 0 }}>
          {stats.builtTypes} of {stats.totalTypes} widget types built, across {stats.builtFamilies}{' '}
          of {stats.totalFamilies} families.
        </p>

        <div style={{ display: 'flex', gap: 'var(--a-space-3)', alignItems: 'center' }}>
          <Segmented
            label="Size"
            options={SIZES.map((option) => ({ id: option.id, label: option.label }))}
            value={size}
            onChange={(value) => setSize(value as typeof size)}
          />
          <Segmented
            label="State"
            options={STATES.map((option) => ({ id: option.id, label: option.label }))}
            value={state}
            onChange={(value) => setState(value as typeof state)}
          />
        </div>
      </div>

      {FAMILIES.map((family) => {
        const types = typesInFamily(family.id)
        const built = types.filter((type) => type.built)
        if (built.length === 0) return null

        return (
          <section key={family.id} style={{ marginBottom: 'var(--a-space-6)' }}>
            <h2 className="a-section-title">
              {family.label}{' '}
              <span style={{ fontWeight: 400, color: 'var(--a-text-muted)' }}>
                — {family.question}
              </span>
            </h2>

            <div className="a-board">
              {built.map((type) => {
                const sample = SAMPLES[type.id]
                if (!sample) return null

                return (
                  <div
                    key={type.id}
                    className="a-board__cell"
                    style={{ gridColumn: `span ${spanFor(type.defaultSpan, active.span)}` }}
                  >
                    <div style={{ height: heightFor(type.family, active.height) }}>
                      <Widget
                        spec={{ id: `gallery-${type.id}`, typeId: type.id, ...sample }}
                        state={overrideFor(state)}
                        partial={state.startsWith('partial') ? SAMPLE_PARTIAL : undefined}
                      />
                    </div>
                    <p
                      style={{
                        margin: '6px 2px 0',
                        fontSize: 'var(--a-text-xs)',
                        color: 'var(--a-text-muted)',
                      }}
                    >
                      {type.label} — {type.description}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <NotBuiltYet />
    </div>
  )
}

/**
 * A stat tile at chart height is mostly whitespace, and a chart at tile height
 * is unreadable. The size preset sets the chart height; tiles take a fraction
 * of it so a row of mixed families still reads as a row.
 */
/**
 * A Sankey or a year-long calendar in a four-column cell is unreadable however
 * good the renderer is. Widgets that declare a wide natural span keep it; the
 * size preset still governs everything else.
 */
function spanFor(natural: number, preset: number): number {
  return natural >= 8 ? Math.max(preset, 8) : preset
}

function heightFor(family: string, preset: number): number {
  if (family === 'single-value') return Math.round(preset * 0.62)
  if (family === 'status') return Math.round(preset * 0.8)
  // A calendar year and a cohort matrix need vertical room a 4-span chart cell
  // does not give them.
  if (family === 'temporal-pattern') return Math.round(preset * 1.15)
  return preset
}

function NotBuiltYet() {
  const pending = WIDGET_TYPES.filter((type) => !type.built)
  if (pending.length === 0) return null

  return (
    <section>
      <h2 className="a-section-title">Not built yet</h2>
      <p className="a-muted" style={{ margin: '0 0 var(--a-space-3)' }}>
        Classified and pickable, with no renderer behind them. Listed rather than hidden, so the gap
        stays visible.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--a-space-2)' }}>
        {pending.map((type) => (
          <span
            key={type.id}
            style={{
              padding: '4px 10px',
              border: '1px dashed var(--a-border-strong)',
              borderRadius: 999,
              fontSize: 'var(--a-text-xs)',
              color: 'var(--a-text-muted)',
            }}
          >
            {type.label}
          </span>
        ))}
      </div>
    </section>
  )
}

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 'var(--a-text-xs)', color: 'var(--a-text-muted)' }}>{label}</span>
      <span className="a-segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === value}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </span>
  )
}
