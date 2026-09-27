/**
 * The composer, driven.
 *
 * Its pure parts are already exported and tested — `inheritPeriod`,
 * `inputTypeFor`, `previewPrompt`. What none of them reach is the sequence: a
 * data source arrives from a port, a type is picked, the title follows one and
 * then stops following it, and a commit is refused until the Dataset's own
 * requirements are met. All of that is state changing in response to a click,
 * so a static render sees the first frame and nothing after it.
 *
 * Several of the behaviours below are fixed bugs rather than features, and the
 * comments in the component say so. They had no tests because they could not
 * have had one.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { WidgetComposer, type ComposerDraft } from './WidgetComposer'

const SOURCE = 'Revenue, monthly'

const open = async (props: Partial<Parameters<typeof WidgetComposer>[0]> = {}) => {
  const committed: ComposerDraft[] = []
  const screen = await mount(
    <AnalyticsDataProvider>
      <WidgetComposer
        onCommit={(draft) => committed.push(draft)}
        onCancel={() => {}}
        {...props}
      />
    </AnalyticsDataProvider>,
  )
  return { screen, committed }
}

/**
 * The title field, found by its own label.
 *
 * Not `input.a-input`: the type picker's search box carries the same class, so
 * the first match is whichever step happens to be open. Step four renders only
 * once a type is chosen, which is why every test here picks one first — the
 * title is set in state before that, and simply has nowhere to appear.
 */
const titleField = (screen: { container: HTMLElement }): HTMLInputElement => {
  const field = [...screen.container.querySelectorAll('label.a-field')].find((label) =>
    (label.textContent ?? '').trim().startsWith('Title'),
  )
  const input = field?.querySelector('input')
  if (!input) throw new Error('no Title field on screen — has a type been picked?')
  return input as HTMLInputElement
}

const titleValue = (screen: { container: HTMLElement }) => titleField(screen).value

/**
 * A type whose name appears once on the page.
 *
 * The picker lists suggestions above the full catalogue, so "Stat card" is
 * two buttons and pressing "the one called Stat card" is ambiguous. Delta card
 * is suggested for nothing here, so it appears only in the full list.
 */
const TYPE = 'Delta card'

describe('the data source arrives from a port', () => {
  test('the sources are listed once the Catalogue answers', async () => {
    /*
     * The first frame says "Loading data sources…" — which is all a static
     * render has ever been able to see of this component.
     */
    const { screen } = await open()
    expect(screen.text()).toContain(SOURCE)
    expect(screen.text()).not.toContain('Loading data sources')
    screen.unmount()
  })

  test('a handed-off source names the widget', async () => {
    /*
     * What this does *not* pin, having been checked: the seeding effect above
     * `chooseDataset`. Deleting that effect fails nothing here, because every
     * route that can display a title also sets one — the title field lives in
     * step four, which needs a type, and `chooseType` assigns the source's
     * name whenever the Author has not authored their own. The effect is
     * defensive against a path that does not currently exist.
     *
     * Left as it is rather than quietly asserted around. A test shaped to fail
     * when that effect is removed would have to reach past the UI, and would
     * be pinning the implementation rather than anything a person experiences.
     */
    const { screen } = await open({ startWith: { datasetId: 'revenue-monthly' } })
    await screen.pressStarting(TYPE)
    expect(titleValue(screen)).toBe(SOURCE)
    screen.unmount()
  })
})

describe('the title follows the data until somebody makes it theirs', () => {
  test('picking a source names the widget after it', async () => {
    const { screen } = await open()
    await screen.pressStarting(SOURCE)
    await screen.pressStarting(TYPE)
    expect(titleValue(screen)).toBe(SOURCE)
    screen.unmount()
  })

  test('a title the Author typed survives a change of source', async () => {
    const { screen } = await open()
    await screen.pressStarting(SOURCE)
    await screen.pressStarting(TYPE)
    await screen.typeInto(titleField(screen), 'Money in')

    await screen.press('Change')
    await screen.pressStarting('Revenue, daily')

    expect(titleValue(screen)).toBe('Money in')
    screen.unmount()
  })

  test('a title the Author cleared is not filled back in', async () => {
    /*
     * The guard is `titled`, not "is the title empty". Someone who empties the
     * field on purpose has still authored it, and refilling would overrule
     * them — quietly, and only when a describe happened to land.
     */
    const { screen } = await open({ startWith: { datasetId: 'revenue-monthly' } })
    await screen.pressStarting(TYPE)
    await screen.typeInto(titleField(screen), '')
    expect(titleValue(screen)).toBe('')
    screen.unmount()
  })
})

describe('changing the source keeps what still fits', () => {
  test('an incompatible type is dropped rather than left broken', async () => {
    const { screen } = await open()
    await screen.pressStarting(SOURCE)
    await screen.pressStarting(TYPE)
    expect(screen.text()).toContain('Label and size it')

    await screen.press('Change')
    await screen.pressStarting('Signup funnel')

    // Step four is gone: there is no type, so there is nothing to label yet.
    expect(screen.text()).not.toContain('Label and size it')
    screen.unmount()
  })
})

describe('committing', () => {
  test('is refused until a type is chosen', async () => {
    const { screen, committed } = await open()
    await screen.pressStarting(SOURCE)

    await screen.press('Add to dashboard')

    expect(committed).toEqual([])
    screen.unmount()
  })

  test('hands back what was composed', async () => {
    const { screen, committed } = await open({ boardName: 'Finance' })
    await screen.pressStarting(SOURCE)
    await screen.pressStarting(TYPE)
    await screen.press('Add to Finance')

    expect(committed).toHaveLength(1)
    expect(committed[0]).toMatchObject({ datasetId: 'revenue-monthly', typeId: 'delta-card' })
    screen.unmount()
  })

  test('the board names the button, because an Author may have arrived from elsewhere', async () => {
    const { screen } = await open({ boardName: 'Finance' })
    expect(screen.buttons()).toContain('Add to Finance')
    screen.unmount()
  })
})
