/**
 * Who the player is, as far as the server is concerned.
 *
 * Owns every credential: the refresh token and guest secret (on disk, through a
 * `SecretStore`) and the short-lived access token (in memory only). The rest of
 * the client asks `accessToken()` when it needs one and never sees the others.
 *
 * Refreshing is **single-flight**. The server treats a refresh token used twice
 * as stolen and revokes the whole login, so two overlapping refreshes — a timer
 * firing just as the lobby reconnects, say — would log the player out. Every
 * caller shares one in-flight refresh instead.
 */

import { randomBytes } from 'node:crypto'
import { z } from 'zod'

import type { RegisterFieldError } from '@rb/protocol'

import type { AuthResult, AuthState, RegisterForm, RegisterResult } from '../shared/bridge.js'
import { SECRET_KEYS } from './secrets.js'
import type { SecretStore } from './secrets.js'

const MODE_KEY = 'session-mode'

/**
 * Every stored credential is keyed by the server it belongs to.
 *
 * The server address is editable. Without this, pointing the client at a
 * different server would hand that server the refresh token or guest secret
 * issued by the first — and whoever runs it could replay them there.
 */
export function secretKey(name: string, serverUrl: string): string {
  return `${name}@${new URL(serverUrl).origin}`
}

/** Refresh this long before the access token actually expires. */
const REFRESH_MARGIN_MS = 60_000
/** After a failed refresh that was not a rejection (server down), try again this soon. */
const RETRY_MS = 30_000

const userSessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  refreshToken: z.string().min(1),
  user: z.object({ id: z.string(), username: z.string(), role: z.string() }),
})

const guestSessionSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().positive(),
  guest: z.object({ id: z.string(), name: z.string() }),
})

const errorsSchema = z.object({
  errors: z.array(z.object({ field: z.string(), message: z.string() })),
})

export type Timer = (callback: () => void, ms: number) => () => void

export interface SessionOptions {
  readonly store: SecretStore
  readonly fetch: typeof fetch
  readonly serverUrl: () => string
  readonly now?: () => number
  readonly randomSecret?: () => string
  readonly setTimer?: Timer
}

interface HttpReply {
  readonly status: number
  readonly body: unknown
}

const UNREACHABLE = "Can't reach the server. Check your connection and the server address."

function firstMessage(body: unknown, fallback: string): string {
  const parsed = errorsSchema.safeParse(body)
  return parsed.success ? (parsed.data.errors[0]?.message ?? fallback) : fallback
}

const defaultTimer: Timer = (callback, ms) => {
  const handle = setTimeout(callback, ms)
  return () => clearTimeout(handle)
}

export class Session {
  private state: AuthState = { kind: 'signed-out' }
  private access: { token: string; expiresAt: number } | null = null
  private refreshing: Promise<boolean> | null = null
  private cancelTimer: (() => void) | null = null
  private readonly listeners = new Set<(state: AuthState) => void>()

  private readonly store: SecretStore
  private readonly http: typeof fetch
  private readonly serverUrl: () => string
  private readonly now: () => number
  private readonly randomSecret: () => string
  private readonly setTimer: Timer

  constructor(options: SessionOptions) {
    this.store = options.store
    this.http = options.fetch
    this.serverUrl = options.serverUrl
    this.now = options.now ?? Date.now
    this.randomSecret = options.randomSecret ?? (() => randomBytes(32).toString('base64url'))
    this.setTimer = options.setTimer ?? defaultTimer
  }

  getState(): AuthState {
    return this.state
  }

  onChange(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Pick up where the last run left off: a saved login, or the guest the
   * player was last playing as. Otherwise stay signed out.
   */
  async restore(): Promise<void> {
    const mode = await this.store.get(this.key(MODE_KEY))
    if (mode === 'user' && (await this.store.get(this.key(SECRET_KEYS.refreshToken)))) {
      await this.refresh()
    } else if (mode === 'guest' && (await this.store.get(this.key(SECRET_KEYS.guestSecret)))) {
      await this.playAsGuest()
    }
  }

  async login(username: string, password: string): Promise<AuthResult> {
    let reply: HttpReply
    try {
      reply = await this.post('/api/auth/login', { username, password })
    } catch {
      return { ok: false, message: UNREACHABLE }
    }
    if (reply.status === 429) {
      return { ok: false, message: 'Too many attempts. Wait a few minutes and try again.' }
    }
    const session = userSessionSchema.safeParse(reply.body)
    if (reply.status !== 200 || !session.success) {
      return { ok: false, message: firstMessage(reply.body, 'Login failed.') }
    }
    await this.becomeUser(session.data)
    return { ok: true }
  }

  /**
   * Register, then log straight in with the same credentials.
   *
   * A player registering from inside a guest session brings the guest along:
   * the server links it to the new account, and the guest secret is dropped.
   */
  async register(form: RegisterForm): Promise<RegisterResult> {
    const fromGuest = this.state.kind === 'guest'
    const guestSecret = fromGuest ? await this.store.get(this.key(SECRET_KEYS.guestSecret)) : null

    let reply: HttpReply
    try {
      reply = await this.post('/api/auth/register', {
        ...form,
        ...(guestSecret === null ? {} : { guestSecret }),
      })
    } catch {
      return { ok: false, errors: [{ field: 'form', message: UNREACHABLE }] }
    }
    if (reply.status === 429) {
      return {
        ok: false,
        errors: [
          { field: 'form', message: 'Too many attempts. Wait a few minutes and try again.' },
        ],
      }
    }
    if (reply.status !== 201) {
      const parsed = errorsSchema.safeParse(reply.body)
      const errors: RegisterFieldError[] = parsed.success
        ? parsed.data.errors.map((e) => ({
            field: isRegisterField(e.field) ? e.field : 'form',
            message: e.message,
          }))
        : [{ field: 'form', message: 'Registration failed.' }]
      return { ok: false, errors }
    }

    if (guestSecret !== null) await this.store.delete(this.key(SECRET_KEYS.guestSecret))
    const loggedIn = await this.login(form.username, form.password)
    return loggedIn.ok
      ? { ok: true }
      : { ok: false, errors: [{ field: 'form', message: loggedIn.message }] }
  }

  async playAsGuest(): Promise<AuthResult> {
    let secret = await this.store.get(this.key(SECRET_KEYS.guestSecret))
    if (!secret) {
      secret = this.randomSecret()
      await this.store.set(this.key(SECRET_KEYS.guestSecret), secret)
    }

    let reply: HttpReply
    try {
      reply = await this.post('/api/auth/guest', { guestSecret: secret })
    } catch {
      return { ok: false, message: UNREACHABLE }
    }
    if (reply.status === 409) {
      // This machine's guest became an account. Forget it; the next "play as
      // guest" starts a new one.
      await this.store.delete(this.key(SECRET_KEYS.guestSecret))
      await this.signOut()
      return { ok: false, message: firstMessage(reply.body, 'Please log in to your account.') }
    }
    const session = guestSessionSchema.safeParse(reply.body)
    if ((reply.status !== 200 && reply.status !== 201) || !session.success) {
      return { ok: false, message: firstMessage(reply.body, 'Could not start a guest session.') }
    }

    this.access = {
      token: session.data.accessToken,
      expiresAt: this.now() + session.data.expiresIn * 1000,
    }
    await this.store.set(this.key(MODE_KEY), 'guest')
    this.schedule(session.data.expiresIn * 1000 - REFRESH_MARGIN_MS)
    this.setState({ kind: 'guest', guest: session.data.guest })
    return { ok: true }
  }

  async logout(): Promise<void> {
    const refreshToken = await this.store.get(this.key(SECRET_KEYS.refreshToken))
    if (this.state.kind === 'user' && refreshToken) {
      // Best effort. If the server is unreachable the token still dies with
      // the local copy, and expires on the server in time.
      await this.post('/api/auth/logout', { refreshToken }).catch(() => undefined)
    }
    await this.store.delete(this.key(SECRET_KEYS.refreshToken))
    await this.signOut()
  }

  /**
   * A usable access token, refreshing first if it is about to expire.
   * Null when signed out, or when the session could not be renewed.
   */
  async accessToken(): Promise<string | null> {
    if (this.state.kind === 'signed-out') return null
    if (this.access && this.access.expiresAt - this.now() > REFRESH_MARGIN_MS / 2) {
      return this.access.token
    }
    return (await this.renew()) ? (this.access?.token ?? null) : null
  }

  private async renew(): Promise<boolean> {
    if (this.state.kind === 'guest') return (await this.playAsGuest()).ok
    if (this.state.kind === 'user') return this.refresh()
    return false
  }

  /** Stop timers. The session object is not usable afterwards. */
  dispose(): void {
    this.cancelTimer?.()
    this.cancelTimer = null
    this.listeners.clear()
  }

  private refresh(): Promise<boolean> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = await this.store.get(this.key(SECRET_KEYS.refreshToken))
    if (!refreshToken) {
      await this.signOut()
      return false
    }

    let reply: HttpReply
    try {
      reply = await this.post('/api/auth/refresh', { refreshToken })
    } catch {
      // The server is down, not saying no. Keep the player signed in and try
      // again shortly; the token on disk is still good.
      this.schedule(RETRY_MS)
      return false
    }

    const session = userSessionSchema.safeParse(reply.body)
    if (reply.status !== 200 || !session.success) {
      if (reply.status === 429) {
        this.schedule(RETRY_MS)
        return false
      }
      await this.store.delete(this.key(SECRET_KEYS.refreshToken))
      await this.signOut()
      return false
    }
    await this.becomeUser(session.data)
    return true
  }

  private async becomeUser(session: z.infer<typeof userSessionSchema>): Promise<void> {
    // Store the new refresh token before anything else: if the process dies
    // after this point, the rotated-away token on disk would be "reuse".
    await this.store.set(this.key(SECRET_KEYS.refreshToken), session.refreshToken)
    await this.store.set(this.key(MODE_KEY), 'user')
    this.access = { token: session.accessToken, expiresAt: this.now() + session.expiresIn * 1000 }
    this.schedule(session.expiresIn * 1000 - REFRESH_MARGIN_MS)
    this.setState({ kind: 'user', user: session.user })
  }

  private async signOut(): Promise<void> {
    this.cancelTimer?.()
    this.cancelTimer = null
    this.access = null
    await this.store.delete(this.key(MODE_KEY))
    this.setState({ kind: 'signed-out' })
  }

  private schedule(ms: number): void {
    this.cancelTimer?.()
    this.cancelTimer = this.setTimer(
      () => {
        this.cancelTimer = null
        // Renew unconditionally: the token is deliberately still valid when
        // this fires, so asking accessToken() would just hand it back.
        void this.renew()
      },
      Math.max(ms, 1000),
    )
  }

  private key(name: string): string {
    return secretKey(name, this.serverUrl())
  }

  private setState(state: AuthState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }

  private async post(path: string, body: unknown): Promise<HttpReply> {
    const response = await this.http(new URL(path, this.serverUrl()), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = null
    }
    return { status: response.status, body: parsed }
  }
}

function isRegisterField(field: string): field is RegisterFieldError['field'] {
  return ['username', 'email', 'password', 'inviteCode', 'acceptedTerms', 'form'].includes(field)
}
