/**
 * Render a component the way a browser does, effects and all.
 *
 * The distinction this exists for: `renderToStaticMarkup` renders once,
 * synchronously, to a string. It never mounts, so `useEffect` never runs and
 * anything a component loads asynchronously never reaches the output. An
 * assertion about such content then passes or fails for reasons unrelated to
 * the component — which looks like coverage and is not.
 *
 * `flush` awaits the microtask queue inside `act`, so a promise already
 * resolved by a fake port lands and the re-render it causes is included. A
 * real network call would need more than this; every port these tests use
 * answers immediately, deliberately.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

export interface Mounted {
  container: HTMLElement
  text: () => string
  /** Every checkbox row, as the label text beside it. */
  rows: () => string[]
  click: (label: string) => Promise<void>
  /** Types into a controlled input, the way React needs to hear about it. */
  type: (selector: string, value: string) => Promise<void>
  flush: () => Promise<void>
  /**
   * Wait out a real timer, then flush.
   *
   * `flush` drains microtasks only, so anything behind a `setTimeout` — a
   * debounced search, for one — has not started when it returns. Faking the
   * clock would be tidier and would also stop the promise the timer schedules
   * from resolving, so this waits for real.
   */
  settle: (ms?: number) => Promise<void>
  unmount: () => void
}

export async function mount(node: ReactNode): Promise<Mounted> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  const container = document.createElement('div')
  document.body.appendChild(container)

  let root: Root | undefined
  await act(async () => {
    root = createRoot(container)
    root.render(node)
  })

  const flush = async () => {
    await act(async () => {
      await Promise.resolve()
    })
  }
  await flush()

  const labels = () => [...container.querySelectorAll('label')]

  return {
    container,
    text: () => container.textContent ?? '',
    rows: () =>
      labels()
        .filter((label) => label.querySelector('input[type="checkbox"]'))
        .map((label) => (label.textContent ?? '').trim()),
    click: async (label: string) => {
      const found = labels().find((entry) => (entry.textContent ?? '').trim() === label)
      if (!found) throw new Error(`no row labelled "${label}" — rows are ${JSON.stringify(labels().map((l) => (l.textContent ?? '').trim()))}`)
      const box = found.querySelector('input[type="checkbox"]')
      if (!box) throw new Error(`"${label}" has no checkbox`)
      await act(async () => {
        ;(box as HTMLInputElement).click()
      })
      await flush()
    },
    type: async (selector: string, value: string) => {
      const field = container.querySelector(selector)
      if (!field) throw new Error(`no element matching ${selector}`)
      /*
       * React tracks a controlled input's value on the node itself and skips
       * the change when it looks unchanged, so assigning `.value` directly is
       * silently ignored. Going through the prototype's setter updates the
       * node without that bookkeeping, and the dispatched event is then the
       * first React hears of it — which is what a keystroke looks like.
       */
      const setter = Object.getOwnPropertyDescriptor(
        globalThis.HTMLInputElement.prototype,
        'value',
      )?.set
      await act(async () => {
        setter?.call(field, value)
        field.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await flush()
    },
    flush,
    settle: async (ms = 300) => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, ms))
      })
      await flush()
    },
    unmount: () => {
      act(() => root?.unmount())
      container.remove()
    },
  }
}
