/**
 * The match screen: the playmat, wired to the match this client is in.
 *
 * All it does is hand the board the view the server sent and a way to send an
 * action back. The board decides nothing about the rules, and this decides
 * nothing about the board.
 */

import type { GameAction } from '@rb/engine'

import { Playmat } from '../board/Playmat.js'
import type { MatchSession } from '../../../shared/match.js'
import { useStore } from '../store.js'

export function Match({ session }: { session: MatchSession }) {
  const dismiss = useStore((s) => s.dismissMatch)
  const view = session.view
  if (!view) return <div className="splash">Setting up the match…</div>

  const send = (action: GameAction): void => {
    window.rb.lobby.send({ type: 'match.action', matchId: session.id, action })
  }
  return <Playmat mat={{ session, view, send }} onDismiss={dismiss} />
}
