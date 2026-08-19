/**
 * FR-DA-14 — an in-memory access log for Datasets carrying a personal-data
 * classification.
 *
 * Append-only by construction: there is no method to amend or remove an entry,
 * because a record that can be edited establishes nothing.
 */

import type { AccessRecord, AccessRecorderPort } from './port'

export class InMemoryAccessRecorder implements AccessRecorderPort {
  private readonly entries: AccessRecord[] = []
  private readonly listeners = new Set<() => void>()

  async record(entry: AccessRecord): Promise<void> {
    this.entries.push(entry)
    this.listeners.forEach((listener) => listener())
  }

  async list(): Promise<AccessRecord[]> {
    return [...this.entries].reverse()
  }

  /** Lets a surface showing the log refresh when something is recorded. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
