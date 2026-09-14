/**
 * Renderer state.
 *
 * Mirrors what the main process reports — auth, connection, room — plus the
 * local preset file and which screen is showing. Nothing here is a credential:
 * the renderer never holds one.
 */

import { create } from 'zustand'

import { emptyPresetFile } from '@rb/engine'
import type { PresetFile } from '@rb/engine'
import type { ErrorCode, RoomView, ServerMessage } from '@rb/protocol'

import type { AuthState, ConnectionStatus } from '../../shared/bridge.js'

export type Screen =
  | { readonly name: 'home' }
  | { readonly name: 'decks' }
  | { readonly name: 'builder'; readonly presetId: string | null }
  | { readonly name: 'register' }

export interface Notice {
  readonly id: number
  readonly message: string
  readonly code?: ErrorCode
}

interface State {
  readonly ready: boolean
  readonly auth: AuthState
  readonly connection: ConnectionStatus
  readonly room: RoomView | null
  /** The last time the host left or we left; shown once, then cleared. */
  readonly roomClosed: 'host-left' | 'left' | null
  readonly notice: Notice | null
  readonly presets: PresetFile
  readonly selectedPresetId: string | null
  readonly screen: Screen
}

interface Actions {
  go: (screen: Screen) => void
  notify: (message: string, code?: ErrorCode) => void
  dismissNotice: () => void
  selectPreset: (id: string | null) => void
  savePresets: (file: PresetFile) => Promise<void>
}

const SELECTED_KEY = 'rb.selectedPreset'

function rememberedSelection(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}

let noticeId = 0

export const useStore = create<State & Actions>()((set, get) => ({
  ready: false,
  auth: { kind: 'signed-out' },
  connection: 'offline',
  room: null,
  roomClosed: null,
  notice: null,
  presets: emptyPresetFile(),
  selectedPresetId: rememberedSelection(),
  screen: { name: 'home' },

  go: (screen) => set({ screen }),
  notify: (message, code) => {
    noticeId += 1
    set({
      notice: code === undefined ? { id: noticeId, message } : { id: noticeId, message, code },
    })
  },
  dismissNotice: () => set({ notice: null }),

  selectPreset: (id) => {
    try {
      if (id) localStorage.setItem(SELECTED_KEY, id)
      else localStorage.removeItem(SELECTED_KEY)
    } catch {
      // Remembering the selection is a convenience; losing it is fine.
    }
    set({ selectedPresetId: id })
  },

  savePresets: async (file) => {
    const previous = get().presets
    set({ presets: file })
    try {
      await window.rb.presets.save(file)
    } catch {
      set({ presets: previous })
      get().notify('Could not save your decks. Your last saved version is kept.')
    }
  },
}))

function identityOf(auth: AuthState): string {
  if (auth.kind === 'user') return `user:${auth.user.id}`
  if (auth.kind === 'guest') return `guest:${auth.guest.id}`
  return 'signed-out'
}

function handleServerMessage(message: ServerMessage): void {
  const { notify } = useStore.getState()
  switch (message.type) {
    case 'room.state':
      useStore.setState({ room: message.room, roomClosed: null })
      return
    case 'room.closed':
      useStore.setState({ room: null, roomClosed: message.reason })
      return
    case 'error':
      notify(message.message, message.code)
      return
    default:
      return
  }
}

/** Wire the store to the bridge. Called once, before the first render. */
export function connectStore(): void {
  const { rb } = window

  rb.auth.onChange((auth) => {
    useStore.setState((state) => {
      // A token refresh reports the same identity again; only a real change
      // (signing out, a guest registering) ends the room and returns home.
      if (identityOf(auth) === identityOf(state.auth)) return { auth }
      return { auth, room: null, screen: { name: 'home' } }
    })
  })
  rb.lobby.onStatus((connection) => {
    // The server treats a dropped socket as leaving, so the room is gone too.
    useStore.setState((state) => ({
      connection,
      room: connection === 'online' ? state.room : null,
    }))
  })
  rb.lobby.onMessage(handleServerMessage)

  void Promise.all([rb.auth.state(), rb.lobby.status(), rb.presets.load()]).then(
    ([auth, connection, presets]) => {
      const selected = useStore.getState().selectedPresetId
      const stillExists = presets.presets.some((p) => p.id === selected)
      useStore.setState({
        ready: true,
        auth,
        connection,
        presets,
        selectedPresetId: stillExists ? selected : (presets.presets[0]?.id ?? null),
      })
    },
  )
}
