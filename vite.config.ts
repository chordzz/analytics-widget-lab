import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * The API base URL is required, and there is no default anywhere.
 *
 * Checked here rather than only at runtime because the value is baked into the
 * bundle at build time: by the time the app throws, the broken artefact has
 * already been produced and, plausibly, deployed. A build that cannot say
 * which API it talks to should not complete.
 *
 * `loadEnv` reads the `.env` files *and* the process environment, so a hosted
 * build that sets the variable in CI passes without one.
 */
const BASE_URL_VARIABLE = 'VITE_ANALYTICS_API_BASE_URL'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const baseUrl = env[BASE_URL_VARIABLE]?.trim()

  if (!baseUrl) {
    throw new Error(
      `${BASE_URL_VARIABLE} is not set, and there is no default.\n\n` +
        '  cp .env.example .env     # then point it at the API you mean\n\n' +
        'In a hosted build, set it in the deployment environment instead.',
    )
  }

  return { plugins: [react(), tailwindcss()] }
})
