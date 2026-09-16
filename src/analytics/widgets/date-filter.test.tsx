/**
 * A date filter gets a date control.
 *
 * The select is right when the publisher declared the values a filter accepts.
 * When they did not — Finding 8 — it renders with only "All" in it, and for a
 * Time Dimension that is every date there has ever been: a control that cannot
 * be used, offering nothing, and indistinguishable from a filter whose data
 * happens to be empty.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { WidgetFilters } from './WidgetFilters'
import { requireDataset } from '../data/datasets'

const daily = requireDataset('revenue-daily')

const markup = (fieldKey: string) =>
  renderToStaticMarkup(
    <AnalyticsDataProvider>
      <WidgetFilters
        dataset={daily}
        filters={[fieldKey]}
        sorts={[]}
        choices={{}}
        onChange={() => {}}
      />
    </AnalyticsDataProvider>,
  )

describe('a Time Dimension with nothing enumerated', () => {
  test('renders a date picker rather than an empty dropdown', () => {
    // `revenue-daily.date` is filterable and declares no allowed values, which
    // is the exact case: a dropdown containing only "All".
    const drawn = markup('date')
    expect(drawn).toContain('type="date"')
    expect(drawn).not.toContain('<select')
  })

  test('and the picker carries the label the publisher gave', () => {
    expect(markup('date')).toContain('Date')
  })

  test('it does not offer an "All" option, which a date range has no meaning for', () => {
    expect(markup('date')).not.toContain('>All<')
  })
})
