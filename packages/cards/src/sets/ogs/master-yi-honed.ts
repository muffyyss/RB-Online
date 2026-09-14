import { defineCard } from '../../schema.js'

/**
 * OGS-009 — transcribed from the printed card.
 *
 * Both parts are missing from the engine: [Ganking] (810) lets him move
 * battlefield to battlefield, and entering ready overrides units entering
 * exhausted (143.4). Recorded as passives until each lands.
 */
export default defineCard({
  id: 'OGS-009',
  set: 'ogs',
  name: 'Master Yi',
  subtitle: 'Honed',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Master Yi', 'Ionia'],
  domains: ['body'],
  cost: { energy: 7, power: [{ kind: 'domain', domain: 'body' }] },
  might: 6,
  abilities: [
    {
      kind: 'passive',
      id: 'master-yi-honed-ganking',
      text: '[Ganking]',
      notImplemented: 'the Ganking keyword (810) is not implemented yet',
    },
    {
      kind: 'passive',
      id: 'master-yi-honed-enter-ready',
      text: 'I enter ready.',
      notImplemented: 'entering ready is not implemented yet; units enter exhausted (143.4)',
    },
  ],
  text: '[Ganking] (I can move from battlefield to battlefield.) I enter ready.',
  flavor: 'The focused mind can pierce through stone.',
})
