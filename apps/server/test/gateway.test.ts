import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { WebSocket as RealWebSocket } from 'ws'
import type { WebSocket } from 'ws'

import { PROTOCOL_VERSION } from '@rb/protocol'
import type { ClientMessage, ServerMessage } from '@rb/protocol'

import { buildApp } from '../src/app.js'
import type { AppOptions } from '../src/app.js'
import type { Database } from '../src/auth/register.js'
import { issueAccessToken } from '../src/auth/tokens.js'
import type { Config } from '../src/config.js'
import { CLOSE } from '../src/rooms/gateway.js'
import { RoomManager } from '../src/rooms/manager.js'
import { TEST_JWT_SECRET } from './support/db.js'

/**
 * The gateway over real WebSocket frames, via `injectWS` — no port, but the
 * real upgrade, parsing and close codes. Room rules themselves are covered in
 * rooms.test.ts; this is about the socket layer.
 */

const config: Config = {
  DATABASE_URL: 'postgres://unused',
  PORT: 0,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  REGISTER_RATE_LIMIT: 100,
  REGISTER_RATE_WINDOW: '1 minute',
  REVEAL_DUPLICATES: true,
  JWT_SECRET: TEST_JWT_SECRET,
  LOGIN_RATE_LIMIT: 100,
  LOGIN_RATE_WINDOW: '1 minute',
}

// A deck code that decodes; legality is not the room's concern.
const DECK = 'RB1|legend|champion|3xA|12xR|B1,B2,B3'

let app: FastifyInstance
let rooms: RoomManager

async function start(gateway: AppOptions['gateway'] = {}): Promise<void> {
  rooms = new RoomManager({ checkDeck: () => null })
  // The lobby never touches the database, so none is provided.
  app = await buildApp({ db: {} as Database, config, rooms, gateway })
  await app.ready()
}

afterEach(async () => {
  await app?.close()
})

const token = (name: string, role = 'player') =>
  issueAccessToken({ sub: `id-${name}`, username: name, role }, TEST_JWT_SECRET)

interface Peer {
  readonly ws: WebSocket
  send(message: ClientMessage | Record<string, unknown>): void
  next(): Promise<ServerMessage>
  /** Skip messages until one of this type arrives. */
  until<T extends ServerMessage['type']>(type: T): Promise<Extract<ServerMessage, { type: T }>>
  readonly closed: Promise<number>
}

async function connect(): Promise<Peer> {
  const ws = await app.injectWS('/ws')
  const queue: ServerMessage[] = []
  const waiters: ((message: ServerMessage) => void)[] = []
  ws.on('message', (data: Buffer) => {
    const message = JSON.parse(data.toString()) as ServerMessage
    const waiter = waiters.shift()
    if (waiter) waiter(message)
    else queue.push(message)
  })
  const closed = new Promise<number>((resolve) => ws.on('close', (code: number) => resolve(code)))

  const next = () =>
    new Promise<ServerMessage>((resolve, reject) => {
      const queued = queue.shift()
      if (queued) return resolve(queued)
      const waiter = (message: ServerMessage) => {
        clearTimeout(timer)
        resolve(message)
      }
      // A timed-out waiter must leave the queue, or it swallows the next message.
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1)
        reject(new Error('no message within 2s'))
      }, 2000)
      waiters.push(waiter)
    })

  return {
    ws,
    send: (message) => ws.send(JSON.stringify(message)),
    next,
    async until(type) {
      for (;;) {
        const message = await next()
        if (message.type === type) return message as never
      }
    },
    closed,
  }
}

async function hello(name: string, role = 'player'): Promise<Peer> {
  const peer = await connect()
  peer.send({ type: 'hello', protocol: PROTOCOL_VERSION, accessToken: token(name, role) })
  await peer.until('welcome')
  return peer
}

describe('authenticating a connection', () => {
  it('welcomes a valid token with the player identity', async () => {
    await start()
    const peer = await connect()
    peer.send({ type: 'hello', protocol: PROTOCOL_VERSION, accessToken: token('Muffy') })
    expect(await peer.next()).toEqual({
      type: 'welcome',
      you: { id: 'id-Muffy', name: 'Muffy', kind: 'user' },
    })
  })

  it('treats a guest token as a guest', async () => {
    await start()
    const peer = await connect()
    peer.send({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      accessToken: token('Guest000001', 'guest'),
    })
    const welcome = await peer.until('welcome')
    expect(welcome.you.kind).toBe('guest')

    peer.send({ type: 'room.create', deck: DECK })
    expect(await peer.next()).toMatchObject({ type: 'error', code: 'guests-cannot-host' })
  })

  it('closes on a forged token', async () => {
    await start()
    const peer = await connect()
    const forged = issueAccessToken(
      { sub: 'x', username: 'x', role: 'admin' },
      'some-other-secret-that-is-long-enough',
    )
    peer.send({ type: 'hello', protocol: PROTOCOL_VERSION, accessToken: forged })
    expect(await peer.next()).toMatchObject({ type: 'error', code: 'not-authenticated' })
    expect(await peer.closed).toBe(CLOSE.notAuthenticated)
  })

  it('closes a client on another protocol version', async () => {
    await start()
    const peer = await connect()
    peer.send({ type: 'hello', protocol: PROTOCOL_VERSION + 1, accessToken: token('Muffy') })
    expect(await peer.next()).toMatchObject({ code: 'protocol-mismatch' })
    expect(await peer.closed).toBe(CLOSE.badProtocol)
  })

  it('closes a client that tries lobby messages before hello', async () => {
    await start()
    const peer = await connect()
    peer.send({ type: 'room.create', deck: DECK })
    expect(await peer.closed).toBe(CLOSE.notAuthenticated)
    expect(rooms.size).toBe(0)
  })

  it('closes a connection that never says hello', async () => {
    await start({ helloTimeoutMs: 50 })
    const peer = await connect()
    expect(await peer.closed).toBe(CLOSE.notAuthenticated)
  })
})

describe('frames', () => {
  it('answers ping, even before hello', async () => {
    await start()
    const peer = await connect()
    peer.send({ type: 'ping' })
    expect(await peer.next()).toEqual({ type: 'pong' })
  })

  it('rejects junk without dropping the connection', async () => {
    await start()
    const peer = await hello('Muffy')
    peer.ws.send('{ not json')
    expect(await peer.next()).toMatchObject({ type: 'error', code: 'bad-message' })
    peer.send({ type: 'room.explode' })
    expect(await peer.next()).toMatchObject({ type: 'error', code: 'bad-message' })
    peer.send({ type: 'ping' })
    expect(await peer.next()).toEqual({ type: 'pong' })
  })

  it('drops a client that floods', async () => {
    await start({ messageLimit: { max: 5, windowMs: 60_000 } })
    const peer = await connect()
    for (let i = 0; i < 10; i += 1) peer.send({ type: 'ping' })
    expect(await peer.closed).toBe(CLOSE.flooding)
  })
})

describe('a room over the wire', () => {
  it('goes from create to join to both ready', async () => {
    await start()
    const host = await hello('Host')
    const friend = await hello('Friend')

    host.send({ type: 'room.create', deck: DECK })
    const { room } = await host.until('room.state')
    expect(room.status).toBe('waiting')

    friend.send({ type: 'room.join', code: room.code.toLowerCase(), deck: DECK })
    expect((await friend.until('room.state')).room.status).toBe('full')
    expect((await host.until('room.state')).room.seats).toHaveLength(2)

    host.send({ type: 'room.ready', ready: true })
    await friend.until('room.state')
    friend.send({ type: 'room.ready', ready: true })
    expect((await host.until('room.state')).room.status).toBe('full') // host's own ready echo
    expect((await host.until('room.state')).room.status).toBe('starting')
  })

  it('removes a player who closes the socket cleanly, over a real port', async () => {
    // injectWS's in-memory stream does not complete a close handshake, so this
    // one case listens for real: a player quitting the client closes cleanly.
    await start()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (typeof address !== 'object' || address === null) throw new Error('no address')
    const url = `ws://127.0.0.1:${String(address.port)}/ws`

    const open = (name: string) =>
      new Promise<WebSocket>((resolve, reject) => {
        const ws = new RealWebSocket(url)
        ws.on('error', reject)
        ws.on('message', (data: Buffer) => {
          const message = JSON.parse(data.toString()) as ServerMessage
          if (message.type === 'welcome') resolve(ws)
        })
        ws.on('open', () =>
          ws.send(
            JSON.stringify({ type: 'hello', protocol: PROTOCOL_VERSION, accessToken: token(name) }),
          ),
        )
      })

    const host = await open('Host')
    const friend = await open('Friend')
    const hostStates: ServerMessage[] = []
    host.on('message', (data: Buffer) => hostStates.push(JSON.parse(data.toString()) as never))

    host.send(JSON.stringify({ type: 'room.create', deck: DECK }))
    await expect.poll(() => hostStates.length).toBe(1)
    const created = hostStates[0]
    if (created?.type !== 'room.state') throw new Error('expected room state')
    friend.send(JSON.stringify({ type: 'room.join', code: created.room.code, deck: DECK }))
    await expect.poll(() => hostStates.length).toBe(2)

    friend.close()
    await expect.poll(() => hostStates.length).toBe(3)
    const after = hostStates[2]
    expect(after?.type === 'room.state' && after.room.seats.length).toBe(1)
    host.close()
  })

  it('removes a player whose connection drops', async () => {
    await start()
    const host = await hello('Host')
    const friend = await hello('Friend')
    host.send({ type: 'room.create', deck: DECK })
    const { room } = await host.until('room.state')
    friend.send({ type: 'room.join', code: room.code, deck: DECK })
    await host.until('room.state')

    friend.ws.terminate()
    expect((await host.until('room.state')).room.seats).toHaveLength(1)
  })

  it('moves a player to their new connection and closes the old one', async () => {
    await start()
    const host = await hello('Host')
    const first = await hello('Friend')
    host.send({ type: 'room.create', deck: DECK })
    const { room } = await host.until('room.state')
    first.send({ type: 'room.join', code: room.code, deck: DECK })
    await first.until('room.state')
    await host.until('room.state')

    const second = await hello('Friend')
    // The new connection is told where it is sitting.
    expect((await second.until('room.state')).room.yourSeat).toBe(1)
    expect(await first.until('error')).toMatchObject({ code: 'replaced' })
    expect(await first.closed).toBe(CLOSE.replaced)

    // The seat survived the old socket closing, and follows the new one.
    host.send({ type: 'room.ready', ready: true })
    const seen = await second.until('room.state')
    expect(seen.room.seats).toHaveLength(2)
    expect(seen.room.seats[0]?.ready).toBe(true)
  })
})
