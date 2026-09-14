import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  ACCESS_TOKEN_TTL_SECONDS,
  deviceLabel,
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
  verifyAccessToken,
} from '../src/auth/tokens.js'

const SECRET = 'a-test-secret-that-is-comfortably-long'
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0)
const claims = { sub: 'user-1', username: 'muffy', role: 'player' }

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

describe('access tokens', () => {
  it('round-trips the claims', () => {
    const token = issueAccessToken(claims, SECRET, NOW)
    const result = verifyAccessToken(token, SECRET, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.claims).toMatchObject(claims)
    expect(result.claims.exp - result.claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS)
  })

  it('rejects a token signed with another secret', () => {
    const token = issueAccessToken(claims, 'someone-elses-secret-also-quite-long', NOW)
    expect(verifyAccessToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects a token whose claims were edited after signing', () => {
    const [header, , signature] = issueAccessToken(claims, SECRET, NOW).split('.')
    const forged = b64({ ...claims, role: 'admin', iat: NOW / 1000, exp: NOW / 1000 + 900 })
    expect(verifyAccessToken(`${header}.${forged}.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'bad-signature',
    })
  })

  it('ignores alg: none — the header does not choose how we verify', () => {
    const header = b64({ alg: 'none', typ: 'JWT' })
    const body = b64({ ...claims, role: 'admin', iat: NOW / 1000, exp: NOW / 1000 + 900 })
    for (const token of [`${header}.${body}.`, `${header}.${body}.x`]) {
      expect(verifyAccessToken(token, SECRET, NOW).ok).toBe(false)
    }
  })

  it('expires on time, not a second later', () => {
    const token = issueAccessToken(claims, SECRET, NOW)
    const justBefore = NOW + ACCESS_TOKEN_TTL_SECONDS * 1000 - 1
    const atExpiry = NOW + ACCESS_TOKEN_TTL_SECONDS * 1000
    expect(verifyAccessToken(token, SECRET, justBefore).ok).toBe(true)
    expect(verifyAccessToken(token, SECRET, atExpiry)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a correctly signed token with no expiry rather than trusting it forever', () => {
    const header = b64({ alg: 'HS256', typ: 'JWT' })
    const body = b64(claims)
    const signature = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
    expect(verifyAccessToken(`${header}.${body}.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('rejects garbage without throwing', () => {
    for (const token of ['', 'abc', 'a.b', 'a.b.c.d', '..', 'x.y.z']) {
      expect(verifyAccessToken(token, SECRET, NOW).ok).toBe(false)
    }
  })

  it('rejects a signed body that is not JSON', () => {
    const header = b64({ alg: 'HS256' })
    const body = Buffer.from('not json').toString('base64url')
    const signature = createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url')
    expect(verifyAccessToken(`${header}.${body}.${signature}`, SECRET, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })
})

describe('refresh tokens', () => {
  it('are long, random and URL-safe', () => {
    const tokens = new Set(Array.from({ length: 50 }, generateRefreshToken))
    expect(tokens.size).toBe(50)
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('hash deterministically, and never to the token itself', () => {
    const token = generateRefreshToken()
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token))
    expect(hashRefreshToken(token)).not.toContain(token)
  })
})

describe('device labels', () => {
  it('shortens a user agent to a platform name', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Electron/38')).toBe('Windows')
    expect(deviceLabel('curl/8.0')).toBe('Unknown')
    expect(deviceLabel(undefined)).toBeNull()
  })
})
