import { describe, expect, it } from 'vitest'

import { loadConfig } from '../src/config.js'

const base = {
  DATABASE_URL: 'postgres://localhost/test',
  JWT_SECRET: 'a-real-secret-that-is-comfortably-long-enough',
}

describe('loadConfig', () => {
  it('accepts a minimal environment and fills in defaults', () => {
    const config = loadConfig(base)
    expect(config.PORT).toBe(3000)
    expect(config.LOGIN_RATE_LIMIT).toBe(10)
    expect(config.REVEAL_DUPLICATES).toBe(true)
  })

  it('refuses to start without a signing secret', () => {
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_SECRET/)
  })

  it('refuses a short secret', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/32 characters/)
  })

  it('refuses the placeholder from .env.example, even though it is long enough', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'CHANGE_ME_TO_A_LONG_RANDOM_STRING' })).toThrow(
      /example value/,
    )
  })

  it('lists every problem at once', () => {
    expect(() => loadConfig({})).toThrow(
      /DATABASE_URL[\s\S]*JWT_SECRET|JWT_SECRET[\s\S]*DATABASE_URL/,
    )
  })
})
