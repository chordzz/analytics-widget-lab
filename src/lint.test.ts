/**
 * The linter, run as a test.
 *
 * `bun run lint` has existed since the beginning and nothing ran it, which is
 * how a `react-hooks/rules-of-hooks` error sat in `PivotTable` from the initial
 * commit until it was found by chance. There is no CI here, so "a script exists"
 * and "the rule is enforced" are different claims, and only the second one is
 * worth anything.
 *
 * Errors only. The repository carries a handful of `only-export-components`
 * warnings that are deliberate — a module's public surface exports its types
 * and hooks alongside its components — and failing on those would mean either
 * churning the public API or turning this guard off, and the second is what
 * would actually happen.
 *
 * This is the same shape as the other source-scanning guards (`tokens.test.ts`,
 * `contract.test.ts`, `adapters.test.ts`): the property lives in the build
 * rather than in a habit.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../', import.meta.url).pathname
const oxlint = join(root, 'node_modules/.bin/oxlint')

describe('the source lints clean', () => {
  test('no errors anywhere in src/', () => {
    /*
     * `rules-of-hooks` is the one this was written for. A hook below an early
     * return is invisible to the type checker and to every test that renders
     * the component once, and it fails only when a component is rendered twice
     * with different data — which is the hardest kind of bug to reproduce and
     * the easiest to introduce.
     */
    if (!existsSync(oxlint)) {
      throw new Error(`oxlint is not installed at ${oxlint} — run \`bun install\``)
    }

    const result = Bun.spawnSync([oxlint, 'src'], { cwd: root })
    const output = `${result.stdout.toString()}${result.stderr.toString()}`

    // Reported rather than asserted on the exit code alone: a bare "expected 0,
    // got 1" sends whoever sees it to run the linter by hand to find out what
    // broke, which is a round trip the message can spend instead.
    const errors = output
      .split('\n')
      .filter((line) => / error \S/.test(line))
      .join('\n')

    expect(errors, `oxlint reported errors:\n\n${errors || output}`).toBe('')
  })
})
