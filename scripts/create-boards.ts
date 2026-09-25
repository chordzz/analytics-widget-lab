/**
 * Creates Peniremit's four Dashboards from their definitions.
 *
 *   ANALYTICS_TOKEN=... bun run scripts/create-boards.ts            # dry run
 *   ANALYTICS_TOKEN=... bun run scripts/create-boards.ts --create   # writes
 *
 * A board that already exists is left alone. `PATCH` replaces every Widget,
 * positions included, so updating one discards however it has been arranged
 * since — and those positions live only on the server. `--replace-existing`
 * overrides that, and means exactly what it says.
 *
 * **Dry by default.** This is the only script here that writes, and what it
 * writes is visible to everyone who can open Analytics. A flag is cheap; four
 * duplicate Dashboards on a shared deployment are not.
 *
 * **Idempotent by name.** It reads `/v1/dashboards` first and updates a board
 * of the same name rather than creating a second. Re-running is how you apply a
 * change to a definition, not how you get eight Dashboards.
 *
 * The definitions are checked offline by `peniremit-boards.test.ts` — every
 * Type against its Dataset's Families, every mapped Field against the
 * declaration, every bound parameter against the published Filter Parameters.
 * That suite passing is the precondition for running this; it is cheaper to
 * fail there than halfway through creating a Dashboard.
 */

import { PENIREMIT_BOARDS, type BoardCard, type BoardDefinition } from '../src/boards/peniremit-boards'
import { dashboardInputFrom } from '../src/dashboard/api-dashboard'
import type { Board } from '../src/analytics/builder/boards'
import { dateRangeControl } from '../src/domain/composition'
import { DASHBOARD_COLUMNS } from '../src/domain/composition'
import { rowsForPx } from '../src/analytics/builder/grid'
import { heightForType } from '../src/analytics/widgets/layout'
import { requireBaseUrl } from './api-base'

/**
 * The window every Widget opens on.
 *
 * `from` and `to` are `required: true` on all 41 Peniremit Datasets — the
 * Source System cannot answer without them — so a Widget that binds neither is
 * not a Widget with an unset filter, it is a query that will be refused. The
 * first four Dashboards were created without them and every widget on them
 * came back `Query rejected · from is required by this Dataset`.
 *
 * A default rather than a fixture: the board's date Control governs the range
 * and replaces this, so it is where a board opens rather than what it is stuck
 * with. It still matters on its own — a Widget dragged onto a board with no
 * Control has to send something.
 */
const DEFAULT_RANGE = { from: '2026-03-01', to: '2026-10-01' }

/**
 * Resolved on first use, not at import.
 *
 * `create-boards.test.ts` imports this module for `boardFrom`, and a missing
 * base URL must not end that test run — the tests do no network work and have
 * no target to be missing. Everything that reads this sits under `main()`.
 */
let resolvedBase: string | undefined
const base = (): string => (resolvedBase ??= requireBaseUrl(argAfter('--base')))
const TOKEN = (process.env.ANALYTICS_TOKEN ?? '').trim().replace(/^Bearer\s+/i, '').replace(/^['"`]|['"`]$/g, '')
const WRITE = process.argv.includes('--create')

/**
 * Overwrite a Dashboard that already exists.
 *
 * Off by default, and that default is the whole point. `PATCH` *"replaces the
 * name, description, Widgets, and Composition Elements"* — the whole widget
 * list, every `x`, `y`, `w` and `h` among it. So an update does not merge a
 * definition into a board; it reinstates the definition and discards whatever
 * the board had become.
 *
 * Peniremit's four boards have been arranged by hand since they were created.
 * Re-running this to pick up a definition change would have flattened that
 * back to the computed flow, silently, with no way back — the positions live
 * only on the server.
 *
 * Merging would be the generous fix and it is the wrong one: matching a stored
 * Widget to a defined one needs a key, and title, Dataset and order each break
 * the moment a card is added or removed. A guard nobody can get wrong beats a
 * merge that is subtly wrong.
 */
const REPLACE = process.argv.includes('--replace-existing')

function argAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const body = (await response.json().catch(() => ({}))) as { data?: unknown; message?: string }
  if (!response.ok) {
    throw new Error(
      `${String(response.status)} ${body.message ?? response.statusText}` +
        `${response.headers.get('x-request-id') ? ` · request ${response.headers.get('x-request-id')}` : ''}`,
    )
  }
  return body.data as T
}

/**
 * Cards laid out top to bottom, wrapping when a row is full.
 *
 * The definitions carry widths and not positions, because a position is a
 * consequence of what came before it and maintaining 55 of them by hand is how
 * two Widgets end up in one cell. Order is the definition's order, which is the
 * guide's order.
 */
/**
 * A card's height in grid rows, from what the widget type actually needs.
 *
 * `h` is rows and a row is 24px, which is not what the first version of this
 * file assumed: it wrote `h: 1` for a stat card and `h: 2` for a chart, giving
 * them 24 and 64 pixels. Every widget on the four created Dashboards was
 * clipped to a sliver — the narrow ones showed nothing at all, and the wide
 * ones showed a title and the top half of an icon.
 *
 * `heightForType` already states what each type wants in pixels and
 * `rowsForPx` is its exact inverse, so neither number is invented here. The
 * definitions keep their widths, which are a layout decision, and no longer
 * carry heights, which are a property of the type.
 */
const heightOf = (card: BoardCard): number => rowsForPx(card.h ?? heightForType(card.typeId))

function place(cards: readonly BoardCard[]): Board['placements'] & { widgetId: string }[] {
  const placements: { widgetId: string; x: number; y: number; w: number; h: number }[] = []
  let x = 0
  let y = 0
  let rowHeight = 0

  cards.forEach((card, index) => {
    const w = Math.min(card.w, DASHBOARD_COLUMNS)
    if (x + w > DASHBOARD_COLUMNS) {
      x = 0
      y += rowHeight
      rowHeight = 0
    }
    const h = heightOf(card)
    placements.push({ widgetId: `local:w${String(index + 1)}`, x, y, w, h })
    x += w
    rowHeight = Math.max(rowHeight, h)
  })

  return placements as never
}

/** A definition as the `Board` the existing adapter already knows how to send. */
export function boardFrom(definition: BoardDefinition): Board {
  const placements = place(definition.cards)
  const widgets = Object.fromEntries(
    definition.cards.map((card, index) => {
      const id = `local:w${String(index + 1)}`
      return [
        id,
        {
          id: `local:w${String(index + 1)}`,
          typeId: card.typeId,
          datasetId: card.datasetId,
          title: card.title,
          mapping: card.mapping as never,
          /*
           * The range first, so a card's own binding wins over the default —
           * nothing overrides `from`/`to` today, but a card that narrowed to a
           * single month should not have it silently replaced.
           */
          parameterBindings: { ...DEFAULT_RANGE, ...card.parameters },
          ...(card.unitOptions ? { unitOptions: card.unitOptions } : {}),
          /*
           * Nothing, deliberately.
           *
           * Every Widget exposed `from` and `to` when these boards were first
           * created, which put twenty native date inputs on the Growth board
           * alone — two per card, above the figure they belonged to. That was
           * the only way to move a period at the time, because a board's date
           * Control could not reach a Widget that bound one.
           *
           * It can now. The Control governs the range across every card, so the
           * per-Widget pickers were a second way of saying the same thing —
           * with the board's answer and twenty local answers free to disagree.
           *
           * Exposure is an Author's choice per Widget rather than a default:
           * a card that genuinely wants its own window can still have one, and
           * paying for it in screen space is the right way round.
           */
          exposedFilters: [],
        },
      ]
    }),
  )

  return {
    id: `local:${definition.name.toLowerCase()}`,
    name: definition.name,
    description: definition.description,
    authorId: '',
    status: 'draft',
    scope: { kind: 'personal' },
    shareGrants: [],
    updated: new Date().toISOString().slice(0, 10),
    widgets,
    placements,
    /*
     * One period for the board, which is what replaces the per-Widget pickers.
     *
     * A Control stores no value — `ControlValues` is session state, so it opens
     * empty and governs nothing until a Viewer sets it. Until then each Widget
     * uses the range it carries as a default, which is the same range they all
     * carry, so the board opens showing exactly what it showed before.
     *
     * That also means `boardPeriod` is undefined on a freshly loaded board, so
     * a Widget added before anyone touches the Control inherits nothing and its
     * Author states a range. Worth a stored default on the Control; that is a
     * domain change rather than part of this one.
     */
    controls: [dateRangeControl('c-period', 'Period')],
    sections: [],
  } as Board
}

interface ApiDashboard {
  id: string
  name: string
  widgets?: { id?: string }[]
}

async function main(): Promise<void> {
  if (TOKEN === '') {
    console.error(
      'Set ANALYTICS_TOKEN.\n' +
        "  copy(JSON.parse(localStorage.getItem('smc.analytics.auth.v1')).accessToken)",
    )
    process.exit(2)
  }

  console.log(`${WRITE ? 'Creating' : 'Dry run'} against ${base()}\n`)

  const existing = await call<{ dashboards?: ApiDashboard[] } | ApiDashboard[]>('/v1/dashboards')
  const boards = Array.isArray(existing) ? existing : (existing.dashboards ?? [])
  const byName = new Map(boards.map((board) => [board.name, board]))

  let skipped = 0

  for (const definition of PENIREMIT_BOARDS) {
    /*
     * Widget ids are never sent.
     *
     * `Widget.id` is documented as "assigned on save when absent", and sending
     * our own put `local:w-4klw2vxzdo` into their stored Dashboards once
     * already. `local:` marks a record the API has never seen, and the resolver
     * drops anything carrying it — the same rule `http-board-store.ts` applies.
     *
     * Safe on update too, because PATCH *"replaces the … Widgets"*: the whole
     * set is rewritten from the definition, which is what a definition-driven
     * board should mean. Nothing is being matched up, so nothing needs an id to
     * match on.
     */
    const payload = dashboardInputFrom(boardFrom(definition), (clientId) =>
      clientId.startsWith('local:') ? undefined : clientId,
    )
    const already = byName.get(definition.name)
    const action = !already ? 'create' : REPLACE ? 'replace' : 'skip'

    if (already && action === 'skip') {
      skipped += 1
      console.log(
        `  skip    ${definition.name.padEnd(12)} exists as ${already.id}` +
          ' — its layout is the board\'s, not this file\'s',
      )
      continue
    }

    if (!WRITE) {
      console.log(
        `  would ${action.padEnd(7)} ${definition.name.padEnd(12)} ` +
          `${String(payload.widgets.length).padStart(2)} widgets` +
          `${already ? ` → ${already.id}` : ''}`,
      )
      continue
    }

    try {
      const saved = already
        ? await call<ApiDashboard>(`/v1/dashboards/${already.id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await call<ApiDashboard>('/v1/dashboards', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
      console.log(
        `  ${action}d ${definition.name.padEnd(12)} ${String(payload.widgets.length).padStart(2)} widgets → ${saved.id}`,
      )
    } catch (error) {
      console.error(`  FAILED ${definition.name.padEnd(12)} ${String(error)}`)
    }
  }

  if (skipped > 0 && !REPLACE) {
    console.log(
      `\n${String(skipped)} board${skipped === 1 ? '' : 's'} left alone. A board that exists has been` +
        '\narranged since it was made, and updating replaces every widget position' +
        '\nwith the one this file computes.' +
        '\n\nPass --replace-existing only if you mean to discard those arrangements.',
    )
  }

  if (!WRITE) {
    console.log('\nNothing was written. Re-run with --create to apply.')
  }
}

/*
 * Only when run, never when imported. `boardFrom` is exercised by
 * `create-boards.test.ts`, and a module that creates Dashboards as a side
 * effect of being imported is a module nothing can test.
 */
if (import.meta.main) await main()
