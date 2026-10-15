/**
 * One extra step between a click and something unrecoverable.
 *
 * Used from two screens — Dashboards and Drafts — so it earns its own test
 * file rather than being proven twice, once per caller, in slightly
 * different words.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { ConfirmDelete } from './ConfirmDelete'

const open = async (onConfirm: () => void) =>
  mount(
    <ConfirmDelete label="Finance daily" onConfirm={onConfirm}>
      Delete
    </ConfirmDelete>,
  )

describe('a click opens a question, not a deletion', () => {
  test('nothing is confirmed by the first click', async () => {
    let confirmed = false
    const screen = await open(() => { confirmed = true })

    await screen.press('Delete')

    expect(confirmed).toBe(false)
    expect(screen.text()).toContain('Finance daily')
    expect(screen.text()).toContain('cannot be undone')
    screen.unmount()
  })

  test('Cancel closes it without confirming', async () => {
    let confirmed = false
    const screen = await open(() => { confirmed = true })

    await screen.press('Delete')
    await screen.press('Cancel')

    expect(confirmed).toBe(false)
    expect(screen.text()).not.toContain('cannot be undone')
    screen.unmount()
  })

  test('Escape closes it without confirming, same as Cancel', async () => {
    let confirmed = false
    const screen = await open(() => { confirmed = true })

    await screen.press('Delete')
    await screen.key('Escape')

    expect(confirmed).toBe(false)
    expect(screen.text()).not.toContain('cannot be undone')
    screen.unmount()
  })

  test('clicking outside it closes it without confirming', async () => {
    let confirmed = false
    const screen = await open(() => { confirmed = true })

    await screen.press('Delete')
    await screen.clickOutside()

    expect(confirmed).toBe(false)
    expect(screen.text()).not.toContain('cannot be undone')
    screen.unmount()
  })

  test('"Confirm delete" is what actually does it, and only once', async () => {
    let calls = 0
    const screen = await open(() => { calls += 1 })

    await screen.press('Delete')
    await screen.press('Confirm delete')

    expect(calls).toBe(1)
    // The question closes behind it — it does not stay up over a board that
    // is already gone.
    expect(screen.text()).not.toContain('cannot be undone')
    screen.unmount()
  })
})
