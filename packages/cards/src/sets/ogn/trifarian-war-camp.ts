import { defineCard } from '../../schema.js'

/**
 * OGN-294 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-294',
  set: 'ogn',
  name: 'Trifarian War Camp',
  type: 'battlefield',
  domains: [],
  abilities: [
    {
      kind: 'passive',
      id: 'trifarian-war-camp-might',
      text: 'Units here have +1 Might.',
      // Any player's units, attackers included.
      effect: { kind: 'might', amount: 1, to: { kind: 'unit', at: 'here' } },
    },
  ],
  text: 'Units here have +1 [Might]. (This includes attackers.)',
})
