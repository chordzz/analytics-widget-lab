/**
 * The Visualization Families of §4.2 — the required initial classification.
 *
 * FR-VZ-01: every Visualization Type is classified into a Visualization Family.
 * FR-VZ-02: each Family declares the Data Shape a Dataset must satisfy.
 *
 * Registering all thirteen Families is cheap (this file is metadata) and is
 * P0. Renderers are the expensive part and land incrementally — see the
 * sequencing note in Analytics_Frontend_Plan.md §8.
 */

import { dimensionsOf, measuresOf, timeDimensionsOf } from '../domain/dataset'
import type { Dataset } from '../domain/dataset'
import type { DataShape, DataShapeClause } from './data-shape'

export interface VisualizationFamily {
  id: string
  name: string
  /** The question this Family answers (§4.2). */
  question: string
  dataShape: DataShape
  /** Anything a reviewer should know about how this Family was interpreted. */
  note?: string
}

// --- clause builders -------------------------------------------------------

const plural = (n: number, one: string, many: string) =>
  n === 1 ? `at least one ${one}` : `at least ${n} ${many}`

const minMeasures = (n: number): DataShapeClause => ({
  describe: plural(n, 'Measure', 'Measures'),
  test: (d) => measuresOf(d).length >= n,
})

const minDimensions = (n: number): DataShapeClause => ({
  describe: plural(n, 'Dimension', 'Dimensions'),
  test: (d) => dimensionsOf(d).length >= n,
})

const minTimeDimensions = (n: number): DataShapeClause => ({
  describe: plural(n, 'Time Dimension', 'Time Dimensions'),
  test: (d) => timeDimensionsOf(d).length >= n,
})

const hasSemantic = (dataset: Dataset, semantic: string) =>
  dataset.fields.some((f) => f.semantic === semantic)

// --- the families ----------------------------------------------------------

export const visualizationFamilies: VisualizationFamily[] = [
  {
    id: 'tabular',
    name: 'Tabular',
    question: 'What are the individual records?',
    dataShape: {
      summary: 'One or more Dimensions and/or Measures',
      clauses: [
        {
          describe: 'at least one Field',
          test: (d) => d.fields.length > 0,
        },
      ],
    },
  },

  {
    id: 'trend',
    name: 'Trend',
    question: 'How has this changed over time?',
    dataShape: {
      summary: 'One Time Dimension + one or more Measures',
      clauses: [minTimeDimensions(1), minMeasures(1)],
    },
  },

  {
    id: 'categorical-comparison',
    name: 'Categorical Comparison',
    question: 'How do these categories compare?',
    dataShape: {
      summary: 'One Dimension + one or more Measures',
      clauses: [minDimensions(1), minMeasures(1)],
    },
    note:
      'A Time Dimension is a Dimension per the Definitions table, so it counts here. ' +
      'If this Family is meant to require a non-temporal Dimension, §4.2 should say so.',
  },

  {
    id: 'composition',
    name: 'Composition',
    question: 'What are the parts of this whole?',
    dataShape: {
      summary: 'One Dimension + one Measure summing to a meaningful total',
      clauses: [
        minDimensions(1),
        minMeasures(1),
        {
          describe: 'a Measure that sums to a meaningful total',
          // Additivity is semantic, not structural. Nothing in the published
          // model distinguishes a summable amount from a count of distinct
          // users, where summing double-counts.
          test: () => false,
          testWithSemantics: (d) => hasSemantic(d, 'additive-total'),
          undecidable: {
            requirement:
              '§4.2 requires a Measure "summing to a meaningful total". Additivity is a property of ' +
              'meaning, not of type — FR-DP-04 declares which aggregations are meaningful, but not ' +
              'whether the resulting total is itself meaningful as a whole.',
            resolvedBy: "proposed Field semantic 'additive-total'",
          },
        },
      ],
    },
  },

  {
    id: 'distribution',
    name: 'Distribution',
    question: 'How are these values spread?',
    dataShape: {
      summary: 'One Measure across many records',
      clauses: [
        minMeasures(1),
        {
          describe: 'many records',
          test: () => false,
          testWithSemantics: (d) => d.recordVolume === 'many',
          undecidable: {
            requirement:
              '§4.2 requires the Measure be spread "across many records". Record volume is not part ' +
              'of the published model.',
            resolvedBy: "proposed Dataset descriptor 'recordVolume'",
          },
        },
      ],
    },
  },

  {
    id: 'correlation',
    name: 'Correlation',
    question: 'Do these move together?',
    dataShape: {
      summary: 'Two or more Measures',
      clauses: [minMeasures(2)],
    },
  },

  {
    id: 'ranking-and-flow',
    name: 'Ranking & Flow',
    question: 'What is the order, or where is the drop-off?',
    dataShape: {
      summary: 'One Dimension + one Measure, or ordered stage data',
      clauses: [
        {
          describe: 'one Dimension and one Measure, or a Dimension declared as an ordered stage',
          test: (d) => dimensionsOf(d).length >= 1 && measuresOf(d).length >= 1,
          testWithSemantics: (d) =>
            (dimensionsOf(d).length >= 1 && measuresOf(d).length >= 1) || hasSemantic(d, 'stage'),
          undecidable: {
            requirement:
              '§4.2 admits "ordered stage data" as an alternative shape. Stage ordering is not ' +
              'expressible in the published model, so the funnel/sankey route cannot be evaluated.',
            resolvedBy: "proposed Field semantic 'stage'",
          },
        },
      ],
    },
  },

  {
    id: 'geospatial',
    name: 'Geospatial',
    question: 'Where is this happening?',
    dataShape: {
      summary: 'One location-typed Dimension + one Measure',
      clauses: [
        minMeasures(1),
        {
          /*
           * Two routes, because the Family has two shapes of member and they
           * need different Fields. A choropleth shades named areas; a point map
           * plots coordinates. Requiring one clause to cover both is what made
           * the earlier version unsatisfiable — see Finding 15.
           */
          describe: 'a Field naming a place, or a latitude and longitude pair',
          test: () => false,
          testWithSemantics: (d) => {
            const named = d.fields.some((f) => f.semantic === 'geographic-area')
            const located =
              d.fields.some((f) => f.semantic === 'geographic-latitude') &&
              d.fields.some((f) => f.semantic === 'geographic-longitude')
            return named || located
          },
          undecidable: {
            requirement:
              '§4.2 requires a "location-typed Dimension". `FieldType` does carry `location`, and ' +
              'a Dataset reports `has_location_field` — but a choropleth shades *named areas* and ' +
              '`location` does not separate a region from a postcode or a street address, which ' +
              'cannot be shaded. Nor can it say that two Measures are a coordinate pair rather ' +
              'than two figures. The type is nearly enough here and not quite: it is the one ' +
              'Family where the published model already reaches for the fact and stops one step ' +
              'short of it.',
            resolvedBy:
              "proposed Field semantics 'geographic-area', or " +
              "'geographic-latitude' with 'geographic-longitude'",
          },
        },
      ],
    },
  },

  {
    id: 'radial',
    name: 'Radial',
    question: 'How does this compare against a target or across axes?',
    dataShape: {
      summary: 'One or more Measures, optionally with a target',
      clauses: [minMeasures(1)],
    },
    note: 'The target is Widget configuration, not a Dataset property, so it does not gate eligibility.',
  },

  {
    id: 'single-value',
    name: 'Single Value',
    question: 'What is the number right now?',
    dataShape: {
      summary: 'One Measure, optionally one Time Dimension for trend or comparison',
      clauses: [minMeasures(1)],
    },
  },

  {
    id: 'temporal-pattern',
    name: 'Temporal Pattern',
    question: 'What is the pattern across time periods or cohorts?',
    dataShape: {
      summary: 'One Time Dimension + one Measure',
      clauses: [minTimeDimensions(1), minMeasures(1)],
    },
  },

  {
    id: 'chronological',
    name: 'Chronological',
    question: 'What happened, in order?',
    dataShape: {
      summary: 'Time-ordered records',
      clauses: [minTimeDimensions(1)],
    },
    note:
      'Interpreted as "has a Time Dimension", with no Measure required — an activity feed lists ' +
      'events rather than aggregating them. Confirmed by the accompanying widget breakdown, which ' +
      'states the shape as "one dimension + one measure (ranking), or a time-ordered event stream ' +
      '(feed/log)" — establishing the event stream as a shape in its own right rather than as ' +
      'Trend without a Measure.',
  },

  {
    id: 'status',
    name: 'Status',
    question: 'Is this healthy?',
    dataShape: {
      summary: 'One Measure with a threshold, or one state Dimension',
      clauses: [
        {
          describe: 'one Measure, or a Dimension declared as a state',
          // The threshold itself is Widget configuration, so a Measure alone
          // satisfies the first route. Only the state-Dimension route is
          // inexpressible.
          test: (d) => measuresOf(d).length >= 1,
          testWithSemantics: (d) => measuresOf(d).length >= 1 || hasSemantic(d, 'state'),
          undecidable: {
            requirement:
              '§4.2 admits "one state Dimension" as an alternative shape. The published model cannot ' +
              'distinguish a state Dimension from any other Dimension.',
            resolvedBy: "proposed Field semantic 'state'",
          },
        },
      ],
    },
    note: 'The threshold is Widget configuration. Analytics displays threshold state but must not alert on it (§10).',
  },
]

export function getFamily(id: string): VisualizationFamily | undefined {
  return visualizationFamilies.find((f) => f.id === id)
}
