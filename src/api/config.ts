/**
 * Where the API is.
 *
 * Read once, at the composition root. Nothing else imports this — the client
 * takes a `baseUrl`, so every test builds one without touching the environment
 * and no module quietly depends on a build-time variable.
 *
 * There is no default, deliberately. A default is a deployment that points
 * somewhere plausible when its configuration is missing, and the failure looks
 * like working software: the app loads, signs in against the wrong deployment,
 * and reads somebody else's data. A build with nothing configured must not be
 * producible, which is why `vite.config.ts` refuses to start or build without
 * this variable — the throw below is the backstop for a bundle that somehow
 * got past it.
 */

/** The only name the app reads. Vite exposes no variable without the prefix. */
export const BASE_URL_VARIABLE = 'VITE_ANALYTICS_API_BASE_URL'

export function analyticsApiBaseUrl(): string {
  const configured = readEnv(BASE_URL_VARIABLE)?.trim()
  if (configured === undefined || configured === '') {
    throw new Error(
      `${BASE_URL_VARIABLE} is not set. This build has no API to talk to. ` +
        'Set it in .env (see .env.example) or in the deployment environment.',
    )
  }
  return configured.replace(/\/+$/, '')
}

/**
 * Vite serialises the whole `import.meta.env` object into the bundle, so a
 * lookup by name resolves at runtime rather than being substituted textually.
 * Under Bun `import.meta.env` mirrors `process.env`, which is what lets one
 * `.env` file serve both the app and the scripts.
 */
function readEnv(name: string): string | undefined {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env
    return env?.[name]
  } catch {
    return undefined
  }
}
