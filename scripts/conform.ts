/**
 * Does the deployed API actually do what it says?
 *
 * The backend reports the asks in `Analytics_BE_Requests.md` as built, and the
 * published spec agrees. A spec is a claim: it is written by hand beside the
 * code and can be wrong about it — that is not hypothetical here, since
 * `PresentationOption` documented `types` while the API sent
 * `visualization_types`, and following the document is what broke our taxonomy
 * validation for six days without a single error.
 *
 * So this asks the running service instead, with real credentials, and reports
 * what came back. It reads only; it publishes, saves and revokes nothing.
 *
 *   ANALYTICS_TOKEN=... bun run scripts/conform.ts
 *   ANALYTICS_TOKEN=... bun run scripts/conform.ts --base https://…
 *   ANALYTICS_TOKEN=... bun run scripts/conform.ts --dump-catalogue
 *
 * `--dump-catalogue` writes Peniremit's live declarations to
 * `src/boards/peniremit-catalogue.generated.ts`. The boards bind against a
 * catalogue that was transcribed from a PDF, and a transcribed declaration is
 * a guess: this one claimed a Dataset had no `status` parameter when it has
 * one, which sent a working card down a worse route. Without the flag the run
 * still *compares* the two and fails on any difference, because a stale
 * transcription is otherwise silent — every board validates against it, and
 * the first sign of trouble is a Widget that 400s in front of someone.
 *
 * The token is your own access token — the `access_token` from sign-in, which
 * the browser holds in `localStorage` under `smc.analytics.auth.v1`. It is read
 * from the environment and never written anywhere.
 *
 * Exit code is the number of checks that did not pass, so CI can use it.
 */

const BASE =
  argAfter('--base') ?? process.env.ANALYTICS_BASE_URL ?? 'https://api.dev.analytics.penilabs.com'

/**
 * The token, cleaned of the ways a copy out of a browser console arrives wrong.
 *
 * Dev tools render a string result *with its quotes* — `'eyJhbGci…'` — and
 * selecting the line takes them with it. `Bearer 'eyJ…'` is then rejected as
 * an invalid token, which is indistinguishable from an expired one in the
 * response and was not distinguishable in this script either.
 *
 * Stripping is better than warning about it. The characters removed here —
 * quotes, whitespace, a `Bearer ` prefix — cannot occur inside a JWT, so
 * nothing valid is altered.
 */
const TOKEN = (process.env.ANALYTICS_TOKEN ?? '')
  .trim()
  .replace(/^Bearer\s+/i, '')
  .replace(/^['"`]|['"`]$/g, '')
  .trim()

/**
 * What is wrong with the token, without printing it.
 *
 * A 401 says only that the server refused it, and the three reasons behind
 * that want three different actions: expired means read it again, malformed
 * means the copy went wrong, and a foreign issuer means it is for another
 * deployment. A JWT's first two segments are base64url JSON and need no
 * secret to read, so the script can simply look.
 */
function diagnoseToken(token: string): string | null {
  if (token === '') return 'ANALYTICS_TOKEN is empty.'
  if (token === 'undefined' || token === 'null') {
    return (
      `ANALYTICS_TOKEN is the literal string "${token}", which is what the ` +
      'browser read produced.\nThe app may be signed out, or storing tokens ' +
      'under a different key — check that\n`localStorage.getItem(\'smc.analytics.auth.v1\')` ' +
      'is not null on that tab.'
    )
  }

  const segments = token.split('.')
  if (segments.length !== 3) {
    return (
      `That is not a JWT — ${String(segments.length)} dot-separated segment(s), expected 3, ` +
      `${String(token.length)} characters.\nThe copy probably picked up only part of the value.`
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
  } catch {
    return 'The token has three segments but the middle one is not readable JSON.'
  }

  const exp = typeof payload.exp === 'number' ? payload.exp : undefined
  if (exp !== undefined) {
    const secondsAgo = Math.floor(Date.now() / 1000) - exp
    if (secondsAgo > 0) {
      const mins = Math.floor(secondsAgo / 60)
      return (
        `The token expired ${mins < 1 ? 'less than a minute' : `${String(mins)} minutes`} ago ` +
        `(exp ${new Date(exp * 1000).toISOString()}).\n` +
        'The browser tab still works because it silently refreshed and holds a newer one —\n' +
        'so re-read it now and run again within the hour.'
      )
    }
  }

  const issuer = typeof payload.iss === 'string' ? payload.iss : undefined
  return (
    'The token parses and is not expired, so the API refused it for another reason.\n' +
    `  issuer:   ${issuer ?? '(none)'}\n` +
    `  audience: ${JSON.stringify(payload.aud) ?? '(none)'}\n` +
    `  subject:  ${typeof payload.sub === 'string' ? payload.sub : '(none)'}\n` +
    `  target:   ${BASE}\n` +
    'If the issuer names a different deployment, point --base at that one.'
  )
}

/*
 * Four outcomes, not three, and the fourth is the one this script got wrong on
 * its first real run.
 *
 * A check whose prerequisite failed has *not* found nothing — it has not
 * looked, and saying "no Dataset declares one" when the catalogue returned 401
 * reports a conclusion about someone's data drawn from an authentication
 * error. That is the failure this whole codebase is written against: `useRows`
 * turning denied into "no records", an empty taxonomy parse reading as "the
 * endpoint declined". A conformance checker making it is worse than one that
 * does not exist, because its answer looks like evidence.
 *
 *   pass    — asked, and it holds
 *   fail    — asked, and it does not
 *   n/a     — asked, and there was genuinely nothing to check
 *   blocked — never asked; something upstream failed first
 */
type Status = 'pass' | 'fail' | 'skip' | 'blocked'
interface Check {
  /** The ask this belongs to, as the backend document numbers them. */
  ask: string
  what: string
  status: Status
  detail: string
}

const checks: Check[] = []
const record = (ask: string, what: string, status: Status, detail: string) => {
  checks.push({ ask, what, status, detail })
}

function argAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

/** Unwraps the `{status, message, data}` envelope; throws with the message. */
async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${TOKEN ?? ''}`, accept: 'application/json' },
  })
  const body = (await response.json().catch(() => ({}))) as {
    data?: unknown
    message?: string
  }
  if (!response.ok) {
    throw new Error(`${String(response.status)} ${body.message ?? response.statusText}`)
  }
  return body.data as T
}

// --- the checks -------------------------------------------------------------

interface ApiField {
  key: string
  role: string
  semantic?: string
}
interface ApiDataset {
  id: string
  name: string
  description?: string
  status?: string
  time_dimension_field?: string | null
  fields?: ApiField[]
  grain?: string[]
  record_volume?: string
  time_range?: { field: string; from_parameter: string; to_parameter: string }
  filter_parameters?: { name: string; type: string; allowed_values?: string[] }[]
}


// --- generating the catalogue ------------------------------------------------

/**
 * The transcribed catalogue is the thing most likely to be quietly wrong.
 *
 * `src/boards/peniremit-catalogue.ts` was typed out of a PDF, and typing out a
 * declaration is guessing with extra steps: it claimed
 * `peniremit.transaction-count-summary` had no `status` parameter, which sent a
 * working card down a worse route and produced a wrong bug report for the
 * publisher. Nothing in the repository could have caught it, because both the
 * board and the check read the same transcription.
 *
 * So generate it. What the API returns is the declaration by definition, and a
 * file written from it cannot disagree with the thing it describes.
 */
const shapeOf = (dataset: ApiDataset): 'aggregate' | 'date' | 'category' => {
  // An empty grain is the endpoint saying it answers with one summary row —
  // meaningful, and distinct from an absent grain, which says nothing.
  if (dataset.grain?.length === 0) return 'aggregate'
  if (dataset.time_dimension_field) return 'date'
  return 'category'
}

const quote = (value: string) => `'${value.replace(/'/g, "\\'")}'`
const list = (values: readonly string[]) => `[${values.map(quote).join(', ')}]`

function renderCatalogue(datasets: readonly ApiDataset[]): string {
  const entries = [...datasets]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((dataset) => {
      const shape = shapeOf(dataset)
      const keys = (dataset.fields ?? []).map((field) => field.key)
      const additive = (dataset.fields ?? [])
        .filter((field) => field.semantic === 'additive-total')
        .map((field) => field.key)
      // `from`/`to` are on every Dataset and live in BASE_PARAMS; `granularity`
      // is implied by the shape. Everything else has to be stated.
      const params = (dataset.filter_parameters ?? [])
        .map((parameter) => parameter.name)
        .filter((name) => !['from', 'to', 'granularity'].includes(name))

      const extra: string[] = []
      if (additive.length > 0) extra.push(`additive: ${list(additive)}`)
      if (params.length > 0) extra.push(`params: ${list(params)}`)

      const id = dataset.id.replace(/^peniremit\./, '')
      return (
        `  d(${quote(id)}, ${quote(dataset.name)}, ${quote(shape)}, ${list(keys)}` +
        `${extra.length > 0 ? `, { ${extra.join(', ')} }` : ''}),`
      )
    })

  return [
    '/**',
    ' * GENERATED — do not edit.',
    ' *',
    ` * Written by \`bun run conform --dump-catalogue\` from ${BASE}`,
    ` * on ${new Date().toISOString().slice(0, 10)}, reading ${String(datasets.length)} published Datasets.`,
    ' *',
    ' * Regenerate rather than correcting by hand. The previous version of this',
    ' * file was transcribed from a PDF and was wrong about a filter parameter in',
    ' * the direction that hides a working card.',
    ' */',
    '',
    "import { d, type PeniremitDataset } from './peniremit-catalogue-shape'",
    '',
    'export const PENIREMIT_DATASETS: PeniremitDataset[] = [',
    ...entries,
    ']',
    '',
  ].join('\n')
}

/**
 * What the live declarations say that the transcription does not.
 *
 * Reported as a check rather than only written to a file, because a stale
 * transcription is silent: every board still validates against it, and the
 * first sign of trouble is a Widget that 400s in front of a user.
 */
async function compareCatalogue(live: readonly ApiDataset[]): Promise<void> {
  const { PENIREMIT_DATASETS } = await import('../src/boards/peniremit-catalogue')
  const ours = new Map(PENIREMIT_DATASETS.map((entry) => [entry.id, entry]))

  const drift: string[] = []
  for (const dataset of live) {
    const mine = ours.get(dataset.id)
    if (!mine) {
      drift.push(`${dataset.id}: published, absent from the catalogue`)
      continue
    }

    const liveKeys = (dataset.fields ?? []).map((field) => field.key).join(',')
    if (liveKeys !== mine.keys.join(',')) {
      drift.push(`${dataset.id}: fields — live ${liveKeys || '(none)'}, ours ${mine.keys.join(',')}`)
    }

    const liveParams = (dataset.filter_parameters ?? [])
      .map((parameter) => parameter.name)
      .filter((name) => !['from', 'to'].includes(name))
      .sort()
    const ourParams = [...(mine.params ?? [])].sort()
    if (liveParams.join(',') !== ourParams.join(',')) {
      drift.push(
        `${dataset.id}: parameters — live ${liveParams.join(',') || '(none beyond from/to)'}, ` +
          `ours ${ourParams.join(',') || '(none)'}`,
      )
    }

    const liveAdditive = (dataset.fields ?? [])
      .filter((field) => field.semantic === 'additive-total')
      .map((field) => field.key)
      .sort()
    const ourAdditive = [...(mine.additive ?? [])].sort()
    if (liveAdditive.join(',') !== ourAdditive.join(',')) {
      drift.push(
        `${dataset.id}: additive — live ${liveAdditive.join(',') || '(none)'}, ` +
          `ours ${ourAdditive.join(',') || '(none)'}`,
      )
    }
  }

  const missing = PENIREMIT_DATASETS.filter(
    (entry) => !live.some((dataset) => dataset.id === entry.id),
  ).map((entry) => entry.id)
  for (const id of missing) drift.push(`${id}: in the catalogue, not published`)

  record(
    'catalogue',
    'the transcribed catalogue matches the live declarations',
    drift.length === 0 ? 'pass' : 'fail',
    drift.length === 0
      ? `${String(live.length)} Datasets agree on fields, parameters and semantics`
      : `${String(drift.length)} differences:\n                  ${drift.join('\n                  ')}`,
  )
}


/**
 * Whether the caller holds a permission, according to `/v1/me`.
 *
 * Three answers, because `absent means unknown, not denied` — IAM being
 * degraded must not read as a caller who may do nothing. `/v1/me` returns
 * fully-qualified keys (`holdings.analytics::dashboard.share`) and the API
 * documents the short form, so the comparison is on the part after `::`.
 */
function holds(
  permissions: Record<string, boolean> | undefined,
  key: string,
): 'granted' | 'denied' | 'unknown' {
  if (!permissions || Object.keys(permissions).length === 0) return 'unknown'
  const bare = (name: string) => {
    const marker = name.lastIndexOf('::')
    return marker === -1 ? name : name.slice(marker + 2)
  }
  const held = new Map(Object.entries(permissions).map(([name, value]) => [bare(name), value === true]))
  const value = held.get(bare(key))
  return value === undefined ? 'denied' : value ? 'granted' : 'denied'
}

async function main(): Promise<void> {
  if (TOKEN === '') {
    console.error(
      'Set ANALYTICS_TOKEN to your access token.\n' +
        'In the browser console on a signed-in tab:\n' +
        "  copy(JSON.parse(localStorage.getItem('smc.analytics.auth.v1')).accessToken)\n" +
        '`copy()` puts the bare value on the clipboard, without the quotes the\n' +
        'console draws around a string result.\n',
    )
    process.exit(2)
  }

  console.log(`Conformance check against ${BASE}\n`)

  /*
   * What this caller may do, reported before anything that could be refused
   * for lacking it. Every 403 below is then read against a published fact
   * rather than guessed at — which is how a held `dashboard.share` came to be
   * reported as missing.
   */
  const REQUIRED = ['dashboard.read', 'dashboard.create', 'dashboard.share', 'dataset.read']

  /*
   * One call first, purely to tell a bad token from a broken API. Without it a
   * 401 is reported five times as five separate failures, which reads as the
   * backend having removed five things — the first run of this script said
   * exactly that, and it was one expired token.
   */
  let permissions: Record<string, boolean> | undefined
  try {
    const me = await get<{ permissions?: Record<string, boolean> }>('/v1/me')
    permissions = me.permissions
  } catch (error) {
    const message = String(error)
    if (message.includes('401')) {
      console.error('The token was refused — every check would fail for that one reason.\n')
      console.error(diagnoseToken(TOKEN) ?? message)
      console.error(
        '\nTo copy it without the quotes the console draws around a string:\n' +
          "  copy(JSON.parse(localStorage.getItem('smc.analytics.auth.v1')).accessToken)",
      )
      process.exit(2)
    }
    console.error(`Could not reach ${BASE}: ${message}`)
    process.exit(2)
  }

  const decisions = REQUIRED.map((key) => [key, holds(permissions, key)] as const)
  const lacking = decisions.filter(([, decision]) => decision !== 'granted')
  record(
    '—',
    'the permissions this run needs',
    permissions === undefined || Object.keys(permissions).length === 0
      ? 'skip'
      : lacking.length === 0
        ? 'pass'
        : 'fail',
    permissions === undefined || Object.keys(permissions).length === 0
      ? '`/v1/me` returned no permission map — absent means unknown, not denied'
      : lacking.length === 0
        ? `holds ${REQUIRED.join(', ')}`
        : `not held: ${lacking.map(([key]) => key).join(', ')}`,
  )

  // --- the one that bit us -------------------------------------------------
  //
  // First because it is the reason this script exists: the property name on the
  // wire, not the one in the schema.
  try {
    const taxonomy = await get<Record<string, unknown>[]>('/v1/visualizations')
    const first = taxonomy[0] ?? {}
    const onWire = 'visualization_types' in first ? 'visualization_types' : 'types' in first ? 'types' : 'neither'
    record(
      'BE-5',
      'the taxonomy array is named what we parse',
      onWire === 'visualization_types' || onWire === 'types' ? 'pass' : 'fail',
      `sends \`${onWire}\` · ${String(taxonomy.length)} families`,
    )

    const ids = taxonomy.flatMap(
      (entry) => (entry.visualization_types ?? entry.types ?? []) as string[],
    )
    const { visualizationTypes } = await import('../src/visualization/visualization-types')
    const ours = new Set(visualizationTypes.map((type) => type.id))
    const theirsOnly = ids.filter((id) => !ours.has(id))
    const oursOnly = [...ours].filter((id) => !ids.includes(id))
    record(
      'BE-4',
      'their Types and ours are the same set',
      theirsOnly.length === 0 && oursOnly.length === 0 ? 'pass' : 'fail',
      theirsOnly.length === 0 && oursOnly.length === 0
        ? `${String(ids.length)} Types agree`
        : `theirs only: ${theirsOnly.join(', ') || 'none'} · ours only: ${oursOnly.join(', ') || 'none'}`,
    )
  } catch (error) {
    record('BE-5', 'GET /v1/visualizations', 'fail', String(error))
  }

  // --- the declaration fields ----------------------------------------------
  //
  // `null` is not `[]`. Every check below reads this, and the difference
  // between "the catalogue holds no Dataset declaring a semantic" and "we never
  // read the catalogue" is the difference between a finding and a lie.
  let datasets: ApiDataset[] | null = null
  try {
    const body = await get<{ datasets?: ApiDataset[] } | ApiDataset[]>('/v1/datasets')
    datasets = Array.isArray(body) ? body : (body.datasets ?? [])
    record('—', 'GET /v1/datasets', 'pass', `${String(datasets.length)} declarations`)
  } catch (error) {
    record('—', 'GET /v1/datasets', 'fail', String(error))
  }

  /*
   * Peniremit's own, which is what the boards bind. A deployment carrying other
   * publishers' Datasets should not have them written into a file named for
   * theirs.
   */
  const peniremit = (datasets ?? []).filter((dataset) => dataset.id.startsWith('peniremit.'))

  if (datasets !== null && peniremit.length > 0) {
    await compareCatalogue(peniremit)

    if (process.argv.includes('--dump-catalogue')) {
      const path =
        argAfter('--dump-catalogue')?.startsWith('--') === false
          ? argAfter('--dump-catalogue')!
          : 'src/boards/peniremit-catalogue.generated.ts'
      await Bun.write(path, renderCatalogue(peniremit))
      console.log(`\nWrote ${String(peniremit.length)} declarations to ${path}`)
      console.log('Review the diff, then point `peniremit-catalogue.ts` at it.\n')
    }
  }

  /**
   * Runs `check` over the catalogue, or records that it could not be run.
   *
   * The wrapper exists so a new check cannot forget: reading `datasets` at all
   * means going through here, and there is no path that treats a missing
   * catalogue as an empty one.
   */
  const overCatalogue = (
    ask: string,
    what: string,
    check: (live: ApiDataset[]) => [Status, string],
  ) => {
    if (datasets === null) {
      record(ask, what, 'blocked', 'the catalogue could not be read — see above')
      return
    }
    if (datasets.length === 0) {
      record(ask, what, 'skip', 'the catalogue is empty — nothing published to check')
      return
    }
    const [status, detail] = check(datasets)
    record(ask, what, status, detail)
  }

  /*
   * A field being *accepted* is not the same as a field being *used*. These
   * report how many live Datasets actually carry each one, because a schema
   * that allows `semantic` and a catalogue where nobody declares one leave the
   * five Families exactly as unreachable as before.
   */
  overCatalogue('BE-1', 'Fields declare `semantic`', (live) => {
    const carrying = live.filter((d) => d.fields?.some((f) => f.semantic))
    const values = [
      ...new Set(live.flatMap((d) => d.fields ?? []).map((f) => f.semantic).filter(Boolean)),
    ]
    return carrying.length > 0
      ? ['pass', `${String(carrying.length)}/${String(live.length)} Datasets · ${values.join(', ')}`]
      : [
          'skip',
          'accepted by the schema, declared by nobody yet — the Families stay unreachable',
        ]
  })

  overCatalogue('BE-1b', 'Datasets declare `record_volume`', (live) => {
    const carrying = live.filter((d) => d.record_volume)
    return carrying.length > 0
      ? [
          'pass',
          `${String(carrying.length)}/${String(live.length)} · ${[...new Set(carrying.map((d) => d.record_volume))].join(', ')}`,
        ]
      : ['skip', 'no Dataset declares one, so Distribution is offered to none']
  })

  overCatalogue('BE-8', 'Datasets declare `time_range`', (live) => {
    const carrying = live.filter((d) => d.time_range)
    return carrying.length > 0
      ? [
          'pass',
          carrying
            .map(
              (d) =>
                `${d.id}: ${d.time_range?.from_parameter ?? '?'}/${d.time_range?.to_parameter ?? '?'}`,
            )
            .join(' · '),
        ]
      : ['skip', 'none declared — a range control still reaches only `from`/`to`']
  })

  overCatalogue('BE-3', 'every category parameter publishes `allowed_values`', (live) => {
    const categories = live.flatMap((d) =>
      (d.filter_parameters ?? []).filter((p) => p.type === 'category').map((p) => ({ id: d.id, p })),
    )
    const empty = categories.filter(({ p }) => !p.allowed_values?.length)
    if (categories.length === 0) {
      return ['skip', 'no category parameters in the catalogue to check']
    }
    return empty.length === 0
      ? ['pass', `${String(categories.length)} category parameters, all populated`]
      : ['fail', `empty: ${empty.map(({ id, p }) => `${id}.${p.name}`).join(', ')}`]
  })

  // --- the routes that did not exist ---------------------------------------
  //
  // Reads only. Listing a Dashboard's grants and searching the directory are
  // both safe; creating or revoking a grant is not this script's business.
  try {
    const boards = await get<{ dashboards?: { id: string }[] } | { id: string }[]>('/v1/dashboards')
    const list = Array.isArray(boards) ? boards : (boards.dashboards ?? [])
    if (list.length === 0) {
      record('BE-6', 'GET share-grants', 'skip', 'no Dashboard to list grants on')
    } else {
      const grants = await get<unknown[]>(`/v1/dashboards/${list[0].id}/share-grants`)
      record('BE-6', 'GET share-grants', 'pass', `${String((grants ?? []).length)} grants on ${list[0].id}`)
    }
  } catch (error) {
    record('BE-6', 'GET share-grants', 'fail', String(error))
  }

  try {
    const targets = await get<{ users?: unknown[]; departments?: unknown[] }>(
      '/v1/dashboards/share-targets?q=a',
    )
    record(
      'BE-7',
      'GET share-targets',
      'pass',
      `${String(targets.users?.length ?? 0)} users · ${String(targets.departments?.length ?? 0)} departments`,
    )
  } catch (error) {
    /*
     * 404 is the ask unbuilt. 403 is the ask built and enforcing — and *why* it
     * refused is a different question from whether it ran, which this script
     * previously answered by guessing.
     *
     * It reported a 403 as "a missing permission on your user
     * (`dashboard.share`)", named the key, and pointed at IAM. That was an
     * inference from a status code, stated as a diagnosis. `/v1/me` publishes
     * the permission map, so the answer is available rather than deducible:
     * when the caller demonstrably holds the key, the refusal is about
     * something else and saying otherwise sends someone to fix a grant that is
     * already there.
     */
    const message = String(error)
    if (!message.includes('403')) {
      record('BE-7', 'GET share-targets', 'fail', message)
    } else {
      const decision = holds(permissions, 'dashboard.share')
      record(
        'BE-7',
        'GET share-targets',
        'fail',
        `the route exists and refused this caller — ${message}\n` +
          '                  ' +
          (decision === 'granted'
            ? '`/v1/me` says you DO hold `dashboard.share`, so this refusal is not\n' +
              '                  about that permission. One to raise with the Analytics team.'
            : decision === 'denied'
              ? '`/v1/me` does not list `dashboard.share` as held — a grant on your\n' +
                '                  user, which is IAM rather than Analytics.'
              : '`/v1/me` returned no permission map, so why it refused cannot be\n' +
                '                  read from here. Absent means unknown, not denied.'),
      )
    }
  }

  /*
   * `/presentation` against our own evaluation, per Dataset. The backend
   * published its rules for the eight structural Families and said a
   * disagreement is a bug in one of us — this is where one would show up.
   */
  if (datasets === null) {
    record('FE-4', 'presentation agrees with our evaluation', 'blocked',
      'the catalogue could not be read — see above')
  }
  for (const dataset of (datasets ?? []).slice(0, 5)) {
    try {
      const presentation = await get<{
        presentation_options?: { family: string }[]
        data_shape?: Record<string, unknown>
      }>(`/v1/datasets/${encodeURIComponent(dataset.id)}/presentation`)
      const families = (presentation.presentation_options ?? []).map((o) => o.family).sort()

      const { datasetFrom } = await import('../src/catalogue/api-dataset')
      const { satisfies } = await import('../src/visualization/data-shape')
      const { visualizationFamilies } = await import('../src/visualization/families')

      const ours = visualizationFamilies
        .filter(
          (family) =>
            satisfies(datasetFrom(dataset as never), family.dataShape).status === 'satisfied',
        )
        .map((family) => family.id)
        .sort()

      /*
       * Two Families are excluded, and the exclusion is not a fudge — the
       * backend published the difference and the reason. `geospatial` still
       * accepts a bare `location` Field and `status` still accepts any Measure,
       * because a threshold turns a number into a state. Both are wider than
       * our semantic test on purpose, so that nothing which worked before stops
       * working.
       *
       * Their words: a disagreement on any of the other eight is a bug in one
       * of us. Those eight are what this compares. Reporting the two known ones
       * every run would train a reader to ignore the output, which is the only
       * way a checker like this actually fails.
       */
      const EXPLAINED = new Set(['geospatial', 'status'])
      const theirsOnly = families.filter((f) => !ours.includes(f) && !EXPLAINED.has(f))
      const oursOnly = ours.filter((f) => !families.includes(f) && !EXPLAINED.has(f))
      const wider = families.filter((f) => !ours.includes(f) && EXPLAINED.has(f))

      record(
        'FE-4',
        `presentation agrees for ${dataset.id}`,
        theirsOnly.length === 0 && oursOnly.length === 0 ? 'pass' : 'fail',
        theirsOnly.length === 0 && oursOnly.length === 0
          ? `${String(families.length)} families agree` +
            (wider.length > 0 ? ` · wider by agreement: ${wider.join(', ')}` : '')
          : `they offer ${theirsOnly.join(', ') || 'nothing extra'} · we offer ${oursOnly.join(', ') || 'nothing extra'}`,
      )
    } catch (error) {
      record('FE-4', `presentation for ${dataset.id}`, 'fail', String(error))
    }
  }

  // --- report --------------------------------------------------------------
  const mark = { pass: '  ok  ', fail: ' FAIL ', skip: ' n/a  ', blocked: ' ---  ' }
  for (const check of checks) {
    console.log(`[${mark[check.status]}] ${check.ask.padEnd(6)} ${check.what}`)
    console.log(`                  ${check.detail}`)
  }

  const count = (status: Status) => checks.filter((c) => c.status === status).length
  const failed = count('fail')
  const blocked = count('blocked')

  console.log(
    `\n${String(count('pass'))} passed · ${String(failed)} failed · ` +
      `${String(count('skip'))} not applicable · ${String(blocked)} not checked`,
  )

  if (count('skip') > 0) {
    console.log(
      '\nNot applicable means the API accepts the field and no live Dataset uses it.\n' +
        'That is a publisher gap, not an API one — and it leaves the capability as\n' +
        'unreachable as if the field did not exist.',
    )
  }
  if (blocked > 0) {
    console.log(
      '\nNot checked means a prerequisite failed, so the question was never asked.\n' +
        'It is not evidence either way. Fix what failed above and run again.',
    )
  }
  process.exit(failed + blocked)
}

await main()
