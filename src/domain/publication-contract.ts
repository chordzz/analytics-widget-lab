/**
 * The publication contract — what a Source System must declare for a Dataset
 * to become consumable (FR-DP-02 — FR-DP-08, enforced by FR-GV-04).
 *
 * This is the *enforceable* half of the Analytics contract. It is deliberately
 * independent of any Visualization Type: a Dataset is published to describe
 * data, not to satisfy a chart. Nothing here asks "can this be a bar chart?"
 * — that question is computed at authoring time by the Data Shape predicate
 * and is never a publication gate. See UC-08: a Dataset must be able to outlive
 * the first Widget built from it, and be consumed by Types its publisher never
 * anticipated.
 *
 * Rules are data so that the validator and the generated documentation share
 * one source of truth and cannot drift apart.
 */

import type { Aggregation, DataClassification, FieldRole } from './dataset'

export const FIELD_ROLES: FieldRole[] = ['dimension', 'time-dimension', 'measure']

export const AGGREGATIONS: Aggregation[] = [
  'sum',
  'average',
  'count',
  'minimum',
  'maximum',
  'distinct-count',
]

export const CLASSIFICATIONS: DataClassification[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
]

export interface PublicationRule {
  /** Stable identifier for this rule, for use in rejection messages. */
  id: string
  /** The FRD requirement this rule enforces. */
  requirement: string
  /** What the publisher must do. */
  statement: string
  /** Returns one message per violation, naming the offending Field where relevant. */
  check: (candidate: Record<string, unknown>) => string[]
}

export interface PublicationViolation {
  rule: string
  requirement: string
  detail: string
}

export interface PublicationVerdict {
  /** FR-GV-04 — only an accepted Dataset becomes consumable. */
  accepted: boolean
  violations: PublicationViolation[]
}

// --- narrowing helpers -----------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const isFilledString = (value: unknown): boolean =>
  typeof value === 'string' && value.trim().length > 0

const fieldsOf = (candidate: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(candidate.fields)
    ? candidate.fields.map(asRecord).filter((f): f is Record<string, unknown> => f !== null)
    : []

/** Best-effort label for error messages against input that may be malformed. */
const nameField = (field: Record<string, unknown>, index: number): string =>
  isFilledString(field.key) ? `'${String(field.key)}'` : `at position ${index}`

// --- the rules -------------------------------------------------------------

export const publicationRules: PublicationRule[] = [
  {
    id: 'PC-01',
    requirement: 'Definitions — Dataset',
    statement: 'A Dataset must carry a stable identifier and a human-readable name.',
    check: (c) => {
      const violations: string[] = []
      if (!isFilledString(c.id)) violations.push('No Dataset identifier was supplied.')
      if (!isFilledString(c.name)) violations.push('No Dataset name was supplied.')
      return violations
    },
  },

  {
    id: 'PC-02',
    requirement: 'FR-DP-02',
    statement:
      'A Dataset must identify the Source System that owns it. Ownership is singular and unambiguous.',
    check: (c) =>
      isFilledString(c.sourceSystem)
        ? []
        : ['No owning Source System was identified.'],
  },

  {
    id: 'PC-03',
    requirement: 'FR-DP-03',
    statement:
      'A Dataset must describe its Fields such that, for each Field, a consumer can determine ' +
      'whether it is a Dimension or a Measure. Every Field carries a unique key, a label, and a role.',
    check: (c) => {
      if (!Array.isArray(c.fields)) return ['No Fields were described.']
      if (c.fields.length === 0) return ['The Dataset describes no Fields.']

      const violations: string[] = []
      const seen = new Set<string>()

      c.fields.forEach((raw, index) => {
        const field = asRecord(raw)
        if (!field) {
          violations.push(`Field at position ${index} is not an object.`)
          return
        }

        if (!isFilledString(field.key)) {
          violations.push(`Field at position ${index} has no key.`)
        } else {
          const key = String(field.key)
          if (seen.has(key)) violations.push(`Field key '${key}' is used more than once.`)
          seen.add(key)
        }

        if (!isFilledString(field.label)) {
          violations.push(`Field ${nameField(field, index)} has no label.`)
        }

        if (!isFilledString(field.role)) {
          violations.push(
            `Field ${nameField(field, index)} does not declare a role. It cannot be determined ` +
              'whether it is a Dimension or a Measure.',
          )
        } else if (!FIELD_ROLES.includes(field.role as FieldRole)) {
          violations.push(
            `Field ${nameField(field, index)} declares role '${String(field.role)}', which is not ` +
              `one of: ${FIELD_ROLES.join(', ')}.`,
          )
        }
      })

      return violations
    },
  },

  {
    id: 'PC-04',
    requirement: 'FR-DP-04',
    statement:
      'Every Measure must declare which aggregations are meaningful for it. Declaring an ' +
      'aggregation asserts that its result carries meaning, not merely that it computes.',
    check: (c) => {
      const violations: string[] = []

      fieldsOf(c).forEach((field, index) => {
        if (field.role !== 'measure') return

        const declared = field.aggregations
        if (!Array.isArray(declared) || declared.length === 0) {
          violations.push(
            `Measure ${nameField(field, index)} declares no meaningful aggregations.`,
          )
          return
        }

        for (const aggregation of declared) {
          if (!AGGREGATIONS.includes(aggregation as Aggregation)) {
            violations.push(
              `Measure ${nameField(field, index)} declares aggregation '${String(aggregation)}', ` +
                `which is not one of: ${AGGREGATIONS.join(', ')}.`,
            )
          }
        }
      })

      return violations
    },
  },

  {
    id: 'PC-05',
    requirement: 'FR-DP-05',
    statement:
      'Every Field must state explicitly whether it may be used to filter records and whether it ' +
      'may be used to order them. Omission is not a default — it is an undeclared Field.',
    check: (c) => {
      const violations: string[] = []

      fieldsOf(c).forEach((field, index) => {
        if (typeof field.filterable !== 'boolean') {
          violations.push(`Field ${nameField(field, index)} does not declare whether it is filterable.`)
        }
        if (typeof field.sortable !== 'boolean') {
          violations.push(`Field ${nameField(field, index)} does not declare whether it is sortable.`)
        }
      })

      return violations
    },
  },

  {
    id: 'PC-06',
    requirement: 'FR-DP-07',
    statement:
      'A Dataset must carry a data classification indicating the sensitivity of the data it exposes.',
    check: (c) => {
      if (!isFilledString(c.classification)) return ['No data classification was supplied.']
      if (!CLASSIFICATIONS.includes(c.classification as DataClassification)) {
        return [
          `Classification '${String(c.classification)}' is not one of: ${CLASSIFICATIONS.join(', ')}.`,
        ]
      }
      return []
    },
  },

  {
    id: 'PC-07',
    requirement: 'FR-DP-07',
    statement:
      'A Dataset must state explicitly whether it exposes personal data. This drives the access ' +
      'recording obligation in FR-DA-14, so it cannot be left to inference.',
    check: (c) =>
      typeof c.exposesPersonalData === 'boolean'
        ? []
        : ['The Dataset does not state whether it exposes personal data.'],
  },
  {
    id: 'PC-08',
    requirement: 'Proposed extension — D30',
    statement:
      'A Dataset must declare its row grain: the Fields whose combination identifies one row, or ' +
      'an empty list where the endpoint answers with a single summary row. An Author choosing a ' +
      'Dataset cannot otherwise tell a one-row summary from two thousand records, and the two feed ' +
      'almost disjoint sets of Visualization Types.',
    check: (c) => {
      const grain = c.rowGrain
      if (grain === undefined) return ['The Dataset does not declare what one row represents.']

      const record = asRecord(grain)
      const dimensions = record?.dimensions
      if (!Array.isArray(dimensions)) {
        return ["Row grain must name the Fields identifying a row, as { dimensions: [...] }."]
      }

      // Every name must be a declared Field — the same rule that rejects `sum`
      // on a string column, and checkable with the machinery already here.
      const declared = new Set(
        fieldsOf(c)
          .map((field) => field.key)
          .filter(isFilledString),
      )
      return dimensions
        .filter((name) => !declared.has(name))
        .map((name) => `Row grain names '${String(name)}', which is not a declared Field.`)
    },
  },

  {
    id: 'PC-09',
    requirement: 'Proposed extension — D31',
    statement:
      'Every Filter Parameter must state whether it is required, and must declare its accepted ' +
      'values wherever those are enumerable. A parameter whose values are not declared renders as ' +
      'an empty control: the Viewer is offered a filter with nothing to pick.',
    check: (c) => {
      const parameters = Array.isArray(c.filterParameters)
        ? c.filterParameters.map(asRecord).filter((p): p is Record<string, unknown> => p !== null)
        : []

      const violations: string[] = []

      parameters.forEach((parameter, index) => {
        const label = isFilledString(parameter.name)
          ? `'${String(parameter.name)}'`
          : `at position ${String(index)}`

        if (!isFilledString(parameter.name)) {
          violations.push(`Filter Parameter ${label} has no name.`)
        }
        if (typeof parameter.required !== 'boolean') {
          violations.push(`Filter Parameter ${label} does not declare whether it is required.`)
        }
        /*
         * Whether a parameter's values are enumerable is the publisher's
         * judgement and cannot be checked from here — 365 dates are not a
         * dropdown. What is checkable is that a declared list is a usable one:
         * an empty `allowedValues` says this parameter accepts nothing, which is
         * a broken declaration rather than an absent one.
         */
        if (parameter.allowedValues !== undefined) {
          if (!Array.isArray(parameter.allowedValues) || parameter.allowedValues.length === 0) {
            violations.push(
              `Filter Parameter ${label} declares an empty list of accepted values. Omit it if the ` +
                'values are open-ended.',
            )
          }
        }
      })

      return violations
    },
  },
]

/**
 * FR-DP-08 — reject an incomplete submission and identify precisely what is
 * missing. Every rule runs; the publisher gets the whole list in one pass
 * rather than discovering problems one at a time.
 */
export function validatePublication(candidate: unknown): PublicationVerdict {
  const record = asRecord(candidate)
  if (!record) {
    return {
      accepted: false,
      violations: [
        {
          rule: 'PC-00',
          requirement: 'FR-DP-08',
          detail: 'The submission is not an object and cannot be evaluated.',
        },
      ],
    }
  }

  const violations = publicationRules.flatMap((rule) =>
    rule.check(record).map((detail) => ({
      rule: rule.id,
      requirement: rule.requirement,
      detail,
    })),
  )

  return { accepted: violations.length === 0, violations }
}
