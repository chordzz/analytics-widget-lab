/**
 * Who may see this board — FR-DA-01 to FR-DA-07.
 *
 * Merge Plan Stage 6.2. Two things this surface has to get right, and both are
 * places where the intuitive design is the wrong one.
 *
 * **Scope and publishing are separate gates.** Finding 9: nothing in the FRD
 * says how FR-CO-04 ("retain a Dashboard privately before making it visible")
 * interacts with FR-DA-02 ("Personal — visible only to the Author"), and the
 * natural implementation — publish means everyone can see it — silently breaks
 * the second for any board published at Personal Scope. So this panel never
 * touches `status`, and the publish button never touches Scope. The summary line
 * says what the *combination* means, because that is the thing an Author is
 * actually deciding and neither control says it alone.
 *
 * **A Grant refines, it does not extend.** FR-DA-06 and FR-DA-07 contradict each
 * other and Finding 11 resolves it: Scope is the outer bound, and with no Grants
 * everyone in Scope sees the board. So the wording has to make clear that adding
 * the first Grant *narrows* — an Author who reads "share with Ada" as "Ada can
 * now see it, as well as everyone who could before" has it backwards.
 */

import { useEffect, useState } from 'react'
import { useAnalyticsData, useMay } from '../data/AnalyticsData'
import { useBoards } from './useBoards'
import type { Board, DashboardScope } from './boards'
import type { OrgScopeRef } from '../../access/port'
import type { ViewerIdentity } from '../../retrieval/port'

const scopeLabel = (scope: DashboardScope): string => {
  switch (scope.kind) {
    case 'personal':
      return 'Only you'
    case 'organizational-scope':
      return scope.label
    case 'organization-wide':
      return 'Everyone'
  }
}

/**
 * What the two gates mean together.
 *
 * A draft is the Author's alone whatever the Scope says, so saying "Everyone"
 * beside an unpublished board would be false. Saying it *after* publishing, when
 * the Scope is Personal, would be equally false the other way.
 */
function describeVisibility(board: Board, grantCount: number): string {
  if (board.status === 'draft') return 'Only you, until you publish'

  const base = scopeLabel(board.scope)
  if (board.scope.kind === 'personal') return 'Only you'
  if (grantCount === 0) return base
  return `${grantCount === 1 ? '1 person' : `${grantCount} people`} within ${base}`
}

export function SharePanel({ board }: { board: Board }) {
  const boards = useBoards()
  const { authorization } = useAnalyticsData()
  const [people, setPeople] = useState<ViewerIdentity[]>([])
  const [groups, setGroups] = useState<OrgScopeRef[]>([])

  useEffect(() => {
    let live = true
    authorization
      .directory()
      .then((result) => {
        if (!live) return
        setPeople(result.individuals)
        setGroups(result.groups)
      })
      .catch(() => live && (setPeople([]), setGroups([])))
    return () => {
      live = false
    }
  }, [authorization])

  const scopeValue =
    board.scope.kind === 'organizational-scope' ? `scope:${board.scope.scopeId}` : board.scope.kind

  const chooseScope = (value: string) => {
    if (value === 'personal') return boards.setScope(board.id, { kind: 'personal' })
    if (value === 'organization-wide')
      return boards.setScope(board.id, { kind: 'organization-wide' })

    const scopeId = value.slice('scope:'.length)
    const group = groups.find((entry) => entry.scopeId === scopeId)
    if (group) {
      boards.setScope(board.id, {
        kind: 'organizational-scope',
        scopeId: group.scopeId,
        label: group.label,
      })
    }
  }

  // Granting to yourself is a control that can only be a no-op — the Author
  // always sees their own board.
  const grantable = people.filter((person) => person.id !== board.authorId)
  const mayShare = useMay('dashboard.share')
  const granted = new Set(board.shareGrants.map((grant) => grant.recipientId))

  return (
    <section className="a-share">
      <div className="a-share__row">
        <label className="a-field__label" htmlFor="board-scope">
          Who can see this
        </label>
        <select
          id="board-scope"
          className="a-select"
          value={scopeValue}
          // Scope decides who can see the board, so it is the same decision the
          // grant list expresses and sits behind the same permission.
          disabled={!mayShare}
          onChange={(event) => chooseScope(event.target.value)}
        >
          <option value="personal">Only you</option>
          {groups.map((group) => (
            <option key={group.scopeId} value={`scope:${group.scopeId}`}>
              {group.label}
            </option>
          ))}
          <option value="organization-wide">Everyone</option>
        </select>
      </div>

      <p className="a-share__summary">
        {describeVisibility(board, board.shareGrants.length)}
        {board.status === 'draft' && board.scope.kind !== 'personal' && (
          <span className="a-muted">
            {' '}
            — the Scope is set, publishing is what applies it.
          </span>
        )}
      </p>

      {!mayShare && (
        /*
         * Said once, above the controls, rather than as a tooltip on each.
         * Sharing is a single decision expressed through a scope select and a
         * list of names, and repeating the same sentence on every row would
         * bury it.
         */
        <p className="a-field__help">
          You do not have permission to change who can see this dashboard.
        </p>
      )}

      {mayShare && board.scope.kind !== 'personal' && grantable.length > 0 && (
        <div className="a-share__grants">
          <p className="a-field__help">
            Naming people <strong>narrows</strong> it to them. With nobody named, everyone in the
            scope above can see it.
          </p>

          {grantable.map((person) => {
            const grant = board.shareGrants.find((entry) => entry.recipientId === person.id)
            return (
              <label key={person.id} className="a-expose__item">
                <input
                  type="checkbox"
                  checked={granted.has(person.id)}
                  onChange={() =>
                    grant
                      ? boards.removeGrant(board.id, grant.id)
                      : boards.addGrant(board.id, {
                          kind: 'individual',
                          id: person.id,
                          label: person.displayName,
                        })
                  }
                />
                <span>{person.displayName}</span>
              </label>
            )
          })}
        </div>
      )}
    </section>
  )
}
