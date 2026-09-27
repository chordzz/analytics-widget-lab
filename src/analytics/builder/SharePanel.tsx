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
import { SelectField } from '../shell/SelectField'
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
  const { authorization, viewer } = useAnalyticsData()
  const [people, setPeople] = useState<ViewerIdentity[]>([])
  const [groups, setGroups] = useState<OrgScopeRef[]>([])
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [refused, setRefused] = useState(false)

  /*
   * Departments, once. They come back whatever the query is, so re-reading
   * them on every keystroke would replace the Scope select's options with an
   * identical list — and blank it for the moment the request is in flight.
   */
  useEffect(() => {
    let live = true
    authorization
      .directory()
      .then((result) => live && setGroups(result.groups))
      .catch(() => live && setGroups([]))
    return () => {
      live = false
    }
  }, [authorization])

  /*
   * People, per search, debounced.
   *
   * A search rather than a list because the endpoint will not return everyone:
   * it runs as the caller, and an unrestricted answer would be a staff
   * directory for anyone who can open Analytics. The debounce is what keeps a
   * typed name from being four lookups, and the guard below is what keeps a
   * slow one from overwriting a later, faster one.
   */
  useEffect(() => {
    const term = query.trim()
    if (term === '') {
      setPeople([])
      setRefused(false)
      setSearching(false)
      return
    }

    let live = true
    setSearching(true)
    const timer = setTimeout(() => {
      authorization
        .directory(term)
        .then(
          (result) =>
            live &&
            (setPeople(result.individuals),
            setRefused(result.peopleRefused === true),
            setSearching(false)),
        )
        .catch(() => live && (setPeople([]), setRefused(false), setSearching(false)))
    }, 250)

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [authorization, query])

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

  /*
   * Search results worth offering: not the Author, and not anyone already
   * named. Granting yourself is a control that can only be a no-op, and a
   * person already granted belongs in the list below, where they can be
   * removed — offering them twice invites ticking a box that is already ticked.
   */
  const mayShare = useMay('dashboard.share')

  /*
   * Who may see the board is the Author's to decide, and nobody else's to read.
   *
   * The scope control was gated on `dashboard.share` and the panel around it on
   * nothing at all, so anyone reaching the builder for a board saw who it is
   * shared with and who it could be. `CreateScreen` has no authorship guard of
   * its own — it checks `dashboard.publish` and nothing more — so that was
   * reachable rather than theoretical.
   *
   * Checked here rather than at the call site, because this component owns the
   * decision and a second caller would otherwise have to remember it.
   *
   * Administrators lose it too, with the same known cost recorded in
   * `DashboardsScreen`: nothing in the model says who one is. Restoring it
   * needs a signal that does not exist yet rather than a looser rule here.
   */
  if (board.authorId !== viewer.id) return null
  const granted = new Set(board.shareGrants.map((grant) => grant.recipientId))
  const candidates = people.filter(
    (person) => person.id !== board.authorId && !granted.has(person.id),
  )

  return (
    <section className="a-share">
      <div className="a-share__row">
        <label className="a-field__label" htmlFor="board-scope">
          Who can see this
        </label>
        <SelectField
          id="board-scope"
          value={scopeValue}
          onChange={chooseScope}
          options={[
            { value: 'personal', label: 'Only you' },
            ...groups.map((group) => ({ value: `scope:${group.scopeId}`, label: group.label })),
            { value: 'organization-wide', label: 'Everyone' },
          ]}
          // Scope decides who can see the board, so it is the same decision the
          // grant list expresses and sits behind the same permission.
          disabled={!mayShare}
          label="Who can see this"
        />
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

      {mayShare && board.scope.kind !== 'personal' && (
        <div className="a-share__grants">
          <p className="a-field__help">
            Naming people <strong>narrows</strong> it to them. With nobody named, everyone in the
            scope above can see it.
          </p>

          {/*
            * Named people first, and independent of the search.
            *
            * Removing access must never require finding the person again — a
            * search that returns nothing would otherwise strand a Grant the
            * Author can see the effect of and not undo.
            */}
          {board.shareGrants.map((grant) => (
            <label key={grant.id} className="a-expose__item">
              <input
                type="checkbox"
                checked
                onChange={() => boards.removeGrant(board.id, grant.id)}
              />
              <span>{grant.recipientLabel}</span>
            </label>
          ))}

          <label className="a-field__label" htmlFor="share-search">
            Add someone
          </label>
          <input
            id="share-search"
            className="a-input"
            type="search"
            value={query}
            placeholder="Search by name"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />

          {/*
            * A search rather than a list of everyone, because the endpoint will
            * not answer without a term. Saying so beats an empty box that reads
            * as "nobody here".
            */}
          {query.trim() === '' && (
            <p className="a-field__help">Type a name to find someone to share with.</p>
          )}

          {query.trim() !== '' && searching && <p className="a-field__help">Searching…</p>}

          {/*
            * Refused and empty are different answers and must read differently.
            * The people lookup runs as the Author against the directory, which
            * grants that separately from anything Analytics holds — so a search
            * can be refused while the departments above load fine. Drawn as
            * "nobody matching", it would tell an Author their colleague does
            * not exist.
            */}
          {query.trim() !== '' && !searching && refused && (
            <p className="a-field__help">
              You do not have permission to search for people, so this cannot show
              matches. Sharing with a department above still works. Ask whoever
              administers directory access for people search.
            </p>
          )}

          {query.trim() !== '' && !searching && !refused && candidates.length === 0 && (
            <p className="a-field__help">Nobody matching “{query.trim()}”.</p>
          )}

          {candidates.map((person) => (
            <label key={person.id} className="a-expose__item">
              <input
                type="checkbox"
                checked={false}
                onChange={() =>
                  boards.addGrant(board.id, {
                    kind: 'individual',
                    id: person.id,
                    label: person.displayName,
                  })
                }
              />
              <span>{person.displayName}</span>
            </label>
          ))}
        </div>
      )}

    </section>
  )
}
