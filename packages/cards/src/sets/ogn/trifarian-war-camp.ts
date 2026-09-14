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
      notImplemented: 'location-based Might needs the continuous-effect layer',
    },
  ],
  text: 'Units here have +1 [Might]. (This includes attackers.)',
})
