import { describe, expect, test } from 'bun:test'
import { matchingDatasets } from './dataset-search'
import type { Dataset } from './types'

const REVENUE: Dataset = {
  id: 'revenue-daily',
  name: 'Revenue, daily',
  description: 'Daily revenue, orders and refunds over the last year.',
  sourceSystem: 'fixture',
  classification: 'internal',
  exposesPersonalData: false,
  fields: [],
}
const COUNTRY: Dataset = {
  id: 'sales-by-country',
  name: 'Sales by country',
  description: 'Revenue and customer count for twenty countries, with ISO codes.',
  sourceSystem: 'fixture',
  classification: 'internal',
  exposesPersonalData: false,
  fields: [],
}

describe('matchingDatasets', () => {
  test('an empty term returns every dataset', () => {
    expect(matchingDatasets([REVENUE, COUNTRY], '')).toEqual([REVENUE, COUNTRY])
  })

  test('matches on the name', () => {
    expect(matchingDatasets([REVENUE, COUNTRY], 'country')).toEqual([COUNTRY])
  })

  test('matches on the description, case-insensitively', () => {
    expect(matchingDatasets([REVENUE, COUNTRY], 'ISO CODES')).toEqual([COUNTRY])
  })

  test('nothing matches a term neither field mentions', () => {
    expect(matchingDatasets([REVENUE, COUNTRY], 'funnel')).toEqual([])
  })

  test('works over a DatasetSummary, which has no fields', () => {
    const summary = { name: 'Support tickets', description: 'A hundred and twenty tickets.' }
    expect(matchingDatasets([summary], 'tickets')).toEqual([summary])
  })
})
