/**
 * The preload bridge: the only thing the renderer can call.
 *
 * Deliberately thin. It forwards named calls over IPC and never exposes
 * `ipcRenderer` itself, which would let the renderer send on any channel.
 */

import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import { CHANNELS } from '../shared/bridge.js'
import type { RbBridge } from '../shared/bridge.js'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const bridge: RbBridge = {
  auth: {
    state: () => ipcRenderer.invoke(CHANNELS.authState),
    login: (username, password) => ipcRenderer.invoke(CHANNELS.authLogin, username, password),
    register: (form) => ipcRenderer.invoke(CHANNELS.authRegister, form),
    playAsGuest: () => ipcRenderer.invoke(CHANNELS.authGuest),
    logout: () => ipcRenderer.invoke(CHANNELS.authLogout),
    onChange: (listener) => subscribe(CHANNELS.authChanged, listener),
  },
  lobby: {
    status: () => ipcRenderer.invoke(CHANNELS.lobbyStatus),
    send: (message) => ipcRenderer.send(CHANNELS.lobbySend, message),
    onMessage: (listener) => subscribe(CHANNELS.lobbyMessage, listener),
    onStatus: (listener) => subscribe(CHANNELS.lobbyStatusChanged, listener),
  },
  presets: {
    load: () => ipcRenderer.invoke(CHANNELS.presetsLoad),
    save: (file) => ipcRenderer.invoke(CHANNELS.presetsSave, file),
  },
  settings: {
    get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
    setServerUrl: (url) => ipcRenderer.invoke(CHANNELS.settingsSetServerUrl, url),
  },
}

contextBridge.exposeInMainWorld('rb', bridge)
