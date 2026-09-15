/**
 * Rooms and matches, wired together.
 *
 * A room that fills and readies up starts a match; a player in a match cannot
 * open or join a room until it ends. The two managers only know each other
 * through these two hooks.
 */

import { MatchManager } from './matches/manager.js'
import type { MatchManagerOptions } from './matches/manager.js'
import { checkDeckCode } from './rooms/deck.js'
import { RoomManager } from './rooms/manager.js'
import type { RoomManagerOptions } from './rooms/manager.js'

export interface Lobby {
  readonly rooms: RoomManager
  readonly matches: MatchManager
}

export function createLobby(
  options: {
    readonly rooms?: Omit<Partial<RoomManagerOptions>, 'onStart' | 'busy'>
    readonly matches?: MatchManagerOptions
  } = {},
): Lobby {
  const matches = new MatchManager(options.matches)
  const rooms = new RoomManager({
    checkDeck: checkDeckCode,
    ...options.rooms,
    busy: (playerId) => matches.isPlaying(playerId),
    onStart: (room) => matches.start(room),
  })
  return { rooms, matches }
}
