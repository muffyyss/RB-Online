import { beforeEach, describe, expect, it } from 'vitest'

import type { AuthState } from '../src/shared/bridge.js'
import { MemorySecretStore, SECRET_KEYS } from '../src/main/secrets.js'
import { Session, secretKey } from '../src/main/session.js'
import type { Timer } from '../src/main/session.js'

/**
 * A stand-in server with the behaviour that matters to the client: refresh
 * tokens rotate, and presenting a rotated one is rejected. That second rule is
 * what makes a double refresh fatal, so the fake has to enforce it.
 */
class FakeServer {
  live = new Set<string>()
  refreshCalls = 0
  reuseDetected = false
  down = false
  guestCounter = 0
  guests = new Map<string, string>()
  adopted = new Set<string>()
  lastRegisterBody: Record<string, unknown> | null = null
  private issued = 0

  fetch: typeof fetch = async (input, init) => {
    if (this.down) throw new TypeError('fetch failed')
    const url = new URL(input instanceof Request ? input.url : String(input))
    const body = JSON.parse((init?.body as string | undefined) ?? 'null') as Record<string, unknown>
    await Promise.resolve() // let overlapping callers interleave, as real I/O would
    const [status, payload] = this.route(url.pathname, body)
    return new Response(payload === undefined ? null : JSON.stringify(payload), { status })
  }

  private session(username = 'muffy') {
    this.issued += 1
    const refreshToken = `refresh-${String(this.issued)}`
    this.live.add(refreshToken)
    return {
      accessToken: `access-${String(this.issued)}`,
      expiresIn: 900,
      refreshToken,
      user: { id: 'u1', username, role: 'player' },
    }
  }

  private route(path: string, body: Record<string, unknown>): [number, unknown] {
    switch (path) {
      case '/api/auth/login':
        return body.password === 'correct1horse'
          ? [200, this.session(String(body.username))]
          : [401, { errors: [{ field: 'form', message: 'Wrong username or password.' }] }]
      case '/api/auth/refresh': {
        this.refreshCalls += 1
        const token = String(body.refreshToken)
        if (!this.live.has(token)) {
          this.reuseDetected = true
          return [401, { errors: [{ field: 'form', message: 'Please log in again.' }] }]
        }
        this.live.delete(token)
        return [200, this.session()]
      }
      case '/api/auth/logout':
        this.live.delete(String(body.refreshToken))
        return [204, undefined]
      case '/api/auth/register':
        this.lastRegisterBody = body
        if (body.username === 'taken') {
          return [
            400,
            { errors: [{ field: 'username', message: 'That username is already taken.' }] },
          ]
        }
        if (typeof body.guestSecret === 'string') this.adopted.add(body.guestSecret)
        return [201, { user: { id: 'u1', username: body.username } }]
      case '/api/auth/guest': {
        const secret = String(body.guestSecret)
        if (this.adopted.has(secret)) {
          return [409, { errors: [{ field: 'form', message: 'This guest is now an account.' }] }]
        }
        let name = this.guests.get(secret)
        const created = name === undefined
        if (name === undefined) {
          this.guestCounter += 1
          name = `Guest${String(this.guestCounter).padStart(6, '0')}`
          this.guests.set(secret, name)
        }
        return [
          created ? 201 : 200,
          {
            accessToken: `guest-access-${name}`,
            expiresIn: 900,
            guest: { id: `g-${name}`, name },
            created,
          },
        ]
      }
      default:
        return [404, undefined]
    }
  }
}

const key = (name: string) => secretKey(name, 'http://game.test')

let server: FakeServer
let store: MemorySecretStore
let clock: number
let timers: { callback: () => void; at: number; cancelled: boolean }[]
let secrets: number
let serverUrl: string

const setTimer: Timer = (callback, ms) => {
  const timer = { callback, at: clock + ms, cancelled: false }
  timers.push(timer)
  return () => {
    timer.cancelled = true
  }
}

function build(): Session {
  return new Session({
    store,
    fetch: server.fetch,
    serverUrl: () => serverUrl,
    now: () => clock,
    setTimer,
    randomSecret: () => `secret-${String((secrets += 1))}-${'x'.repeat(40)}`,
  })
}

/** Advance the fake clock, firing due timers. */
async function advance(ms: number): Promise<void> {
  clock += ms
  for (const timer of timers.filter((t) => !t.cancelled && t.at <= clock)) {
    timer.cancelled = true
    timer.callback()
  }
  // Let the async work the timers started finish.
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
}

beforeEach(() => {
  server = new FakeServer()
  store = new MemorySecretStore()
  clock = 1_000_000
  timers = []
  secrets = 0
  serverUrl = 'http://game.test'
})

describe('logging in', () => {
  it('signs in, keeps the refresh token in the store, and the access token in memory', async () => {
    const session = build()
    const states: AuthState[] = []
    session.onChange((state) => states.push(state))

    expect(await session.login('muffy', 'correct1horse')).toEqual({ ok: true })
    expect(session.getState()).toEqual({
      kind: 'user',
      user: { id: 'u1', username: 'muffy', role: 'player' },
    })
    expect(states.at(-1)?.kind).toBe('user')
    expect(await store.get(key(SECRET_KEYS.refreshToken))).toBe('refresh-1')
    expect([...store.values.values()]).not.toContain('access-1')
    expect(await session.accessToken()).toBe('access-1')
  })

  it('shows the server message on a wrong password', async () => {
    const session = build()
    expect(await session.login('muffy', 'nope')).toEqual({
      ok: false,
      message: 'Wrong username or password.',
    })
    expect(session.getState().kind).toBe('signed-out')
  })

  it('says the server is unreachable rather than blaming the password', async () => {
    server.down = true
    const result = await build().login('muffy', 'correct1horse')
    expect(result.ok || result.message).toMatch(/reach the server/)
  })
})

describe('staying logged in', () => {
  it('refreshes shortly before the access token expires', async () => {
    const session = build()
    await session.login('muffy', 'correct1horse')
    await advance(900_000 - 60_000)
    expect(server.refreshCalls).toBe(1)
    expect(await session.accessToken()).toBe('access-2')
    expect(await store.get(key(SECRET_KEYS.refreshToken))).toBe('refresh-2')
  })

  it('never refreshes twice at once, which the server would treat as theft', async () => {
    const session = build()
    await session.login('muffy', 'correct1horse')
    clock += 900_000 // token expired; everyone wants a new one at the same moment

    const tokens = await Promise.all([
      session.accessToken(),
      session.accessToken(),
      session.accessToken(),
    ])
    expect(server.refreshCalls).toBe(1)
    expect(server.reuseDetected).toBe(false)
    expect(new Set(tokens)).toEqual(new Set(['access-2']))
  })

  it('resumes a saved login on the next start', async () => {
    await build().login('muffy', 'correct1horse')
    const nextRun = build()
    await nextRun.restore()
    expect(nextRun.getState().kind).toBe('user')
    expect(server.reuseDetected).toBe(false)
  })

  it('signs out when the server rejects the refresh token', async () => {
    const session = build()
    await session.login('muffy', 'correct1horse')
    server.live.clear() // revoked server-side
    clock += 900_000
    expect(await session.accessToken()).toBeNull()
    expect(session.getState().kind).toBe('signed-out')
    expect(await store.get(key(SECRET_KEYS.refreshToken))).toBeNull()
  })

  it('stays signed in through a server outage and retries', async () => {
    const session = build()
    await session.login('muffy', 'correct1horse')
    server.down = true
    await advance(900_000 - 60_000)
    expect(session.getState().kind).toBe('user')
    expect(await store.get(key(SECRET_KEYS.refreshToken))).toBe('refresh-1')

    server.down = false
    await advance(30_000)
    expect(server.refreshCalls).toBe(1)
    expect(await session.accessToken()).toBe('access-2')
  })
})

describe('logging out', () => {
  it('revokes on the server and forgets the token locally', async () => {
    const session = build()
    await session.login('muffy', 'correct1horse')
    await session.logout()
    expect(server.live.size).toBe(0)
    expect(await store.get(key(SECRET_KEYS.refreshToken))).toBeNull()
    expect(session.getState().kind).toBe('signed-out')

    const nextRun = build()
    await nextRun.restore()
    expect(nextRun.getState().kind).toBe('signed-out')
  })

  it('still logs out locally when the server is unreachable', async () => {
    const session = build()
    await session.login('muffy', 'correct1horse')
    server.down = true
    await session.logout()
    expect(session.getState().kind).toBe('signed-out')
  })
})

describe('guests', () => {
  it('generates a secret once and keeps the same guest across runs', async () => {
    const first = build()
    expect(await first.playAsGuest()).toEqual({ ok: true })
    expect(first.getState()).toEqual({
      kind: 'guest',
      guest: { id: 'g-Guest000001', name: 'Guest000001' },
    })

    const nextRun = build()
    await nextRun.restore()
    expect(nextRun.getState()).toMatchObject({ guest: { name: 'Guest000001' } })
    expect(server.guestCounter).toBe(1)
  })

  it('keeps the guest identity when a guest signs out, for next time', async () => {
    const session = build()
    await session.playAsGuest()
    await session.logout()
    await session.playAsGuest()
    expect(session.getState()).toMatchObject({ guest: { name: 'Guest000001' } })
  })

  it('brings the guest along when registering from a guest session', async () => {
    const session = build()
    await session.playAsGuest()
    const secret = await store.get(key(SECRET_KEYS.guestSecret))

    const result = await session.register({
      username: 'muffy',
      email: 'muffy@example.com',
      password: 'correct1horse',
      inviteCode: 'CODE',
      acceptedTerms: true,
    })
    expect(result).toEqual({ ok: true })
    expect(server.lastRegisterBody?.guestSecret).toBe(secret)
    expect(session.getState().kind).toBe('user')
    expect(await store.get(key(SECRET_KEYS.guestSecret))).toBeNull()
  })

  it('does not send a guest secret when registering while signed out', async () => {
    const session = build()
    await session.playAsGuest()
    await session.logout()
    await session.register({
      username: 'sam',
      email: 'sam@example.com',
      password: 'correct1horse',
      inviteCode: 'CODE',
      acceptedTerms: true,
    })
    expect(server.lastRegisterBody).not.toHaveProperty('guestSecret')
  })

  it('starts a fresh guest when the old one was adopted elsewhere', async () => {
    const session = build()
    await session.playAsGuest()
    const secret = await store.get(key(SECRET_KEYS.guestSecret))
    server.adopted.add(String(secret))

    const refused = await session.playAsGuest()
    expect(refused.ok).toBe(false)
    expect(session.getState().kind).toBe('signed-out')

    await session.playAsGuest()
    expect(session.getState()).toMatchObject({ guest: { name: 'Guest000002' } })
  })
})

describe('registration errors', () => {
  it('passes field errors through for the form', async () => {
    const result = await build().register({
      username: 'taken',
      email: 'x@example.com',
      password: 'correct1horse',
      inviteCode: 'CODE',
      acceptedTerms: true,
    })
    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'username', message: 'That username is already taken.' }],
    })
  })
})

describe('changing server', () => {
  it('never offers one server the credentials another server issued', async () => {
    await build().login('muffy', 'correct1horse')
    const seen: string[] = []
    const spying = server.fetch
    server.fetch = (input, init) => {
      seen.push((init?.body as string | undefined) ?? '')
      return spying(input, init)
    }

    serverUrl = 'https://someone-elses.example'
    const elsewhere = build()
    await elsewhere.restore()
    expect(elsewhere.getState().kind).toBe('signed-out')
    expect(seen.join()).not.toContain('refresh-1')

    await elsewhere.playAsGuest()
    serverUrl = 'http://game.test'
    const back = build()
    await back.restore()
    expect(back.getState().kind).toBe('user')
    expect(server.guestCounter).toBe(1)
  })
})
