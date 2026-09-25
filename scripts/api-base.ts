/**
 * Where the scripts point.
 *
 * There is deliberately no default. A script that falls back to a hardcoded
 * deployment when its environment is missing is a script that acts on the
 * wrong one silently — and `create-boards` writes. An unset variable should
 * stop the run and say so, not pick a target on the operator's behalf.
 *
 * Two names are accepted so a single `.env` serves the whole repo: the app
 * must use a `VITE_`-prefixed variable because Vite exposes no others, and
 * these scripts predate it under `ANALYTICS_BASE_URL`. An explicit
 * `ANALYTICS_BASE_URL` wins, so a one-off run can point somewhere else
 * without editing the file the app reads.
 */

export const BASE_URL_VARIABLES = ['ANALYTICS_BASE_URL', 'VITE_ANALYTICS_API_BASE_URL'] as const

/**
 * The configured base URL, or an explanation and exit 2.
 *
 * Exit 2 matches what `conform` already uses for the conditions that stop a
 * run before any check happens — a refused token, an unreachable host. A
 * missing target is the same kind of thing: nothing was tested, so the exit
 * code must not read as a count of checks that failed.
 */
export function requireBaseUrl(override?: string): string {
  const fromEnv = BASE_URL_VARIABLES.map((name) => process.env[name]).find(
    (value) => value !== undefined && value.trim() !== '',
  )
  const configured = (override ?? fromEnv)?.trim()

  if (configured === undefined || configured === '') {
    console.error(
      'No API base URL is configured, and there is no default.\n\n' +
        `Set one of ${BASE_URL_VARIABLES.join(' or ')} in .env, or pass --base:\n\n` +
        '  cp .env.example .env     # then edit it\n' +
        '  bun run conform --base https://api.example.com\n',
    )
    process.exit(2)
  }

  return configured.replace(/\/+$/, '')
}
