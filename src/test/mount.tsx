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
  /** The same, for an element a caller already found. */
  typeInto: (field: Element, value: string) => Promise<void>
  /** Press a button by its visible text or `aria-label`. */
  press: (name: string) => Promise<void>
  /** Every button's accessible name, for asserting one is *not* offered. */
  buttons: () => string[]
  /**
   * Press the one button whose accessible name starts with `prefix`.
   *
   * For names that carry a formatted date. `Intl` follows the runtime's
   * locale, so a field reading `3 Aug 2026` in a browser set to en-GB reads
   * `Aug 3, 2026` under the test runner — asserting the whole string would
   * pin the test to a locale rather than to the behaviour.
   */
  pressStarting: (prefix: string) => Promise<void>
  /** Render again with new props — a value that arrived after the mount. */
  rerender: (node: ReactNode) => Promise<void>
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

  /*
   * React tracks a controlled input's value on the node and skips the change
   * when it looks unchanged, so assigning `.value` directly is silently
   * ignored. Going through the prototype's setter updates the node without
   * that bookkeeping, and the dispatched event is then the first React hears
   * of it — which is what a keystroke looks like.
   */
  const setValue = async (field: Element, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      globalThis.HTMLInputElement.prototype,
      'value',
    )?.set
    await act(async () => {
      setter?.call(field, value)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
  }

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
    buttons: () =>
      [...container.querySelectorAll('button')].map(
        (button) => button.getAttribute('aria-label') ?? (button.textContent ?? '').trim(),
      ),

    rerender: async (next: ReactNode) => {
      await act(async () => {
        root?.render(next)
      })
      await flush()
    },

    pressStarting: async (prefix: string) => {
      const named = [...container.querySelectorAll('button')].map(
        (button) =>
          [button, button.getAttribute('aria-label') ?? (button.textContent ?? '').trim()] as const,
      )
      const hits = named.filter(([, name]) => name.startsWith(prefix))
      if (hits.length !== 1) {
        throw new Error(
          `expected one button named "${prefix}…", found ${String(hits.length)} — ` +
            `buttons are ${JSON.stringify(named.map(([, name]) => name))}`,
        )
      }
      await act(async () => {
        hits[0][0].click()
      })
      await flush()
    },

    press: async (name: string) => {
      const buttons = [...container.querySelectorAll('button')]
      const found = buttons.find(
        (button) =>
          (button.textContent ?? '').trim() === name ||
          button.getAttribute('aria-label') === name,
      )
      if (!found) {
        const seen = buttons.map((b) => b.getAttribute('aria-label') ?? (b.textContent ?? '').trim())
        throw new Error(`no button named "${name}" — buttons are ${JSON.stringify(seen)}`)
      }
      await act(async () => {
        found.click()
      })
      await flush()
    },

    typeInto: async (field: Element, value: string) => {
      await setValue(field, value)
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
      await setValue(field, value)
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
