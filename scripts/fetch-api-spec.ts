/**
 * Refresh the upstream API snapshot.
 *
 *   bun run scripts/fetch-api-spec.ts
 *
 * `docs/upstream/analytics-api.json` is a committed copy of the deployed
 * Analytics API's OpenAPI document, trimmed to what `conformance.test.ts` reads.
 * Committing it is deliberate: the test asserts our types still line up with
 * theirs, and a test that reaches the network is a test that fails on a train.
 * So the network lives here, in a script somebody runs, and the assertions run
 * offline against the result.
 *
 * When this rewrites the file, the diff is the upstream change — which is the
 * only reliable notice we get. Run it before starting adapter work, and read
 * what moved.
 *
 * Trimmed rather than stored whole because the full document is 76KB, most of it
 * prose we would never assert against, and a snapshot nobody can read the diff
 * of is a snapshot nobody refreshes.
 */

const SOURCE = 'https://api.dev.analytics.penilabs.com/documentation/openapi.json'
const OUT = new URL('../docs/upstream/analytics-api.json', import.meta.url).pathname

interface Operation {
  summary?: string
  responses?: Record<string, unknown>
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

const response = await fetch(SOURCE, { headers: { Accept: 'application/json' } })
if (!response.ok) {
  console.error(`${SOURCE} answered ${response.status}`)
  process.exit(1)
}

const spec = (await response.json()) as {
  openapi: string
  info: Record<string, unknown>
  paths: Record<string, Record<string, Operation>>
  components: { schemas: Record<string, unknown>; securitySchemes?: Record<string, unknown> }
}

const paths = Object.fromEntries(
  Object.entries(spec.paths).map(([path, operations]) => [
    path,
    Object.fromEntries(
      Object.entries(operations)
        .filter(([method]) => (METHODS as readonly string[]).includes(method))
        .map(([method, operation]) => [
          method,
          { summary: operation.summary ?? null, responses: Object.keys(operation.responses ?? {}).sort() },
        ]),
    ),
  ]),
)

const trimmed = {
  openapi: spec.openapi,
  info: { title: spec.info.title, version: spec.info.version },
  paths,
  components: {
    schemas: spec.components.schemas,
    securitySchemes: spec.components.securitySchemes ?? {},
  },
}

const before = await Bun.file(OUT)
  .text()
  .catch(() => '')
const after = `${JSON.stringify(trimmed, null, 2)}\n`

await Bun.write(OUT, after)

const schemas = Object.keys(spec.components.schemas).length
console.log(
  `${trimmed.info.title} ${trimmed.info.version} — ${Object.keys(paths).length} paths, ${schemas} schemas`,
)
console.log(before === after ? 'unchanged' : before === '' ? 'created' : 'CHANGED — read the diff')
