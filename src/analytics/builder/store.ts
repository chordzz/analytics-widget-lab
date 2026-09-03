/**
 * Where boards are kept, behind a port.
 *
 * Merge Plan Stage 5, second half — with a correction to the plan. It said this
 * step hands the module's boards to `DashboardStorePort`. It cannot yet: that
 * port deals in `Dashboard`, which carries a Scope, Share Grants and Widgets
 * *referenced by id*, and adopting it means adopting all three. That is Stage 6
 * work, and D10 already records the module embedding its widgets.
 *
 * So this is the same boundary over the model the module has today. The value is
 * not the interface's shape but its **asynchrony**: persistence stops being a
 * function call inside a `useReducer` initialiser and becomes something that can
 * be slow, fail, or answer after the user has moved on. Every one of those is a
 * bug class the module has never had to handle, and finding them against
 * localStorage is cheaper than finding them against HTTP.
 *
 * Two things move here that are not storage but belong with it:
 *
 *   - **Identity.** `useBoards` minted ids with `Math.random()`, with a comment
 *     saying no server was issuing them. One will be, and whoever persists a
 *     record is who decides what it is called.
 *   - **The clock.** `updated` was a local `new Date()`. Two people editing from
 *     different machines would disagree about which edit was later, and both
 *     would be sure.
 */

import { loadState, saveState, type BoardsState } from './boards'

export interface BoardStorePort {
  /** The saved session, or the seed when there is none. */
  load(seed: BoardsState['boards'], authorId: string): Promise<BoardsState>
  save(state: BoardsState): Promise<void>
  /** Identity comes from whoever persists the record. */
  mintId(prefix: string): string
  /** The store's clock, not the browser's. */
  now(): string
}

/**
 * localStorage, asynchronously.
 *
 * The `async` is not decoration. Returning a resolved promise from a
 * synchronous read is exactly what makes the *callers* honest: they have to
 * handle "not yet", and code written against a store that always answers
 * immediately never does.
 */
export class LocalBoardStore implements BoardStorePort {
  private readonly latencyMs: number

  constructor(latencyMs = 0) {
    this.latencyMs = latencyMs
  }

  private async wait(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
  }

  async load(seed: BoardsState['boards'], authorId: string): Promise<BoardsState> {
    await this.wait()
    return loadState(seed, authorId)
  }

  async save(state: BoardsState): Promise<void> {
    await this.wait()
    saveState(state)
  }

  /**
   * Unique enough for a client-side board, and deliberately still local.
   *
   * A real store issues these, and when it does this method is the only thing
   * that changes. Keeping the concern *named* now is what makes that true —
   * scattered `Math.random()` calls across a reducer's callers would not be.
   */
  mintId(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
  }

  now(): string {
    return new Date().toISOString().slice(0, 10)
  }
}
