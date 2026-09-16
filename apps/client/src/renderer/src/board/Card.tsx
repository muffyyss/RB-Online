/**
 * A card on the table.
 *
 * The face is the printed card, fetched by the main process; until it arrives
 * (or if there is no art at all) the same element draws a frame with the card's
 * name, cost, Might and text, so the board is always readable and never jumps.
 *
 * A card is shown the way it would be on a playmat: upright while ready, turned
 * sideways while exhausted (414), with damage and the Might it currently has —
 * not the printed number — where a player can see them at a glance.
 */

import { useState } from 'react'

import { cardFullName, getCard } from '@rb/cards'
import type { CardDefinition } from '@rb/cards'

import { artUrl } from './art.js'

export type CardSize = 'board' | 'hand' | 'tiny' | 'zoom'

export interface CardProps {
  /** Absent for a card this player may not see: it shows a back. */
  readonly cardId?: string | undefined
  readonly size?: CardSize
  /** Turned sideways, as an exhausted card is on the table (414). */
  readonly exhausted?: boolean
  /** Current Might, after buffs, bonuses and keywords. */
  readonly might?: number | undefined
  readonly damage?: number
  readonly role?: 'attacker' | 'defender' | undefined
  /** Might above the printed number, for the "+N" pill. */
  readonly bonus?: number
  readonly keywords?: readonly string[]
  readonly selected?: boolean
  readonly playable?: boolean
  readonly targeted?: boolean
  readonly onClick?: () => void
  /** Told which card the cursor is over, so the mat can show it big. */
  readonly onHover?: (cardId: string | null) => void
}

function energyOf(card: CardDefinition | undefined): number | null {
  return card?.cost ? card.cost.energy : null
}

/** One pip per Power symbol, coloured by the domain it must be paid with. */
function powerPips(card: CardDefinition | undefined): readonly string[] {
  return (card?.cost?.power ?? []).map((symbol) =>
    symbol.kind === 'domain' ? symbol.domain : 'any',
  )
}

export function Card(props: CardProps) {
  const { cardId, size = 'board', exhausted = false, damage = 0 } = props
  const [art, setArt] = useState<'waiting' | 'shown' | 'missing'>('waiting')
  const card = cardId === undefined ? undefined : getCard(cardId)
  const domain = card?.domains[0] ?? 'none'
  const energy = energyOf(card)

  // Battlefields are printed landscape; everything else portrait.
  const landscape = card?.type === 'battlefield'

  const classes = [
    'rb-card',
    `rb-card--${size}`,
    landscape ? 'rb-card--wide' : '',
    art === 'shown' ? 'has-art' : '',
    `rb-domain--${domain}`,
    exhausted ? 'is-exhausted' : '',
    props.selected ? 'is-selected' : '',
    props.playable ? 'is-playable' : '',
    props.targeted ? 'is-targeted' : '',
    props.role ? `is-${props.role}` : '',
    cardId === undefined ? 'is-back' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const label = cardId === undefined ? 'Hidden card' : card ? cardFullName(card) : cardId
  const Tag = props.onClick ? 'button' : 'div'

  return (
    <Tag
      className={classes}
      type={props.onClick ? 'button' : undefined}
      onClick={props.onClick}
      onMouseEnter={() => props.onHover?.(cardId ?? null)}
      onMouseLeave={() => props.onHover?.(null)}
      title={card?.text ? `${label} — ${card.text}` : label}
      aria-label={label}
    >
      {cardId !== undefined && art !== 'missing' && (
        <img
          className="rb-card-art"
          src={artUrl(cardId)}
          alt=""
          onLoad={() => setArt('shown')}
          onError={() => setArt('missing')}
        />
      )}

      {/* The frame under the art: all that shows when there is none. */}
      <span className="rb-card-frame">
        <span className="rb-card-name">{label}</span>
        {card && (
          <span className="rb-card-type">
            {card.supertypes?.length ? `${card.supertypes.join(' ')} ` : ''}
            {card.type}
          </span>
        )}
        {(size === 'hand' || size === 'zoom') && card?.text && (
          <span className="rb-card-text">{card.text}</span>
        )}
      </span>

      {/* The printed cost is on the face; without one, draw it. */}
      {art !== 'shown' && energy !== null && <span className="rb-card-energy">{energy}</span>}
      {art !== 'shown' && powerPips(card).length > 0 && (
        <span className="rb-card-power">
          {powerPips(card).map((pip, index) => (
            <i key={index} className={`rb-pip rb-domain--${pip}`} />
          ))}
        </span>
      )}

      {/* Might is drawn when the printed number is no longer the truth. */}
      {props.might !== undefined && (art !== 'shown' || props.bonus !== 0 || damage > 0) && (
        <span className={`rb-card-might ${props.bonus ? 'is-boosted' : ''}`}>
          {props.might}
          {damage > 0 && <b className="rb-card-damage">-{damage}</b>}
        </span>
      )}

      {props.keywords && props.keywords.length > 0 && (
        <span className="rb-card-keywords">{props.keywords.join(' · ')}</span>
      )}
      {props.role && <span className="rb-card-role">{props.role}</span>}
      {exhausted && <span className="rb-card-tag">exhausted</span>}
    </Tag>
  )
}
