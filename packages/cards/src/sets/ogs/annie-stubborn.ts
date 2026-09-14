import { defineCard } from '../../schema.js'

/**
 * OGS-010 — transcribed from the printed card.
 *
 * Two things are missing: triggered abilities are not dispatched yet, and there
 * is no step for returning a card from the trash to hand. Recorded with no
 * steps rather than a partial version.
 */
export default defineCard({
  id: 'OGS-010',
  set: 'ogs',
  name: 'Annie',
  subtitle: 'Stubborn',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Annie', 'Noxus'],
  domains: ['chaos'],
  cost: { energy: 4, power: [{ kind: 'domain', domain: 'chaos' }] },
  might: 3,
  abilities: [
    {
      kind: 'triggered',
      id: 'annie-stubborn-return-spell',
      on: 'played',
      steps: [],
      notImplemented:
        'triggers are not dispatched yet, and there is no step to return a spell from trash to hand',
    },
  ],
  text: 'When you play me, return a spell from your trash to your hand.',
  flavor: 'I want a turn!',
})
