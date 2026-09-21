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
 *
 * The token is your own access token — the `access_token` from sign-in, which
 * the browser holds in `localStorage` under `smc.analytics.auth.v1`. It is read
 * from the environment and never written anywhere.
 *
 * Exit code is the number of checks that did not pass, so CI can use it.
 */

const BASE =
  argAfter('--base') ?? process.env.ANALYTICS_BASE_URL ?? 'https://api.dev.analytics.penilabs.com'
const TOKEN = process.env.ANALYTICS_TOKEN

type Status = 'pass' | 'fail' | 'skip'
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
  status?: string
  fields?: ApiField[]
  grain?: string[]
  record_volume?: string
  time_range?: { field: string; from_parameter: string; to_parameter: string }
  filter_parameters?: { name: string; type: string; allowed_values?: string[] }[]
}

async function main(): Promise<void> {
  if (!TOKEN) {
    console.error(
      'Set ANALYTICS_TOKEN to your access token.\n' +
        'In the browser console on a signed-in tab:\n' +
        "  JSON.parse(localStorage.getItem('smc.analytics.auth.v1')).accessToken\n",
    )
    process.exit(2)
  }

  console.log(`Conformance check against ${BASE}\n`)

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
  let datasets: ApiDataset[] = []
  try {
    const body = await get<{ datasets?: ApiDataset[] } | ApiDataset[]>('/v1/datasets')
    datasets = Array.isArray(body) ? body : (body.datasets ?? [])
    record('—', 'GET /v1/datasets', 'pass', `${String(datasets.length)} declarations`)
  } catch (error) {
    record('—', 'GET /v1/datasets', 'fail', String(error))
  }

  /*
   * A field being *accepted* is not the same as a field being *used*. These
   * report how many live Datasets actually carry each one, because a schema
   * that allows `semantic` and a catalogue where nobody declares one leave the
   * five Families exactly as unreachable as before.
   */
  const withSemantics = datasets.filter((d) => d.fields?.some((f) => f.semantic))
  record(
    'BE-1',
    'Fields declare `semantic`',
    withSemantics.length > 0 ? 'pass' : 'skip',
    withSemantics.length > 0
      ? `${String(withSemantics.length)}/${String(datasets.length)} Datasets · ${[
          ...new Set(datasets.flatMap((d) => d.fields ?? []).map((f) => f.semantic).filter(Boolean)),
        ].join(', ')}`
      : 'accepted by the schema, declared by nobody yet — the Families stay unreachable',
  )

  const withVolume = datasets.filter((d) => d.record_volume)
  record(
    'BE-1b',
    'Datasets declare `record_volume`',
    withVolume.length > 0 ? 'pass' : 'skip',
    withVolume.length > 0
      ? `${String(withVolume.length)}/${String(datasets.length)} · ${[...new Set(withVolume.map((d) => d.record_volume))].join(', ')}`
      : 'no Dataset declares one, so Distribution is offered to none',
  )

  const withRange = datasets.filter((d) => d.time_range)
  record(
    'BE-8',
    'Datasets declare `time_range`',
    withRange.length > 0 ? 'pass' : 'skip',
    withRange.length > 0
      ? withRange
          .map((d) => `${d.id}: ${d.time_range!.from_parameter}/${d.time_range!.to_parameter}`)
          .join(' · ')
      : 'none declared — a range control still reaches only `from`/`to`',
  )

  const categoryParams = datasets.flatMap((d) =>
    (d.filter_parameters ?? []).filter((p) => p.type === 'category').map((p) => ({ id: d.id, p })),
  )
  const emptyCategories = categoryParams.filter(({ p }) => !p.allowed_values?.length)
  record(
    'BE-3',
    'every category parameter publishes `allowed_values`',
    categoryParams.length === 0 ? 'skip' : emptyCategories.length === 0 ? 'pass' : 'fail',
    categoryParams.length === 0
      ? 'no category parameters in the catalogue to check'
      : emptyCategories.length === 0
        ? `${String(categoryParams.length)} category parameters, all populated`
        : `empty: ${emptyCategories.map(({ id, p }) => `${id}.${p.name}`).join(', ')}`,
  )

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
    record('BE-7', 'GET share-targets', 'fail', String(error))
  }

  /*
   * `/presentation` against our own evaluation, per Dataset. The backend
   * published its rules for the eight structural Families and said a
   * disagreement is a bug in one of us — this is where one would show up.
   */
  for (const dataset of datasets.slice(0, 5)) {
    try {
      const presentation = await get<{
        presentation_options?: { family: string }[]
        data_shape?: Record<string, unknown>
      }>(`/v1/datasets/${encodeURIComponent(dataset.id)}/presentation`)
      const families = (presentation.presentation_options ?? []).map((o) => o.family).sort()

      const { datasetFrom } = await import('../src/catalogue/api-dataset')
      const { satisfies } = await import('../src/visualization/data-shape')
      const { visualizationFamilies } = await import('../src/visualization/families')

      /*
       * With semantics on. They were `proposed` when the flag was named and
       * the API has since published them, so evaluating without would compare
       * their answer against a question we no longer ask — and report five
       * disagreements that are our own switch, not their bug.
       */
      const ours = visualizationFamilies
        .filter(
          (family) =>
            satisfies(datasetFrom(dataset as never), family.dataShape, {
              useProposedSemantics: true,
            }).status === 'satisfied',
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
  const mark = { pass: '  ok  ', fail: ' FAIL ', skip: ' n/a  ' }
  for (const check of checks) {
    console.log(`[${mark[check.status]}] ${check.ask.padEnd(6)} ${check.what}`)
    console.log(`                  ${check.detail}`)
  }

  const failed = checks.filter((c) => c.status === 'fail').length
  const skipped = checks.filter((c) => c.status === 'skip').length
  console.log(
    `\n${String(checks.length - failed - skipped)} passed · ${String(failed)} failed · ${String(skipped)} not applicable`,
  )
  if (skipped > 0) {
    console.log(
      'Not applicable means the API accepts the field and no live Dataset uses it.\n' +
        'That is a publisher gap, not an API one — and it leaves the capability as\n' +
        'unreachable as if the field did not exist.',
    )
  }
  process.exit(failed)
}

await main()
