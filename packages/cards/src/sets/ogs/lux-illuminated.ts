import { defineCard } from '../../schema.js'

/**
 * OGS-006 — transcribed from the printed card.
 *
 * Needs three things the engine does not have: trigger dispatch, a condition on
 * the played spell's cost, and a Might bonus that lasts "this turn" (the `buff`
 * step adds permanent counters, which would be wrong here).
 */
export default defineCard({
  id: 'OGS-006',
  set: 'ogs',
  name: 'Lux',
  subtitle: 'Illuminated',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Lux', 'Demacia'],
  domains: ['mind'],
  cost: { energy: 6, power: [{ kind: 'domain', domain: 'mind' }] },
  might: 5,
  abilities: [
    {
      kind: 'triggered',
      id: 'lux-illuminated-empowered',
      on: 'spell-played',
      steps: [],
      notImplemented:
        'needs trigger dispatch, a spell-cost condition, and a Might bonus lasting this turn',
    },
  ],
  text: 'When you play a spell that costs [5] or more, give me +3 [Might] this turn.',
  flavor: 'No more holding back!',
})
