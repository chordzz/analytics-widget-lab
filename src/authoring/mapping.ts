/**
 * Turning a Dataset and a Visualization Type into a Field mapping.
 *
 * Two jobs: propose a sensible default so an Author sees something immediately
 * rather than an empty form, and say whether a mapping is complete enough to
 * bind. Both are pure, so the authoring UI stays a thin shell over rules that
 * can be tested without rendering anything.
 */

import type { Dataset, Field, FieldRole } from '../domain/dataset'
import type { FieldMapping } from '../domain/widget'
import type { MappingSlot } from '../visualization/mapping-slots'
import { slotsForFamily } from '../visualization/mapping-slots'
import { getVisualizationType } from '../visualization/visualization-types'

export function slotsForVisualizationType(visualizationTypeId: string): MappingSlot[] {
  const type = getVisualizationType(visualizationTypeId)
  return type ? slotsForFamily(type.familyId) : []
}

export function fieldsAcceptedBy(dataset: Dataset, slot: MappingSlot): Field[] {
  return dataset.fields.filter((field) => slot.accepts.includes(field.role as FieldRole))
}

/** The Field keys currently filling a slot. */
export function slotValues(mapping: FieldMapping, slot: MappingSlot): string[] {
  switch (slot.id) {
    case 'timeDimension':
      return mapping.timeDimension ? [mapping.timeDimension] : []
    case 'dimensions':
      return mapping.dimensions ?? []
    case 'measures':
      return (mapping.measures ?? []).map((m) => m.field)
    case 'columns':
      return mapping.columns ?? []
  }
}

/**
 * Writes a slot's Field keys back into the mapping.
 *
 * A Measure carries an aggregation as well as a key. Where one is already
 * chosen it is preserved; otherwise the Dataset's first declared aggregation is
 * used, because FR-DP-04 makes those the *meaningful* ones — an Author should
 * never be offered an aggregation the publisher did not sanction.
 */
export function withSlotValues(
  mapping: FieldMapping,
  slot: MappingSlot,
  keys: string[],
  dataset: Dataset,
): FieldMapping {
  switch (slot.id) {
    case 'timeDimension':
      return { ...mapping, timeDimension: keys[0] }
    case 'dimensions':
      return { ...mapping, dimensions: keys }
    case 'columns':
      return { ...mapping, columns: keys }
    case 'measures':
      return {
        ...mapping,
        measures: keys.map((key) => {
          const existing = mapping.measures?.find((m) => m.field === key)
          if (existing) return existing
          const field = dataset.fields.find((f) => f.key === key)
          const aggregation =
            field?.role === 'measure' && field.aggregations.length ? field.aggregations[0] : 'sum'
          return { field: key, aggregation }
        }),
      }
  }
}

/** A mapping that fills every required slot, where the Dataset allows. */
export function defaultMapping(dataset: Dataset, visualizationTypeId: string): FieldMapping {
  let mapping: FieldMapping = {}

  for (const slot of slotsForVisualizationType(visualizationTypeId)) {
    const available = fieldsAcceptedBy(dataset, slot)
    // Fill to `min`, or offer the whole set for an unbounded columns slot so a
    // table starts out showing the Dataset rather than one column of it.
    const take = slot.id === 'columns' ? available.length : Math.max(slot.min, 0)
    if (take === 0) continue
    mapping = withSlotValues(
      mapping,
      slot,
      available.slice(0, slot.max ?? take).map((f) => f.key),
      dataset,
    )
  }

  return mapping
}

export interface MappingProblem {
  slot: MappingSlotLabel
  detail: string
}

type MappingSlotLabel = string

/** Empty when the mapping is complete enough to bind. */
export function validateMapping(
  mapping: FieldMapping,
  visualizationTypeId: string,
): MappingProblem[] {
  const problems: MappingProblem[] = []

  for (const slot of slotsForVisualizationType(visualizationTypeId)) {
    const chosen = slotValues(mapping, slot)

    if (chosen.length < slot.min) {
      problems.push({
        slot: slot.label,
        detail:
          slot.min === 1
            ? `Choose a Field for ${slot.label.toLowerCase()}.`
            : `Choose at least ${slot.min} for ${slot.label.toLowerCase()}.`,
      })
    }

    if (slot.max !== undefined && chosen.length > slot.max) {
      problems.push({
        slot: slot.label,
        detail: `${slot.label} takes at most ${slot.max}.`,
      })
    }
  }

  return problems
}
