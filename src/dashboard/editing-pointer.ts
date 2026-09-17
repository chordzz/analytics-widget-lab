/**
 * Which board you had open, kept on this device.
 *
 * Boards live on the server now, and `editingId` does not go with them — the API
 * has no field for it, and should not: it is not a property of the Dashboard. It
 * is a property of *this browser*, the same kind of thing as a collapsed
 * sidebar. Two people editing the same board are not editing each other's
 * cursor.
 *
 * It needs somewhere, though, because dropping it is not neutral. `LocalBoardStore`
 * persisted it as part of whole state, so a reload put you back where you were.
 * Without it the Create screen finds nothing open, `ensure-editing` looks for an
 * empty draft, fails to find one, and mints a new blank board — so a reload
 * mid-build lands you on an empty canvas and leaves a stray draft behind. Your
 * work is safe and you would not know where it went.
 *
 * **It stores the server's id, not the client's.** A board created this session
 * is known locally as `local:board-xyz` until the API answers with its real id,
 * and the map between them is held for the session only. A pointer written under
 * the local name would be stale the moment the page reloaded — which is exactly
 * when it is read.
 */

const STORAGE_KEY = 'smc.analytics.editing.v1'

export interface EditingPointer {
  read(): string | null
  write(boardId: string | null): void
}

export function browserEditingPointer(
  storage: Storage | null = safeLocalStorage(),
): EditingPointer {
  return {
    read() {
      if (!storage) return null
      try {
        const raw = storage.getItem(STORAGE_KEY)
        return typeof raw === 'string' && raw !== '' ? raw : null
      } catch {
        return null
      }
    },

    write(boardId) {
      if (!storage) return
      try {
        if (boardId === null) storage.removeItem(STORAGE_KEY)
        else storage.setItem(STORAGE_KEY, boardId)
      } catch {
        /*
         * A pointer that cannot be written costs a reload landing on the
         * dashboard list. That is a smaller thing than the session it would
         * interrupt by throwing.
         */
      }
    },
  }
}

export function memoryEditingPointer(initial: string | null = null): EditingPointer {
  let held = initial
  return {
    read: () => held,
    write: (boardId) => {
      held = boardId
    },
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
