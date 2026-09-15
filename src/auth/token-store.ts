/**
 * Where the tokens live.
 *
 * `localStorage`, decided by the team on 12 September: people leave a dashboard
 * open across days and browser restarts, and `sessionStorage` would sign them
 * out every time a tab closed.
 *
 * The cost is real and worth naming once. The refresh token arrives in the
 * response body rather than as an httpOnly cookie, so no storage available to us
 * keeps it out of reach of injected script — `localStorage` widens the window
 * rather than opening it. Three things follow, and they are what this file is:
 *
 *   - **one key, versioned** — one place to write, one place to clear, and a
 *     bump invalidates every stored session if the shape ever changes
 *   - **cleared on every exit path** — sign-out, refresh failure, and a blob
 *     that will not parse; a half-valid session is worse than none
 *   - **never logged** — nothing here writes a token anywhere but storage
 */

import type { AuthTokens } from './port'

export const STORAGE_KEY = 'smc.analytics.auth.v1'

export interface TokenStore {
  read(): AuthTokens | null
  write(tokens: AuthTokens): void
  clear(): void
}

/**
 * Storage can throw rather than merely be empty — Safari in private mode, a
 * browser configured to block site data, an embedded webview. Every path here
 * treats "cannot store" as "not signed in", which degrades to asking for a code
 * again rather than to a blank screen.
 */
export function browserTokenStore(storage: Storage | null = safeLocalStorage()): TokenStore {
  return {
    read() {
      if (!storage) return null
      let raw: string | null
      try {
        raw = storage.getItem(STORAGE_KEY)
      } catch {
        return null
      }
      if (!raw) return null

      const parsed = parse(raw)
      if (!parsed) {
        // Unreadable is not "keep it and hope". Anything we cannot understand is
        // cleared, because the alternative is a key that fails the same way on
        // every load forever.
        try {
          storage.removeItem(STORAGE_KEY)
        } catch {
          /* nothing further to do */
        }
        return null
      }
      return parsed
    },

    write(tokens) {
      if (!storage) return
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(tokens))
      } catch {
        /* a session that cannot be persisted still works until the tab closes */
      }
    },

    clear() {
      if (!storage) return
      try {
        storage.removeItem(STORAGE_KEY)
      } catch {
        /* nothing further to do */
      }
    },
  }
}

/**
 * Every field checked, because a stored blob is untrusted input: it can be from
 * an older build, hand-edited, or written by something else on the origin. A
 * missing `expiresAt` would otherwise become `NaN`, and `NaN > now` is false, so
 * we would refresh on every single call rather than fail visibly.
 */
function parse(raw: string): AuthTokens | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== 'object' || value === null) return null

  const candidate = value as Record<string, unknown>
  const { accessToken, refreshToken, expiresAt, actorId } = candidate

  if (typeof accessToken !== 'string' || accessToken === '') return null
  if (typeof refreshToken !== 'string' || refreshToken === '') return null
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null
  if (typeof actorId !== 'string') return null

  return { accessToken, refreshToken, expiresAt, actorId }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** For tests, and for a host that would rather we did not persist at all. */
export function memoryTokenStore(): TokenStore {
  let held: AuthTokens | null = null
  return {
    read: () => held,
    write: (tokens) => {
      held = tokens
    },
    clear: () => {
      held = null
    },
  }
}
