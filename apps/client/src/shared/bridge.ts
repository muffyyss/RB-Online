/**
 * The contract between the renderer and the main process.
 *
 * The renderer is treated like a web page: it gets no Node, no network and no
 * tokens. Everything with a secret in it — the refresh token, the guest
 * secret, the access token, the WebSocket — lives in the main process, and the
 * renderer asks for things through this narrow surface. A compromised renderer
 * (a malicious card name rendered as HTML, say) can therefore press the same
 * buttons a player could, but cannot read a credential.
 */

import type { PresetFile } from '@rb/engine'
import type { ClientMessage, RegisterFieldError, ServerMessage } from '@rb/protocol'

export type AuthState =
  | { readonly kind: 'signed-out' }
  | {
      readonly kind: 'user'
      readonly user: { readonly id: string; readonly username: string; readonly role: string }
    }
  | { readonly kind: 'guest'; readonly guest: { readonly id: string; readonly name: string } }

export type AuthResult = { readonly ok: true } | { readonly ok: false; readonly message: string }

export type RegisterResult =
  { readonly ok: true } | { readonly ok: false; readonly errors: readonly RegisterFieldError[] }

export interface RegisterForm {
  readonly username: string
  readonly email: string
  readonly password: string
  readonly inviteCode: string
  readonly acceptedTerms: boolean
}

/** Lobby messages the renderer may send; the hello is the main process's job. */
export type LobbyMessage = Exclude<ClientMessage, { type: 'hello' } | { type: 'ping' }>

/**
 * - `offline`    — not connected and not trying (signed out).
 * - `connecting` — opening, or saying hello.
 * - `online`     — welcomed; lobby messages will be accepted.
 * - `retrying`   — lost the connection; trying again shortly.
 * - `outdated`   — the server speaks another protocol version. Update the game.
 * - `replaced`   — this account connected from somewhere else.
 */
export type ConnectionStatus =
  'offline' | 'connecting' | 'online' | 'retrying' | 'outdated' | 'replaced'

export interface Settings {
  readonly serverUrl: string
}

export type Unsubscribe = () => void

export interface RbBridge {
  readonly auth: {
    state(): Promise<AuthState>
    login(username: string, password: string): Promise<AuthResult>
    register(form: RegisterForm): Promise<RegisterResult>
    playAsGuest(): Promise<AuthResult>
    logout(): Promise<void>
    onChange(listener: (state: AuthState) => void): Unsubscribe
  }
  readonly lobby: {
    status(): Promise<ConnectionStatus>
    send(message: LobbyMessage): void
    onMessage(listener: (message: ServerMessage) => void): Unsubscribe
    onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe
  }
  readonly presets: {
    load(): Promise<PresetFile>
    save(file: PresetFile): Promise<void>
  }
  readonly settings: {
    get(): Promise<Settings>
    setServerUrl(url: string): Promise<AuthResult>
  }
}

/** IPC channel names, in one place so main and preload cannot drift apart. */
export const CHANNELS = {
  authState: 'auth:state',
  authLogin: 'auth:login',
  authRegister: 'auth:register',
  authGuest: 'auth:guest',
  authLogout: 'auth:logout',
  authChanged: 'auth:changed',
  lobbyStatus: 'lobby:status',
  lobbySend: 'lobby:send',
  lobbyMessage: 'lobby:message',
  lobbyStatusChanged: 'lobby:status-changed',
  presetsLoad: 'presets:load',
  presetsSave: 'presets:save',
  settingsGet: 'settings:get',
  settingsSetServerUrl: 'settings:set-server-url',
} as const
