import { describe, expect, it } from 'vitest'

import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  checkRegistration,
  isCommonPassword,
  isReservedUsername,
  normaliseEmail,
  normaliseUsername,
} from '../src/account.js'

const valid = {
  username: 'muffy',
  email: 'muffy@example.com',
  password: 'correct1horse',
  inviteCode: 'ABC123',
  acceptedTerms: true as const,
}

const fieldsFor = (input: unknown) => checkRegistration(input).map((e) => e.field)

describe('a valid registration', () => {
  it('passes with no errors', () => {
    expect(checkRegistration(valid)).toEqual([])
  })

  it('accepts the shortest and longest allowed passwords', () => {
    expect(fieldsFor({ ...valid, password: 'a'.repeat(PASSWORD_MIN) })).toEqual([])
    expect(fieldsFor({ ...valid, password: 'a'.repeat(PASSWORD_MAX) })).toEqual([])
  })
})

describe('password rules — letters and digits, 8 to 16 (project owner)', () => {
  it('rejects anything shorter than 8', () => {
    expect(fieldsFor({ ...valid, password: 'abc123' })).toContain('password')
  })

  it('rejects anything longer than 16', () => {
    expect(fieldsFor({ ...valid, password: 'a'.repeat(PASSWORD_MAX + 1) })).toContain('password')
  })

  it('rejects symbols and spaces', () => {
    for (const password of ['password!', 'pass word', 'pa$$word1', 'héllo123', 'pass\tword']) {
      expect(fieldsFor({ ...valid, password })).toContain('password')
    }
  })

  it('accepts mixed case and digits', () => {
    expect(fieldsFor({ ...valid, password: 'AbCd1234' })).toEqual([])
  })

  it('rejects the obvious guesses even though they fit the rules', () => {
    // With symbols banned and length capped, the space is small enough that
    // refusing the common ones outright is worth it.
    expect(isCommonPassword('password123')).toBe(true)
    expect(fieldsFor({ ...valid, password: 'password123' })).toContain('password')
    expect(isCommonPassword('correct1horse')).toBe(false)
  })

  it('does not trim passwords — spaces are simply illegal here', () => {
    // Trimming would silently change what someone typed and let two different
    // inputs become the same password.
    expect(fieldsFor({ ...valid, password: ' abcd1234 ' })).toContain('password')
  })
})

describe('username rules', () => {
  it('rejects too short and too long', () => {
    expect(fieldsFor({ ...valid, username: 'ab' })).toContain('username')
    expect(fieldsFor({ ...valid, username: 'a'.repeat(17) })).toContain('username')
  })

  it('allows letters, digits, underscore and hyphen', () => {
    for (const username of ['Muffy', 'muffy_99', 'a-b-c', 'ABC123']) {
      expect(fieldsFor({ ...valid, username })).toEqual([])
    }
  })

  it('rejects spaces and punctuation', () => {
    for (const username of ['muffy 99', 'muffy!', 'muffy.', 'muffy@x', 'муффи']) {
      expect(fieldsFor({ ...valid, username })).toContain('username')
    }
  })

  it('refuses reserved names, whatever the case', () => {
    expect(isReservedUsername('admin')).toBe(true)
    expect(isReservedUsername('ADMIN')).toBe(true)
    expect(isReservedUsername('  Moderator ')).toBe(true)
    expect(fieldsFor({ ...valid, username: 'Admin' })).toContain('username')
    expect(isReservedUsername('muffy')).toBe(false)
  })

  it('normalises for uniqueness comparison', () => {
    expect(normaliseUsername('  Muffy  ')).toBe('muffy')
    expect(normaliseUsername('MUFFY')).toBe(normaliseUsername('muffy'))
  })
})

describe('email rules', () => {
  it('rejects anything that is not an address', () => {
    for (const email of ['not-an-email', 'a@', '@b.com', 'a b@c.com', '']) {
      expect(fieldsFor({ ...valid, email })).toContain('email')
    }
  })

  it('normalises case and whitespace for uniqueness', () => {
    expect(normaliseEmail('  Muffy@Example.COM ')).toBe('muffy@example.com')
  })
})

describe('the invite code and terms', () => {
  it('requires an invite code — registration is gated', () => {
    expect(fieldsFor({ ...valid, inviteCode: '' })).toContain('inviteCode')
    expect(fieldsFor({ ...valid, inviteCode: '   ' })).toContain('inviteCode')
  })

  it('requires the terms to be ticked, not merely present', () => {
    expect(fieldsFor({ ...valid, acceptedTerms: false })).toContain('acceptedTerms')
    const { acceptedTerms: _omitted, ...without } = valid
    expect(fieldsFor(without)).toContain('acceptedTerms')
  })
})

describe('reporting', () => {
  it('returns every problem at once so a form can mark all its fields', () => {
    const found = fieldsFor({
      username: 'x',
      email: 'nope',
      password: 'short',
      inviteCode: '',
      acceptedTerms: false,
    })
    expect(new Set(found)).toEqual(
      new Set(['username', 'email', 'password', 'inviteCode', 'acceptedTerms']),
    )
  })

  it('handles junk input without throwing', () => {
    for (const junk of [null, undefined, 42, 'text', [], {}]) {
      expect(() => checkRegistration(junk)).not.toThrow()
      expect(checkRegistration(junk).length).toBeGreaterThan(0)
    }
  })
})
