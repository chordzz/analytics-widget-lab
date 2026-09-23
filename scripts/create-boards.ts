/**
 * Creates Peniremit's four Dashboards from their definitions.
 *
 *   ANALYTICS_TOKEN=... bun run scripts/create-boards.ts            # dry run
 *   ANALYTICS_TOKEN=... bun run scripts/create-boards.ts --create   # writes
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
import { DASHBOARD_COLUMNS } from '../src/domain/composition'

const BASE =
  argAfter('--base') ?? process.env.ANALYTICS_BASE_URL ?? 'https://api.dev.analytics.penilabs.com'
const TOKEN = (process.env.ANALYTICS_TOKEN ?? '').trim().replace(/^Bearer\s+/i, '').replace(/^['"`]|['"`]$/g, '')
const WRITE = process.argv.includes('--create')

function argAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
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
    placements.push({ widgetId: `local:w${String(index + 1)}`, x, y, w, h: card.h })
    x += w
    rowHeight = Math.max(rowHeight, card.h)
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
          ...(card.parameters ? { parameterBindings: card.parameters } : {}),
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
    controls: [],
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

  console.log(`${WRITE ? 'Creating' : 'Dry run'} against ${BASE}\n`)

  const existing = await call<{ dashboards?: ApiDashboard[] } | ApiDashboard[]>('/v1/dashboards')
  const boards = Array.isArray(existing) ? existing : (existing.dashboards ?? [])
  const byName = new Map(boards.map((board) => [board.name, board]))

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
    const verb = already ? 'update' : 'create'

    if (!WRITE) {
      console.log(
        `  would ${verb.padEnd(6)} ${definition.name.padEnd(12)} ` +
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
        `  ${verb}d ${definition.name.padEnd(12)} ${String(payload.widgets.length).padStart(2)} widgets → ${saved.id}`,
      )
    } catch (error) {
      console.error(`  FAILED ${definition.name.padEnd(12)} ${String(error)}`)
    }
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
