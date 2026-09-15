import { defineCard } from '../../schema.js'

/**
 * OGN-013 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-013',
  set: 'ogn',
  name: 'Pouty Poro',
  type: 'unit',
  tags: ['Poro'],
  domains: ['fury'],
  cost: { energy: 2, power: [] },
  might: 2,
  abilities: [
    {
      kind: 'passive',
      id: 'pouty-poro-deflect',
      text: '[Deflect]',
      notImplemented:
        'Deflect is a cost paid as a spell is played, but targets are still chosen as it resolves (355.5), so there is no moment to charge it',
    },
  ],
  text: '[Deflect] (Opponents must pay [A] to choose me with a spell or ability.)',
  flavor: '"Braum takes medicine too, see?" —Braum',
})
