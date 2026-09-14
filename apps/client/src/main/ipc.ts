/**
 * The main-process side of the bridge.
 *
 * Every handler checks who is asking and what they sent. The renderer is our
 * own code, but it renders data from a server and from other players, and it
 * is the part of an Electron app an attacker reaches first — so it is treated
 * as a web page that has to prove each request.
 */

import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { ipcMain } from 'electron'
import { z } from 'zod'

import { clientMessageSchema } from '@rb/protocol'
import type { ServerMessage } from '@rb/protocol'

import { CHANNELS } from '../shared/bridge.js'
import type { AuthResult, LobbyMessage, RegisterResult } from '../shared/bridge.js'
import type { LobbyConnection } from './lobby.js'
import type { PresetStore } from './presets.js'
import type { Session } from './session.js'
import type { SettingsStore } from './settings.js'

export interface IpcDependencies {
  readonly session: Session
  readonly lobby: LobbyConnection
  readonly presets: PresetStore
  readonly settings: SettingsStore
  /** True only for our own window's top frame. */
  readonly isTrusted: (sender: WebContents, frameUrl: string | undefined) => boolean
  readonly deliver: (channel: string, payload: unknown) => void
}

const loginArgs = z.tuple([z.string().max(64), z.string().max(64)])
const registerArgs = z.tuple([
  z.object({
    username: z.string().max(64),
    email: z.string().max(320),
    password: z.string().max(64),
    inviteCode: z.string().max(64),
    acceptedTerms: z.boolean(),
  }),
])
const urlArgs = z.tuple([z.string().max(512)])
/** The renderer may not say hello (that carries the token) or ping (ours to do). */
const lobbyMessage = clientMessageSchema.refine(
  (message): message is LobbyMessage => message.type !== 'hello' && message.type !== 'ping',
)

export function registerIpc(deps: IpcDependencies): void {
  const { session, lobby, presets, settings, isTrusted } = deps

  const handle = <T>(channel: string, handler: (args: unknown[]) => Promise<T> | T): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!isTrusted(event.sender, event.senderFrame?.url)) {
        throw new Error('untrusted sender')
      }
      return handler(args)
    })
  }

  handle(CHANNELS.authState, () => session.getState())

  handle(CHANNELS.authLogin, (args) => {
    const parsed = loginArgs.safeParse(args)
    if (!parsed.success) return { ok: false, message: 'Invalid request.' } satisfies AuthResult
    return session.login(...parsed.data)
  })

  handle(CHANNELS.authRegister, (args): Promise<RegisterResult> | RegisterResult => {
    const parsed = registerArgs.safeParse(args)
    if (!parsed.success) {
      return { ok: false, errors: [{ field: 'form', message: 'Invalid request.' }] }
    }
    return session.register(parsed.data[0])
  })

  handle(CHANNELS.authGuest, () => session.playAsGuest())
  handle(CHANNELS.authLogout, () => session.logout())

  handle(CHANNELS.lobbyStatus, () => lobby.status)

  ipcMain.on(CHANNELS.lobbySend, (event: IpcMainEvent, raw: unknown) => {
    if (!isTrusted(event.sender, event.senderFrame?.url)) return
    const parsed = lobbyMessage.safeParse(raw)
    if (!parsed.success) return
    if (!lobby.send(parsed.data)) {
      const notice: ServerMessage = {
        type: 'error',
        code: 'not-authenticated',
        message: 'Not connected to the server right now.',
      }
      deps.deliver(CHANNELS.lobbyMessage, notice)
    }
  })

  handle(CHANNELS.presetsLoad, () => presets.load())
  handle(CHANNELS.presetsSave, async (args) => {
    await presets.save(args[0])
  })

  handle(CHANNELS.settingsGet, () => settings.get())
  handle(CHANNELS.settingsSetServerUrl, async (args): Promise<AuthResult> => {
    const parsed = urlArgs.safeParse(args)
    if (!parsed.success) return { ok: false, message: 'Invalid address.' }
    if (session.getState().kind !== 'signed-out') {
      return { ok: false, message: 'Log out before changing server.' }
    }
    return (await settings.setServerUrl(parsed.data[0]))
      ? { ok: true }
      : {
          ok: false,
          message: 'Use an https:// address (plain http only works on your own network).',
        }
  })
}
