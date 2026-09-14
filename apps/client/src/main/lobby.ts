/**
 * The lobby WebSocket, held by the main process.
 *
 * Opens a socket, says hello with a fresh access token, and keeps the
 * connection alive: pings while idle (proxies drop quiet sockets), reconnects
 * with backoff when it drops, and gives up only when retrying cannot help —
 * a protocol mismatch, or the account connecting from somewhere else.
 *
 * A dropped connection loses the room: the server treats a closed socket as
 * leaving. The renderer is told the status changed and clears its room view.
 */

import { PROTOCOL_VERSION } from '@rb/protocol'
import type { ServerMessage } from '@rb/protocol'

import type { ConnectionStatus, LobbyMessage } from '../shared/bridge.js'
import type { Timer } from './session.js'

/** Close codes the server uses; mirrors apps/server/src/rooms/gateway.ts. */
const CLOSE = { badProtocol: 4000, notAuthenticated: 4001, replaced: 4002 } as const

const PING_INTERVAL_MS = 25_000
const MAX_BACKOFF_MS = 30_000
/** Consecutive auth rejections before we stop and let the session sort itself out. */
const MAX_AUTH_FAILURES = 2

/** The subset of the WHATWG WebSocket this needs, so tests can supply a fake. */
export interface SocketLike {
  send(data: string): void
  close(code?: number): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: (() => void) | null
}

export interface LobbyOptions {
  readonly serverUrl: () => string
  readonly accessToken: () => Promise<string | null>
  readonly openSocket: (url: string) => SocketLike
  readonly onMessage: (message: ServerMessage) => void
  readonly onStatus: (status: ConnectionStatus) => void
  readonly setTimer?: Timer
}

/** `https://game.example` → `wss://game.example/ws`. */
export function lobbyUrl(serverUrl: string): string {
  const url = new URL('/ws', serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

const defaultTimer: Timer = (callback, ms) => {
  const handle = setTimeout(callback, ms)
  return () => clearTimeout(handle)
}

export class LobbyConnection {
  private current: ConnectionStatus = 'offline'
  private socket: SocketLike | null = null
  private wanted = false
  private attempt = 0
  private authFailures = 0
  private cancelRetry: (() => void) | null = null
  private cancelPing: (() => void) | null = null
  private readonly setTimer: Timer

  constructor(private readonly options: LobbyOptions) {
    this.setTimer = options.setTimer ?? defaultTimer
  }

  get status(): ConnectionStatus {
    return this.current
  }

  /** Connect, and keep reconnecting until `stop`. */
  start(): void {
    this.wanted = true
    this.attempt = 0
    this.authFailures = 0
    if (!this.socket && !this.cancelRetry) void this.open()
  }

  stop(): void {
    this.wanted = false
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    socket?.close(1000)
    this.setStatus('offline')
  }

  /** Send a lobby message. False when not connected, so the caller can say so. */
  send(message: LobbyMessage): boolean {
    if (this.current !== 'online' || !this.socket) return false
    this.socket.send(JSON.stringify(message))
    return true
  }

  private async open(): Promise<void> {
    this.setStatus(this.attempt === 0 ? 'connecting' : 'retrying')
    const token = await this.options.accessToken()
    if (!this.wanted) return
    if (!token) {
      // Signed out, or the session could not be renewed right now.
      this.retryLater()
      return
    }

    const socket = this.options.openSocket(lobbyUrl(this.options.serverUrl()))
    this.socket = socket

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, accessToken: token }))
    }
    socket.onmessage = (event) => {
      if (this.socket !== socket || typeof event.data !== 'string') return
      let message: ServerMessage
      try {
        message = JSON.parse(event.data) as ServerMessage
      } catch {
        return
      }
      if (message.type === 'pong') return
      if (message.type === 'welcome') {
        this.attempt = 0
        this.authFailures = 0
        this.setStatus('online')
        this.schedulePing()
      }
      this.options.onMessage(message)
    }
    socket.onerror = () => {
      // Always followed by a close event, which does the work.
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.cancelPing?.()
      this.cancelPing = null
      this.handleClose(event.code)
    }
  }

  private handleClose(code: number): void {
    if (!this.wanted) {
      this.setStatus('offline')
      return
    }
    if (code === CLOSE.badProtocol) {
      this.wanted = false
      this.setStatus('outdated')
      return
    }
    if (code === CLOSE.replaced) {
      this.wanted = false
      this.setStatus('replaced')
      return
    }
    if (code === CLOSE.notAuthenticated) {
      this.authFailures += 1
      if (this.authFailures > MAX_AUTH_FAILURES) {
        this.wanted = false
        this.setStatus('offline')
        return
      }
    }
    this.retryLater()
  }

  private retryLater(): void {
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt)
    this.attempt += 1
    this.setStatus('retrying')
    this.cancelRetry?.()
    this.cancelRetry = this.setTimer(() => {
      this.cancelRetry = null
      if (this.wanted) void this.open()
    }, delay)
  }

  private schedulePing(): void {
    this.cancelPing?.()
    this.cancelPing = this.setTimer(() => {
      this.cancelPing = null
      if (this.current !== 'online' || !this.socket) return
      this.socket.send(JSON.stringify({ type: 'ping' }))
      this.schedulePing()
    }, PING_INTERVAL_MS)
  }

  private clearTimers(): void {
    this.cancelRetry?.()
    this.cancelRetry = null
    this.cancelPing?.()
    this.cancelPing = null
  }

  private setStatus(status: ConnectionStatus): void {
    if (status === this.current) return
    this.current = status
    this.options.onStatus(status)
  }
}
