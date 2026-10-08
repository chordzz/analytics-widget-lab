/**
 * Naming a Share Grant that was read back from the server.
 *
 * `GET .../share-grants` returns `target_ref` and no name, and the directory
 * searches by name rather than resolving a reference — so after a reload a
 * Grant has only an id to show. Departments are the one case we can close from
 * here, because the full list is already loaded for the Scope select.
 *
 * Worth a test rather than a glance: the fallback is what shows when the lookup
 * misses, and a fallback that rendered blank would make a live Grant look like
 * an empty row — access nobody can see, on a panel whose whole job is saying
 * who can see the board.
 */

import { describe, expect, test } from 'bun:test'
import { labelFor } from './SharePanel'
import type { ShareGrant } from '../../domain/dashboard'

const groups = [
  { scopeId: 'dept-eng', label: 'Engineering' },
  { scopeId: 'dept-fin', label: 'Finance' },
]

const grant = (over: Partial<ShareGrant> = {}): ShareGrant => ({
  id: 'g-1',
  recipientKind: 'group',
  recipientId: 'dept-eng',
  recipientLabel: 'dept-eng',
  ...over,
})

describe('labelFor', () => {
  test('a department is named from the list already loaded', () => {
    expect(labelFor(grant(), groups)).toBe('Engineering')
  })

  test('a department the list does not hold keeps its reference', () => {
    // Renaming it "Unknown" would be worse: the reference is the one thing
    // that can be matched against the API when someone asks what this is.
    // Both fields, because that is what a Grant read back from the server
    // looks like: `grantFrom` sets the label to the reference for want of a
    // name. Overriding only the id would test a shape the API never sends.
    const missing = grant({ recipientId: 'dept-gone', recipientLabel: 'dept-gone' })
    expect(labelFor(missing, groups)).toBe('dept-gone')
  })

  test('a person keeps whatever label the Grant carries', () => {
    /*
     * Not resolved, and not resolvable: people come back only from a search by
     * name, so there is nothing to look an id up in. A freshly added Grant
     * carries the real name because the Author just picked it from a result.
     */
    const person = grant({ recipientKind: 'individual', recipientId: 'u-2', recipientLabel: 'Ada Chukwu' })
    expect(labelFor(person, groups)).toBe('Ada Chukwu')
  })

  test('a person read back after a reload shows the reference, not a blank', () => {
    const reloaded = grant({ recipientKind: 'individual', recipientId: 'u-2', recipientLabel: 'u-2' })
    expect(labelFor(reloaded, groups)).toBe('u-2')
  })
})
