/**
 * Electron main process: the window, and the services the renderer asks for.
 */

import { BrowserWindow, app, protocol, safeStorage, session as electronSession } from 'electron'
import type { WebContents } from 'electron'
import { join } from 'node:path'

import { ART_SCHEME, CardArt, manifestPaths } from './art.js'
import { CHANNELS } from '../shared/bridge.js'
import type { AuthState } from '../shared/bridge.js'
import { registerIpc } from './ipc.js'
import { LobbyConnection } from './lobby.js'
import type { SocketLike } from './lobby.js'
import { PresetStore } from './presets.js'
import { FileSecretStore } from './secrets.js'
import { Session } from './session.js'
import { DEFAULT_SERVER_URL, SettingsStore } from './settings.js'

/** Set by electron-vite in development; absent in a packaged build. */
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL']
const RENDERER_FILE = join(import.meta.dirname, '../renderer/index.html')

/**
 * `--profile=<name>` keeps a separate data folder — separate login, guest and
 * decks — so two copies can run side by side on one machine for testing a room.
 */
const profile = process.argv
  .find((arg) => arg.startsWith('--profile='))
  ?.slice('--profile='.length)
  .replace(/[^a-zA-Z0-9_-]/g, '')
if (profile) app.setPath('userData', `${app.getPath('userData')}-${profile}`)

// Every renderer sandboxed, whatever a window's own options say.
app.enableSandbox()

// Card faces come from `rb-art://card/<id>`, served by the main process. It has
// to be declared before the app is ready for the renderer to load images from it.
protocol.registerSchemesAsPrivileged([
  { scheme: ART_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function deliver(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function isTrusted(sender: WebContents, frameUrl: string | undefined): boolean {
  if (!mainWindow || sender !== mainWindow.webContents || !frameUrl) return false
  if (DEV_SERVER_URL) return frameUrl.startsWith(DEV_SERVER_URL)
  return (
    frameUrl.startsWith('file://') &&
    decodeURI(frameUrl).replace(/\\/g, '/').endsWith(RENDERER_FILE.replace(/\\/g, '/'))
  )
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f1419',
    autoHideMenuBar: true,
    title: 'Riftbound Online',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })

  // The board draws the cards from the window's height, so a bigger window is
  // bigger cards: open on the whole screen and let the player shrink it.
  window.once('ready-to-show', () => {
    window.maximize()
    window.show()
  })

  // No popups and no navigating away: this window only ever shows our UI.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())

  if (DEV_SERVER_URL) void window.loadURL(DEV_SERVER_URL)
  else void window.loadFile(RENDERER_FILE)

  return window
}

async function main(): Promise<void> {
  await app.whenReady()

  // Deny every permission prompt (camera, notifications, …); the game needs none.
  electronSession.defaultSession.setPermissionRequestHandler((_contents, _permission, grant) =>
    grant(false),
  )

  const userData = app.getPath('userData')
  new CardArt(
    manifestPaths(join(import.meta.dirname, '../renderer')),
    join(userData, 'card-art'),
  ).register()

  const settings = new SettingsStore(
    join(userData, 'settings.json'),
    process.env['RB_SERVER_URL'] ?? DEFAULT_SERVER_URL,
  )
  await settings.get()

  const secrets = new FileSecretStore(join(userData, 'secrets.json'), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (cipher) => safeStorage.decryptString(cipher),
  })

  const session = new Session({
    store: secrets,
    fetch: globalThis.fetch,
    serverUrl: () => settings.current().serverUrl,
  })

  const lobby = new LobbyConnection({
    serverUrl: () => settings.current().serverUrl,
    accessToken: () => session.accessToken(),
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    onMessage: (message) => deliver(CHANNELS.lobbyMessage, message),
    onStatus: (status) => deliver(CHANNELS.lobbyStatusChanged, status),
  })

  // Connect while signed in; reconnect as the new identity when it changes
  // (a guest registering, say), so the server never sees the old one.
  let identity = 'signed-out'
  session.onChange((state: AuthState) => {
    deliver(CHANNELS.authChanged, state)
    const next =
      state.kind === 'user'
        ? `user:${state.user.id}`
        : state.kind === 'guest'
          ? `guest:${state.guest.id}`
          : 'signed-out'
    if (next === identity) return
    identity = next
    lobby.stop()
    if (next !== 'signed-out') lobby.start()
  })

  registerIpc({
    session,
    lobby,
    presets: new PresetStore(join(userData, 'presets.json')),
    settings,
    isTrusted,
    deliver,
  })

  mainWindow = createWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('window-all-closed', () => {
    lobby.stop()
    session.dispose()
    app.quit()
  })

  await session.restore()
}

void main()
