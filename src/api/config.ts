/**
 * Where the API is.
 *
 * Read once, at the composition root. Nothing else imports this — the client
 * takes a `baseUrl`, so every test builds one without touching the environment
 * and no module quietly depends on a build-time variable.
 *
 * The default is the development deployment rather than `localhost`: this app
 * is deployed as a standalone origin against a hosted API, so the common case
 * is a build with no override, and failing to a local port nothing is serving
 * would present as "the API is down".
 */

const DEFAULT_BASE_URL = 'https://api.dev.analytics.penilabs.com'

export function analyticsApiBaseUrl(): string {
  const configured = readEnv('VITE_ANALYTICS_API_BASE_URL')
  return configured && configured !== '' ? configured.replace(/\/+$/, '') : DEFAULT_BASE_URL
}

/** `import.meta.env` exists under Vite and not under the test runner. */
function readEnv(name: string): string | undefined {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env
    return env?.[name]
  } catch {
    return undefined
  }
}
