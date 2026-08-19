/**
 * Distribution & access for one Dashboard — UC-05.
 *
 * The load-bearing detail is FR-DA-08: a Share Grant naming someone outside the
 * Scope does not take effect, *and the Author is told why*. A Grant that
 * silently does nothing is the failure this requirement exists to prevent, so
 * every Grant here states its own verdict rather than sitting in a list looking
 * like it worked.
 */

import { useEffect, useState } from 'react'
import { usePorts } from '../composition-root'
import { evaluateGrants } from '../access/dashboard-access'
import { describeScope } from '../domain/dashboard'
import type { GrantVerdict } from '../access/dashboard-access'
import type { OrgScopeRef } from '../access/port'
import type { Dashboard, DashboardScope, ShareGrant } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

export function AccessPanel({
  dashboard,
  onChange,
}: {
  dashboard: Dashboard
  onChange: (next: Dashboard) => void
}) {
  const { ports, viewer, pinned, togglePin } = usePorts()

  const [directory, setDirectory] = useState<{
    individuals: ViewerIdentity[]
    groups: OrgScopeRef[]
  }>({ individuals: [], groups: [] })
  const [verdicts, setVerdicts] = useState<GrantVerdict[]>([])
  const [recipient, setRecipient] = useState('')

  useEffect(() => {
    ports.authorization.directory().then(setDirectory)
  }, [ports.authorization])

  useEffect(() => {
    evaluateGrants(dashboard, ports.authorization).then(setVerdicts)
  }, [dashboard, ports.authorization])

  const isAuthor = dashboard.authorId === viewer.id

  const setScope = (scope: DashboardScope) => onChange({ ...dashboard, scope })

  const addGrant = () => {
    if (!recipient) return
    const [kind, id] = recipient.split(':') as ['individual' | 'group', string]
    const label =
      kind === 'individual'
        ? (directory.individuals.find((i) => i.id === id)?.displayName ?? id)
        : (directory.groups.find((g) => g.scopeId === id)?.label ?? id)

    if (dashboard.shareGrants.some((g) => g.recipientKind === kind && g.recipientId === id)) return

    const grant: ShareGrant = {
      id: `${kind}-${id}`,
      recipientKind: kind,
      recipientId: id,
      recipientLabel: label,
    }
    onChange({ ...dashboard, shareGrants: [...dashboard.shareGrants, grant] })
    setRecipient('')
  }

  const removeGrant = (id: string) =>
    onChange({ ...dashboard, shareGrants: dashboard.shareGrants.filter((g) => g.id !== id) })

  const scopeChoices: { id: string; label: string; scope: DashboardScope }[] = [
    { id: 'personal', label: 'Personal', scope: { kind: 'personal' } },
    ...directory.groups.map((group) => ({
      id: group.scopeId,
      label: group.label,
      scope: {
        kind: 'organizational-scope' as const,
        scopeId: group.scopeId,
        label: group.label,
      },
    })),
    { id: 'organization-wide', label: 'Organization-wide', scope: { kind: 'organization-wide' } },
  ]

  const currentScopeId =
    dashboard.scope.kind === 'organizational-scope' ? dashboard.scope.scopeId : dashboard.scope.kind

  return (
    <div className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--analytics-text-secondary)]">Scope</span>
        {isAuthor ? (
          <div className="flex flex-wrap gap-1">
            {scopeChoices.map((choice) => (
              <button
                key={choice.id}
                onClick={() => setScope(choice.scope)}
                className={[
                  'text-xs rounded border px-2 py-0.5 border-[var(--analytics-border)]',
                  currentScopeId === choice.id
                    ? 'bg-[var(--analytics-surface-hover)] text-[var(--analytics-text)]'
                    : 'text-[var(--analytics-text-secondary)]',
                ].join(' ')}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-xs text-[var(--analytics-text)]">
            {describeScope(dashboard.scope)}
          </span>
        )}

        {/* FR-DA-13 — pin to personal navigation. */}
        <button
          onClick={() => togglePin(dashboard.id)}
          className="ml-auto text-xs rounded border px-2 py-0.5 border-[var(--analytics-border)] text-[var(--analytics-text-secondary)]"
        >
          {pinned.includes(dashboard.id) ? '★ Pinned' : '☆ Pin'}
        </button>
      </div>

      {isAuthor && (
        <div className="border-t border-[var(--analytics-border)] pt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--analytics-text-secondary)]">Share with</span>
            <select
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              className="rounded border border-[var(--analytics-border)] bg-[var(--analytics-surface)] text-[var(--analytics-text)] px-2 py-0.5 text-xs"
            >
              <option value="">Choose a recipient…</option>
              <optgroup label="People">
                {directory.individuals
                  .filter((identity) => identity.id !== dashboard.authorId)
                  .map((identity) => (
                    <option key={identity.id} value={`individual:${identity.id}`}>
                      {identity.displayName}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Groups">
                {directory.groups.map((group) => (
                  <option key={group.scopeId} value={`group:${group.scopeId}`}>
                    {group.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <button
              onClick={addGrant}
              disabled={!recipient}
              className="text-xs rounded border px-2 py-0.5 border-[var(--analytics-border)] text-[var(--analytics-text)] disabled:opacity-40"
            >
              Add Grant
            </button>
          </div>

          {dashboard.shareGrants.length === 0 ? (
            <p className="text-xs text-[var(--analytics-text-muted)] m-0">
              No Share Grants. Everyone within the Scope can see this Dashboard.
            </p>
          ) : (
            <ul className="list-none p-0 m-0 space-y-1">
              {dashboard.shareGrants.map((grant) => {
                const verdict = verdicts.find((v) => v.grantId === grant.id)
                const effective = verdict?.effective ?? false

                return (
                  <li key={grant.id} className="flex items-start gap-2 text-xs">
                    <span
                      className="rounded-full border px-1.5 py-0.5 shrink-0"
                      style={{
                        color: effective
                          ? 'var(--analytics-status-positive)'
                          : 'var(--analytics-status-warning)',
                        borderColor: effective
                          ? 'var(--analytics-status-positive)'
                          : 'var(--analytics-status-warning)',
                      }}
                    >
                      {effective ? 'In effect' : 'No effect'}
                    </span>
                    <span className="text-[var(--analytics-text)]">
                      {grant.recipientLabel}
                      {grant.recipientKind === 'group' && ' (group)'}
                      {effective && verdict && verdict.reach > 1 && (
                        <span className="text-[var(--analytics-text-muted)]">
                          {' '}
                          — reaches {verdict.reach} people
                        </span>
                      )}
                    </span>
                    {!effective && verdict?.reason && (
                      <span className="text-[var(--analytics-status-warning)] flex-1">
                        {verdict.reason}
                      </span>
                    )}
                    <button
                      onClick={() => removeGrant(grant.id)}
                      className="ml-auto text-[var(--analytics-text-muted)] underline shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {dashboard.shareGrants.some((g) => verdicts.find((v) => v.grantId === g.id)?.effective) && (
            <p className="text-xs text-[var(--analytics-text-muted)] m-0">
              Grants narrow the audience: only the named recipients within the Scope now see this
              Dashboard.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
