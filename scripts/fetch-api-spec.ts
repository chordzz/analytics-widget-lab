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

import { requireBaseUrl } from './api-base'

const SOURCE = `${requireBaseUrl(Bun.argv[2] === '--base' ? Bun.argv[3] : undefined)}/documentation/openapi.json`
const OUT = new URL('../docs/upstream/analytics-api.json', import.meta.url).pathname

interface Operation {
  summary?: string
  responses?: Record<string, unknown>
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

/**
 * What a success puts in `data`, in one line.
 *
 * Kept because its absence cost twice. The snapshot recorded which status codes
 * an endpoint answers with and nothing about the body, so the shape of a
 * response could only be learned by reading the live document or by guessing
 * from a schema that looked related — and a wrong guess does not fail, it reads
 * `undefined` and returns nothing. `visualization_types` was read as `types`
 * that way; `share-targets` was read as a flat array when it sends
 * `{ users, departments }`, and every search came back empty in silence.
 *
 * A line rather than the schema: the point is that a rename shows up in the
 * diff somebody reads, not that the file becomes a second copy of the spec.
 */
function dataShape(operation: Operation): string | null {
  const success = (operation.responses ?? {})['200'] ?? (operation.responses ?? {})['201']
  const schema = (success as SchemaCarrier | undefined)?.content?.['application/json']?.schema
  if (!schema) return null

  const carrier = schema.allOf?.find((member) => member.properties?.data) ?? schema
  return describe(carrier.properties?.data)
}

function describe(node: SchemaNode | undefined): string | null {
  if (!node) return null
  if (node.$ref) return refName(node.$ref)
  if (node.type === 'array') {
    const item = describe(node.items)
    return item === null ? 'array' : `${item}[]`
  }
  if (node.properties) return `{ ${Object.keys(node.properties).sort().join(', ')} }`
  return node.type ?? null
}

const refName = (ref: string): string => ref.slice(ref.lastIndexOf('/') + 1)

interface SchemaNode {
  $ref?: string
  type?: string
  items?: SchemaNode
  properties?: Record<string, SchemaNode>
  allOf?: SchemaNode[]
}

interface SchemaCarrier {
  content?: Record<string, { schema?: SchemaNode }>
}

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
          {
            summary: operation.summary ?? null,
            responses: Object.keys(operation.responses ?? {}).sort(),
            data: dataShape(operation),
          },
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
