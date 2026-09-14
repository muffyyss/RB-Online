/**
 * The WebSocket gateway: sockets in, `RoomManager` calls out.
 *
 * Every rule about rooms lives in the manager. This file only does what needs a
 * socket: authenticate the connection, parse and validate each frame, limit how
 * fast a client may talk, and notice when a player connects twice.
 *
 * Authentication is the first message, not a query string. A token in the URL
 * ends up in proxy logs and access logs; a token in a frame does not.
 */

import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import type { WebSocket } from 'ws'

import { PROTOCOL_VERSION, clientMessageSchema } from '@rb/protocol'
import type { ErrorCode, PlayerIdentity, ServerMessage } from '@rb/protocol'

import { verifyAccessToken } from '../auth/tokens.js'
import type { RoomClient, RoomManager } from './manager.js'

/**
 * Close codes. 4000–4999 is the range the WebSocket spec leaves to
 * applications; the client uses these to decide whether reconnecting is worth it.
 */
export const CLOSE = {
  /** Frames that are not our protocol, or the wrong protocol version. Don't retry. */
  badProtocol: 4000,
  /** No valid hello. Refresh the access token, then retry. */
  notAuthenticated: 4001,
  /** The same player connected elsewhere. Don't retry automatically. */
  replaced: 4002,
  /** Sending too fast. */
  flooding: 4008,
} as const

export interface GatewayOptions {
  readonly rooms: RoomManager
  readonly jwtSecret: string
  /** How long a connection may stay open without saying hello. */
  readonly helloTimeoutMs?: number
  /** Messages allowed per connection per window before it is dropped. */
  readonly messageLimit?: { readonly max: number; readonly windowMs: number }
}

interface Connection extends RoomClient {
  readonly socket: WebSocket
}

export const gateway: FastifyPluginAsync<GatewayOptions> = (
  app: FastifyInstance,
  options: GatewayOptions,
) => {
  const { rooms, jwtSecret } = options
  const helloTimeoutMs = options.helloTimeoutMs ?? 10_000
  const messageLimit = options.messageLimit ?? { max: 40, windowMs: 10_000 }

  /** Player id → their live connection. One per player. */
  const live = new Map<string, Connection>()

  app.get('/ws', { websocket: true }, (socket) => {
    let connection: Connection | null = null
    let windowStart = Date.now()
    let messagesInWindow = 0

    const send = (message: ServerMessage) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
    }
    const fail = (code: ErrorCode, message: string) => send({ type: 'error', code, message })
    const closeWith = (closeCode: number, code: ErrorCode, message: string) => {
      fail(code, message)
      socket.close(closeCode, code)
    }

    const helloTimer = setTimeout(() => {
      if (!connection) closeWith(CLOSE.notAuthenticated, 'not-authenticated', 'Say hello first.')
    }, helloTimeoutMs)

    socket.on('message', (raw, isBinary) => {
      const now = Date.now()
      if (now - windowStart >= messageLimit.windowMs) {
        windowStart = now
        messagesInWindow = 0
      }
      messagesInWindow += 1
      if (messagesInWindow > messageLimit.max) {
        return closeWith(CLOSE.flooding, 'too-many-attempts', 'Slow down.')
      }

      if (isBinary) return fail('bad-message', 'Send text frames.')
      let data: unknown
      try {
        // ws hands over a Buffer, an ArrayBuffer or fragments, depending on
        // how the frame arrived.
        const bytes = Array.isArray(raw)
          ? Buffer.concat(raw)
          : Buffer.isBuffer(raw)
            ? raw
            : Buffer.from(raw)
        data = JSON.parse(bytes.toString('utf8'))
      } catch {
        return fail('bad-message', 'That was not JSON.')
      }
      const parsed = clientMessageSchema.safeParse(data)
      if (!parsed.success) return fail('bad-message', 'Unrecognised message.')
      const message = parsed.data

      if (message.type === 'ping') return send({ type: 'pong' })

      if (message.type === 'hello') {
        if (connection) return fail('bad-message', 'Already said hello.')
        if (message.protocol !== PROTOCOL_VERSION) {
          return closeWith(CLOSE.badProtocol, 'protocol-mismatch', 'Please update the game.')
        }
        const verified = verifyAccessToken(message.accessToken, jwtSecret)
        if (!verified.ok) {
          return closeWith(CLOSE.notAuthenticated, 'not-authenticated', 'Please log in again.')
        }
        clearTimeout(helloTimer)

        const identity: PlayerIdentity = {
          id: verified.claims.sub,
          name: verified.claims.username,
          kind: verified.claims.role === 'guest' ? 'guest' : 'user',
        }
        connection = { identity, socket, send }

        const previous = live.get(identity.id)
        live.set(identity.id, connection)
        send({ type: 'welcome', you: identity })
        if (previous) {
          // Hand the seat over before closing the old socket, so its close
          // handler finds the seat already taken and leaves it alone.
          rooms.replace(previous, connection)
          previous.send({ type: 'error', code: 'replaced', message: 'Connected from elsewhere.' })
          previous.socket.close(CLOSE.replaced, 'replaced')
        }
        return
      }

      if (!connection) {
        return closeWith(CLOSE.notAuthenticated, 'not-authenticated', 'Say hello first.')
      }
      rooms.handle(connection, message)
    })

    socket.on('close', () => {
      clearTimeout(helloTimer)
      if (!connection) return
      rooms.disconnect(connection)
      if (live.get(connection.identity.id) === connection) live.delete(connection.identity.id)
    })
  })

  return Promise.resolve()
}
