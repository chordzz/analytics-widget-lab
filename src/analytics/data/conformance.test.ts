/**
 * Our types against the deployed API's — Alignment §8, item 2.
 *
 * Read from `docs/upstream/analytics-api.json`, a committed snapshot refreshed
 * by `scripts/fetch-api-spec.ts`. Offline on purpose: a conformance test that
 * reaches the network fails on a train and passes when the service is down,
 * which is the opposite of what a gate should do. The network is in the script;
 * the assertions are here, and the snapshot's diff is the notice.
 *
 * The point is not that everything matches — the register says plainly that a
 * good deal does not. The point is that **every mismatch is one we have written
 * down.** So each assertion below either pins an agreement, or names the
 * divergence that explains the disagreement. An undocumented difference is what
 * fails.
 */

import { describe, expect, test } from 'bun:test'
import spec from '../../../docs/upstream/analytics-api.json'
import { DIVERGENCES } from '../../contract-docs/divergences'
import { WIDGET_RENDER_STATUSES } from '../../../src/retrieval/render-state'
import { FIELD_SEMANTICS } from '../../domain/dataset'

const schemas = spec.components.schemas as Record<string, { enum?: string[]; properties?: Record<string, unknown>; required?: string[] }>
const enumOf = (name: string): string[] => {
  const found = schemas[name]?.enum
  if (!found) throw new Error(`no enum \`${name}\` in the snapshot — refresh it`)
  return found
}
const propsOf = (name: string): string[] => Object.keys(schemas[name]?.properties ?? {})

/** What a successful call puts in `data`, as the snapshot records it. */
const dataOf = (path: string, method = 'get'): string => {
  const found = (spec.paths as Record<string, Record<string, { data?: string | null }>>)[path]?.[
    method
  ]
  if (!found) throw new Error(`no ${method.toUpperCase()} ${path} in the snapshot — refresh it`)
  return found.data ?? 'nothing'
}

/**
 * Every test below asserts a shape the API still has. What changes as work lands
 * is not the API but our relationship to it, so a cited entry is checked against
 * one of two claims rather than one.
 */
const registered = (id: string) => {
  const entry = DIVERGENCES.find((candidate) => candidate.id === id)
  expect(entry, `${id} is cited here but missing from the register`).toBeDefined()
  return entry!
}

/**
 * The API still differs and we no longer do: an adapter translates it.
 *
 * Worth asserting rather than dropping the citation. The API's shape is exactly
 * as it was — these tests still guard it — and a resolved entry has to say where
 * the translation lives, or "resolved" is just a word.
 */
const translated = (id: string) => {
  const entry = registered(id)
  expect(entry.status, `${id} is cited as translated but is not resolved`).toBe('resolved')
  expect(entry.endedAt, `${id} is resolved but does not say where`).toBeTruthy()
  return entry
}

describe('the snapshot is the version we reviewed', () => {
  test('title and version', () => {
    // If this fails the API moved under us, and every expectation below is
    // suspect rather than merely stale. Refresh and read the diff before
    // touching anything else.
    expect(spec.info.title).toBe('SMC DAO, Analytics API')
    expect(spec.info.version).toBe('2.0.0')
  })

  test('the endpoints the adapter will call still exist', () => {
    for (const path of [
      '/v1/datasets',
      '/v1/datasets/{datasetId}',
      '/v1/datasets/{datasetId}/query',
      '/v1/datasets/{datasetId}/presentation',
      '/v1/dashboards',
      '/v1/dashboards/{dashboardId}',
      '/v1/dashboards/{dashboardId}/share-grants',
      '/v1/dashboards/{dashboardId}/share-grants/{grantId}',
      '/v1/dashboards/share-targets',
      '/v1/me',
    ]) {
      expect(Object.keys(spec.paths), `${path} has gone`).toContain(path)
    }
  })
})

describe('where we agree, we still agree', () => {
  test('placement is x, y, w, h — D4, arrived at independently', () => {
    expect(propsOf('WidgetLayout').sort()).toEqual(['h', 'w', 'x', 'y'])
  })

  test('a widget binds one dataset and one visualization type', () => {
    // FR-VZ-04. A widget spanning datasets is the thing the invariant forbids,
    // and there is nowhere in their schema to express one either.
    expect(schemas.Widget.required).toContain('dataset_id')
    expect(schemas.Widget.required).toContain('visualization_type')
    expect(propsOf('Widget')).not.toContain('dataset_ids')
  })

  test('a widget carries exposed filters', () => {
    // Merge Stage 6.1, and FR-VZ-06.
    expect(propsOf('Widget')).toContain('exposed_filters')
  })

  test('presentation is ours: opaque to them, per widget and per dashboard', () => {
    /*
     * The assertion that keeps D1 a request rather than a blocker. Our mapping
     * and our Controls live in these two fields. If either ever gained a schema
     * of its own, the slot vocabulary would stop being ours and this should be
     * the first thing to notice.
     */
    expect(propsOf('Widget')).toContain('presentation_options')
    expect(propsOf('Dashboard')).toContain('composition_elements')
    // The description, not the whole object — it also carries
    // `additionalProperties` and a note that every option has a default, and
    // pinning those would fail on a wording change that means nothing to us.
    const options = schemas.Widget.properties!.presentation_options as { description?: string }
    expect(options.description).toContain('opaque to Analytics')
  })

  test('withdrawn has a status code of its own — Finding 7', () => {
    // Our four outcomes are only distinguishable if theirs are. `410` is the
    // one that would most easily have been folded into 404 or an empty 200.
    expect(spec.paths['/v1/datasets/{datasetId}/query'].get.responses).toContain('410')
    expect(spec.paths['/v1/datasets/{datasetId}/query'].get.responses).toContain('403')
    expect(WIDGET_RENDER_STATUSES).toContain('withdrawn')
    expect(WIDGET_RENDER_STATUSES).toContain('denied')
  })
})

describe('where we differ, the register says so', () => {
  test('field roles — D21', () => {
    const theirs = enumOf('FieldRole')
    expect(theirs).toEqual(['dimension', 'measure'])

    // Ours adds `time-dimension`, following FR-DP-06.
    expect(theirs).not.toContain('time-dimension')
    expect(translated('D21').authority).toBe('api')

    // And their way of naming the temporal axis is on the Dataset.
    expect(propsOf('Dataset')).toContain('time_dimension_field')
  })

  test('the query takes filter parameters and nothing else — D22', () => {
    const query = spec.paths['/v1/datasets/{datasetId}/query'].get
    expect(query.summary).toBeTruthy()
    translated('D22')

    // Nothing in their schema set describes a query body, because there is no
    // body: filters are flat query parameters. A `DatasetQuery` schema
    // appearing here would mean D22 had been answered.
    expect(Object.keys(schemas)).not.toContain('DatasetQuery')
  })

  test('widgets are embedded, not referenced — D23', () => {
    const widgets = schemas.Dashboard.properties!.widgets as { items?: { $ref?: string } }
    expect(widgets.items?.$ref).toContain('Widget')
    translated('D23')
  })

  test('filter parameters are declared apart from fields — D24', () => {
    /*
     * Two lists, still. What changed on 15 September is that a Field now states
     * its own `filterable` rather than leaving us to infer it from whether a
     * Parameter of the same name exists — so the lists are no longer collapsed
     * by us, which is the half of D24 that was ours.
     */
    expect(propsOf('Dataset')).toContain('filter_parameters')
    expect(propsOf('FilterParameter')).toContain('allowed_values')
    expect(propsOf('Field')).toContain('filterable')
    expect(propsOf('Field')).toContain('filter_operators')
    translated('D24')
  })

  test('a Field carries its own key and label — the 15 September shape', () => {
    /*
     * The rename that would have broken everything silently. `name` became
     * `key`, and an adapter reading the old name gets `undefined` for every
     * Field key — no error, just Datasets with no usable columns.
     */
    expect(propsOf('Field')).toContain('key')
    expect(propsOf('Field')).toContain('label')
    expect(propsOf('Field')).toContain('orderable')
    expect(propsOf('Field')).not.toContain('name')
    expect(propsOf('Field')).not.toContain('sortable')
  })

  test('a Dataset declares its row grain and its personal data — BE-2, D30', () => {
    // Asked for, and granted. `grain` is the fact an Author could not previously
    // get; `exposes_personal_data` is kept apart from `classification` because a
    // Dataset can be financial *and* personal.
    expect(propsOf('Dataset')).toContain('grain')
    expect(propsOf('Dataset')).toContain('exposes_personal_data')
  })

  test('scope has four levels — D25', () => {
    expect(enumOf('DashboardScopeLevel')).toEqual([
      'personal',
      'department',
      'role',
      'organization',
    ])
    translated('D25')
  })

  test('grant targets are user and department — D26', () => {
    expect(enumOf('ShareGrantTarget')).toEqual(['user', 'department'])
    translated('D26')
  })

  test('every response is enveloped — D27', () => {
    expect(propsOf('Envelope').sort()).toEqual(['data', 'message', 'status'])
    translated('D27')
  })

  test('the two extremes are spelled out now — D29 closed', () => {
    /*
     * This asserted the opposite until 15 September, when the API adopted
     * `minimum` and `maximum`. Worth keeping rather than deleting: an
     * aggregation we do not recognise falls through the reducer to a silent
     * zero, which looks exactly like an empty column, so the day this changes
     * again is a day to find out from a test.
     */
    const theirs = enumOf('Aggregation')
    expect(theirs).toContain('minimum')
    expect(theirs).toContain('maximum')
    expect(theirs).not.toContain('min')
  })

  test('the same six operations, whatever they are called — D29', () => {
    // The reason the rename is safe: the sets correspond one to one, so the
    // adapter is a lookup rather than a decision. A seventh on either side
    // would make it a decision, and this is where that would surface.
    expect(enumOf('Aggregation')).toHaveLength(6)
  })

  test('a location is one flat type, not a distinguishable pair — Finding 15', () => {
    /*
     * The Finding restated as an assertion. `location` covers a region name and
     * a coordinate, and a point map needs to know which — and needs two of
     * them. If this ever gains `latitude`/`longitude`, or a semantic modifier,
     * Finding 15 has landed and this test should be the thing that notices.
     */
    const types = enumOf('FieldType')
    expect(types).toContain('location')
    expect(types.filter((name) => name.includes('lat'))).toEqual([])
    expect(types.filter((name) => name.includes('geo'))).toEqual([])
  })
})

describe('the register does not cite an API schema that has gone', () => {
  test('every API clause names a real path or schema', () => {
    /*
     * The guard that makes the snapshot worth committing. An entry citing
     * `API: schema Foo` is a claim about their document, and a claim nobody
     * rechecks is how a register rots: the divergence gets fixed upstream, the
     * entry stays open, and someone plans work around it.
     */
    const known = new Set([...Object.keys(schemas), ...Object.keys(spec.paths)])

    for (const entry of DIVERGENCES.filter((candidate) => candidate.authority === 'api')) {
      const cited = entry.clause.replace(/^API:\s*/, '')
      const target = cited.startsWith('schema ')
        ? cited.slice('schema '.length).split('.')[0]
        : cited.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, '')

      expect(known, `${entry.id} cites \`${target}\`, which is not in the snapshot`).toContain(
        target,
      )
    }
  })
})

/**
 * The asks that shipped, pinned to the shape they shipped in.
 *
 * Each of these was built here against a *proposal* and adopted upstream
 * later. That is exactly the situation in which a rename goes unnoticed: the
 * field simply stops arriving, the optional reader returns nothing, and the
 * feature quietly does not work — which is how `visualization_types` spent
 * weeks being read as `types`.
 */
describe('what the backend adopted, in the shape we read it', () => {
  test('FieldSemantic carries exactly the six we accept — BE-1', () => {
    /*
     * Compared as sets against a list the union cannot drift from. A value
     * added upstream is a Family we could offer and do not; one removed is a
     * Dataset we would treat as geographic that no longer is.
     */
    expect([...enumOf('FieldSemantic')].sort()).toEqual([...FIELD_SEMANTICS].sort())
  })

  test('a Field carries `semantic`, or nothing here can read one', () => {
    expect(propsOf('Field')).toContain('semantic')
  })

  test('TimeRange names its two ends the way the adapter reads them — BE-8', () => {
    /*
     * `timeRangeFrom` takes the range only when all three are present, so a
     * rename does not fail loudly — it silently declines every range and every
     * board falls back to guessing `from`/`to`, which is the guessing this
     * endpoint exists to remove.
     */
    expect([...propsOf('TimeRange')].sort()).toEqual(['field', 'from_parameter', 'to_parameter'])
    expect(schemas.TimeRange?.required?.slice().sort()).toEqual([
      'field',
      'from_parameter',
      'to_parameter',
    ])
    expect(propsOf('Dataset')).toContain('time_range')
  })

  test('RecordVolume is the four magnitudes the threshold is drawn across', () => {
    // `recordVolumeFrom` maps thousands/millions to `many` and the other two to
    // `few`. A fifth value would fall through as "nobody said".
    expect([...enumOf('RecordVolume')].sort()).toEqual(
      ['millions', 'single-row', 'tens', 'thousands'].sort(),
    )
    expect(propsOf('Dataset')).toContain('record_volume')
  })

  test('a Share Grant carries the id a revoke is addressed by', () => {
    // Without `id` there is no DELETE path to build, and the store falls back
    // to reporting that access was not withdrawn.
    expect(propsOf('ShareGrant')).toContain('id')
    expect(propsOf('ShareGrant')).toContain('target_type')
    expect(propsOf('ShareGrant')).toContain('target_ref')
  })

  test('a share target hands back what a Grant needs, unbuilt', () => {
    // The panel passes `target_type`/`target_ref` straight through. Deriving
    // either from something else is how a tickable name grants nothing.
    expect(propsOf('ShareCandidate')).toContain('target_type')
    expect(propsOf('ShareCandidate')).toContain('target_ref')
  })

  test('the taxonomy still keys its types as `visualization_types`', () => {
    // The one that was actually wrong in the published schema for weeks, read
    // as `types` on our side and silently returning nothing.
    expect(propsOf('PresentationOption')).toContain('visualization_types')
  })
})

/**
 * The body shape each adapter reads, not just the fields inside it.
 *
 * This is the layer both silent failures came through, and neither was visible
 * in a schema: `visualization_types` was read as `types`, and `share-targets`
 * was read as a flat array when it sends two named lists. In both cases the
 * reader found nothing, returned an empty result, and looked exactly like an
 * endpoint with nothing to say. `Array.isArray` on an object is false, and
 * `undefined` has no length.
 *
 * So the *envelope* is asserted as well as its contents. A reshaped response
 * now fails here rather than emptying a panel.
 */
describe('the body is shaped the way the adapter unwraps it', () => {
  test('share targets arrive as two named lists, not one array', () => {
    expect(dataOf('/v1/dashboards/share-targets')).toBe('{ departments, users }')
  })

  test('share grants arrive named, not as the bare shape a POST echoes back', () => {
    /*
     * Was `ShareGrant[]`. The listing grew `target_name`/`target_email` after
     * we raised that a Grant came back with no name to show — a different
     * schema from what creating one returns, because only the listing needs a
     * name: a POST echoes back what the Author just supplied.
     */
    expect(dataOf('/v1/dashboards/{dashboardId}/share-grants')).toBe('ShareGrantListing[]')
  })

  test('creating a grant answers with the grant, which is where its id comes from', () => {
    expect(dataOf('/v1/dashboards/{dashboardId}/share-grants', 'post')).toBe('ShareGrant')
  })

  test('the taxonomy is a list of presentation options', () => {
    expect(dataOf('/v1/visualizations')).toBe('PresentationOption[]')
  })

  test('the catalogue is a list of datasets', () => {
    expect(dataOf('/v1/datasets')).toBe('Dataset[]')
  })
})
