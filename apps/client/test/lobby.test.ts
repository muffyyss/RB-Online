import { beforeEach, describe, expect, it } from 'vitest'

import { PROTOCOL_VERSION } from '@rb/protocol'
import type { ServerMessage } from '@rb/protocol'

import type { ConnectionStatus } from '../src/shared/bridge.js'
import { LobbyConnection, lobbyUrl } from '../src/main/lobby.js'
import type { SocketLike } from '../src/main/lobby.js'
import type { Timer } from '../src/main/session.js'

class FakeSocket implements SocketLike {
  sent: unknown[] = []
  closedWith: number | null = null
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(code = 1000): void {
    this.closedWith = code
  }
  // --- driven by the test, playing the server ---
  serverOpens(): void {
    this.onopen?.()
  }
  serverSends(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  serverCloses(code: number): void {
    this.onclose?.({ code })
  }
}

let sockets: FakeSocket[]
let statuses: ConnectionStatus[]
let received: ServerMessage[]
let timers: { callback: () => void; ms: number; cancelled: boolean }[]
let token: string | null
let lobby: LobbyConnection

const setTimer: Timer = (callback, ms) => {
  const timer = { callback, ms, cancelled: false }
  timers.push(timer)
  return () => {
    timer.cancelled = true
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

/** Fire the most recent pending timer of this length. */
async function fire(ms: number): Promise<void> {
  const timer = [...timers].reverse().find((t) => !t.cancelled && t.ms === ms)
  if (!timer) throw new Error(`no pending ${String(ms)}ms timer`)
  timer.cancelled = true
  timer.callback()
  await flush()
}

const latest = () => {
  const socket = sockets.at(-1)
  if (!socket) throw new Error('no socket opened')
  return socket
}

async function connectAndWelcome(): Promise<FakeSocket> {
  lobby.start()
  await flush()
  const socket = latest()
  socket.serverOpens()
  socket.serverSends({ type: 'welcome', you: { id: 'u1', name: 'muffy', kind: 'user' } })
  return socket
}

beforeEach(() => {
  sockets = []
  statuses = []
  received = []
  timers = []
  token = 'access-1'
  lobby = new LobbyConnection({
    serverUrl: () => 'https://game.example',
    accessToken: () => Promise.resolve(token),
    openSocket: (url) => {
      const socket = new FakeSocket(url)
      sockets.push(socket)
      return socket
    },
    onMessage: (message) => received.push(message),
    onStatus: (status) => statuses.push(status),
    setTimer,
  })
})

describe('lobbyUrl', () => {
  it('uses wss for https and ws for http', () => {
    expect(lobbyUrl('https://game.example')).toBe('wss://game.example/ws')
    expect(lobbyUrl('http://127.0.0.1:3000/')).toBe('ws://127.0.0.1:3000/ws')
  })
})

describe('connecting', () => {
  it('says hello with the access token, and is online once welcomed', async () => {
    const socket = await connectAndWelcome()
    expect(socket.url).toBe('wss://game.example/ws')
    expect(socket.sent[0]).toEqual({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      accessToken: 'access-1',
    })
    expect(statuses).toEqual(['connecting', 'online'])
    expect(lobby.status).toBe('online')
    expect(received[0]?.type).toBe('welcome')
  })

  it('refuses to send lobby messages before it is online', async () => {
    lobby.start()
    await flush()
    expect(lobby.send({ type: 'room.leave' })).toBe(false)
    latest().serverOpens()
    latest().serverSends({ type: 'welcome', you: { id: 'u1', name: 'm', kind: 'user' } })
    expect(lobby.send({ type: 'room.leave' })).toBe(true)
    expect(latest().sent.at(-1)).toEqual({ type: 'room.leave' })
  })

  it('passes server messages through, but not pongs', async () => {
    const socket = await connectAndWelcome()
    socket.serverSends({ type: 'pong' })
    socket.serverSends({ type: 'room.closed', reason: 'host-left' })
    expect(received.map((m) => m.type)).toEqual(['welcome', 'room.closed'])
  })

  it('pings while idle so proxies keep the socket open', async () => {
    const socket = await connectAndWelcome()
    await fire(25_000)
    expect(socket.sent.at(-1)).toEqual({ type: 'ping' })
    await fire(25_000)
    expect(socket.sent.filter((m) => (m as { type: string }).type === 'ping')).toHaveLength(2)
  })
})

describe('when the connection drops', () => {
  it('reconnects with growing delays, and resets once welcomed again', async () => {
    const first = await connectAndWelcome()
    first.serverCloses(1006)
    expect(lobby.status).toBe('retrying')

    await fire(1000)
    latest().serverCloses(1006)
    await fire(2000)
    latest().serverCloses(1006)
    await fire(4000)
    expect(sockets).toHaveLength(4)

    latest().serverOpens()
    latest().serverSends({ type: 'welcome', you: { id: 'u1', name: 'm', kind: 'user' } })
    expect(lobby.status).toBe('online')
    latest().serverCloses(1006)
    await fire(1000) // back to the shortest delay
  })

  it('caps the delay at thirty seconds', async () => {
    await connectAndWelcome()
    for (let i = 0; i < 8; i += 1) {
      latest().serverCloses(1006)
      const pending = timers.filter((t) => !t.cancelled)
      const delay = pending.at(-1)?.ms ?? 0
      expect(delay).toBeLessThanOrEqual(30_000)
      await fire(delay)
    }
  })

  it('stops for good on a protocol mismatch', async () => {
    await connectAndWelcome()
    latest().serverCloses(4000)
    expect(lobby.status).toBe('outdated')
    expect(timers.filter((t) => !t.cancelled && t.ms !== 25_000)).toHaveLength(0)
  })

  it('stops when the account connects elsewhere, rather than fighting over the seat', async () => {
    await connectAndWelcome()
    latest().serverCloses(4002)
    expect(lobby.status).toBe('replaced')
  })

  it('gives up after repeated authentication failures', async () => {
    lobby.start()
    await flush()
    for (let i = 0; i < 3; i += 1) {
      latest().serverOpens()
      latest().serverCloses(4001)
      if (lobby.status === 'retrying') {
        await fire(timers.filter((t) => !t.cancelled).at(-1)?.ms ?? 0)
      }
    }
    expect(lobby.status).toBe('offline')
  })

  it('waits and retries when there is no token yet', async () => {
    token = null
    lobby.start()
    await flush()
    expect(sockets).toHaveLength(0)
    expect(lobby.status).toBe('retrying')

    token = 'access-2'
    await fire(1000)
    expect(sockets).toHaveLength(1)
  })
})

describe('stopping', () => {
  it('closes the socket and does not reconnect', async () => {
    const socket = await connectAndWelcome()
    lobby.stop()
    expect(socket.closedWith).toBe(1000)
    socket.serverCloses(1000)
    expect(lobby.status).toBe('offline')
    expect(timers.filter((t) => !t.cancelled)).toHaveLength(0)
  })
})
