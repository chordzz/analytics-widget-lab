/**
 * The base URL has no default, and that is the property worth a test.
 *
 * A default here is not a convenience — it is a build that points at a
 * plausible deployment when its configuration is missing and looks entirely
 * healthy while doing it. The failure mode is reading the wrong environment's
 * data, which nothing in the UI would report. So the absence of a fallback is
 * asserted rather than left to review.
 *
 * `import.meta.env` mirrors `process.env` under Bun, which is what makes the
 * unset case reachable from a test at all.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { analyticsApiBaseUrl, BASE_URL_VARIABLE } from './config'

const original = process.env[BASE_URL_VARIABLE]

afterEach(() => {
  if (original === undefined) delete process.env[BASE_URL_VARIABLE]
  else process.env[BASE_URL_VARIABLE] = original
})

describe('analyticsApiBaseUrl', () => {
  test('refuses to invent a base URL when none is configured', () => {
    delete process.env[BASE_URL_VARIABLE]
    expect(() => analyticsApiBaseUrl()).toThrow(BASE_URL_VARIABLE)
  })

  test('treats an empty value as unset rather than as a relative base', () => {
    process.env[BASE_URL_VARIABLE] = '   '
    expect(() => analyticsApiBaseUrl()).toThrow(BASE_URL_VARIABLE)
  })

  test('returns what was configured', () => {
    process.env[BASE_URL_VARIABLE] = 'https://api.example.test'
    expect(analyticsApiBaseUrl()).toBe('https://api.example.test')
  })

  test('strips trailing slashes, which every caller concatenates a path onto', () => {
    process.env[BASE_URL_VARIABLE] = 'https://api.example.test//'
    expect(analyticsApiBaseUrl()).toBe('https://api.example.test')
  })

  test('names no deployment of its own', async () => {
    const source = await Bun.file(new URL('./config.ts', import.meta.url).pathname).text()
    expect(source).not.toMatch(/https:\/\/api\.[a-z.]*penilabs\.com/)
  })
})
