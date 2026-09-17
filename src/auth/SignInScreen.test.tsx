/**
 * The sign-in screen, as someone signing in actually reads it.
 *
 * Four of these assert properties of the API rather than choices of ours, and
 * those are the ones worth keeping when the wording changes:
 *
 *   - the form never reveals whether an address has an account
 *   - a rejected code and an unavailable service do not read alike
 *   - no password is collected, because this flow has none
 *   - a dead code cannot be submitted
 *
 * Static markup only — the repo has no DOM test runner, so the two panes are
 * rendered directly rather than driven through `SignInScreen`'s own state.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SignInCodeStep, SignInEmailStep, type CodeStepState } from './SignInScreen'
import type { SignInFailure } from './port'

const noop = () => {}

const emailPane = (failure: SignInFailure | null = null, busy = false) =>
  renderToStaticMarkup(
    <SignInEmailStep
      email="someone@smcdao.com"
      onEmailChange={noop}
      busy={busy}
      failure={failure}
      onSubmit={noop}
    />,
  )

const codePane = (
  overrides: Partial<CodeStepState> = {},
  failure: SignInFailure | null = null,
  code = '123456',
) =>
  renderToStaticMarkup(
    <SignInCodeStep
      step={{
        name: 'code',
        email: 'someone@smcdao.com',
        expiresInSeconds: 300,
        sentAt: Date.now(),
        ...overrides,
      }}
      code={code}
      onCodeChange={noop}
      busy={false}
      failure={failure}
      onSubmit={noop}
      onResend={noop}
      onUseAnother={noop}
    />,
  )

/** Visible words only — class names are not what anyone reads. */
const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()

describe('the form does not say who has an account', () => {
  test('delivery is stated conditionally', () => {
    /*
     * `/auth/request-otp` answers identically whether or not the address is
     * registered, precisely so this form cannot be used to find out. Copy that
     * says "we sent you a code" hands back the answer the endpoint withheld.
     */
    expect(words(codePane())).toContain('is registered')
  })

  test('and no wording claims the address is unknown', () => {
    const said = `${words(emailPane())} ${words(codePane())}`.toLowerCase()
    for (const leak of ['no account', 'not registered', "doesn't exist", 'unknown email']) {
      expect(said).not.toContain(leak)
    }
  })
})

describe('a rejected code and an unavailable service do not read alike', () => {
  const rejected: SignInFailure = { kind: 'rejected', message: "That code wasn't right." }
  const unavailable: SignInFailure = {
    kind: 'unavailable',
    message: 'Sign-in is temporarily unavailable.',
  }

  test('the two produce different sentences', () => {
    // A 401 and a 503. One means look again, the other means come back later,
    // and someone told the wrong one retypes a code that was already correct.
    expect(words(codePane({}, rejected))).not.toEqual(words(codePane({}, unavailable)))
  })

  test('neither blames the person for the service being down', () => {
    const said = words(codePane({}, unavailable)).toLowerCase()
    expect(said).toContain('unavailable')
    expect(said).not.toContain('wrong')
  })

  test('an error is announced, not just coloured', () => {
    // Colour is not available to everyone, and this is the one message on the
    // screen that has to interrupt.
    expect(codePane({}, rejected)).toContain('role="alert"')
  })
})

describe('no password is collected', () => {
  test('there is no password field on either pane', () => {
    /*
     * Structural, not stylistic. The API is explicit — "No password, no second
     * factor, no device approval" — so a password input here would be a field
     * with nowhere to send its value, and the worst place to discover that is
     * after someone has typed a real password into it.
     */
    for (const markup of [emailPane(), codePane()]) {
      expect(markup).not.toContain('type="password"')
      expect(markup.toLowerCase()).not.toContain('password')
    }
  })
})

describe('a code has a visible life', () => {
  test('time remaining is shown while it is alive', () => {
    expect(words(codePane())).toMatch(/Expires in \d/)
  })

  test('an expired code says so instead of counting down', () => {
    const dead = codePane({ sentAt: Date.now() - 600_000 })
    expect(words(dead)).toContain('has expired')
    expect(words(dead)).not.toContain('Expires in')
  })

  test('and cannot be submitted', () => {
    // Otherwise the only feedback is a rejection that reads as "wrong code"
    // when the code was right and merely late.
    expect(codePane({ sentAt: Date.now() - 600_000 })).toMatch(/<button[^>]*type="submit"[^>]*disabled/)
  })
})

describe('the fields help rather than get in the way', () => {
  test('the email field is an email field', () => {
    // Lower-cased before matching: React serializes these attributes in the
    // casing they were written, and HTML parses them case-insensitively, so the
    // casing is React's business rather than a property of the screen.
    const markup = emailPane().toLowerCase()
    expect(markup).toContain('type="email"')
    expect(markup).toContain('autocomplete="email"')
  })

  test('the code field offers one-time-code autofill', () => {
    // So a phone or a Mac can lift the code straight out of the email.
    expect(codePane().toLowerCase()).toContain('autocomplete="one-time-code"')
  })

  test('and does not cap its own length', () => {
    /*
     * The API documents neither the code's length nor its alphabet (question 4
     * to the backend team). A field built on a guess silently truncates a longer
     * code, which presents as "that code wasn't right" forever.
     */
    expect(codePane().toLowerCase()).not.toContain('maxlength')
    expect(codePane().toLowerCase()).not.toContain('pattern=')
  })

  test('submitting is blocked while a field is empty', () => {
    expect(codePane({}, null, '')).toMatch(/<button[^>]*type="submit"[^>]*disabled/)
  })
})

describe('a wrong code is recoverable without starting over', () => {
  test('both ways out are offered', () => {
    // The email is the only state between the two steps — there is no challenge
    // token — so resending and changing address are both cheap.
    const said = words(codePane())
    expect(said).toContain('Resend code')
    expect(said).toContain('Use a different email')
  })
})
