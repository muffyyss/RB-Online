import { defineCard } from '../../schema.js'

/**
 * OGN-137 — transcribed from the printed card.
 */
export default defineCard({
  id: 'OGN-137',
  set: 'ogn',
  name: 'Stormclaw Ursine',
  type: 'unit',
  tags: ['Freljord'],
  domains: ['body'],
  cost: { energy: 7, power: [] },
  might: 6,
  abilities: [
    {
      kind: 'passive',
      id: 'stormclaw-ursine-tank',
      text: '[Tank]',
      notImplemented: 'the Tank keyword (815) is not implemented yet',
    },
    {
      kind: 'triggered',
      id: 'stormclaw-ursine-channel',
      on: 'played',
      steps: [],
      notImplemented:
        'triggered abilities are not dispatched by the engine yet, and channelling a rune exhausted is not implemented',
    },
  ],
  text: '[Tank] (I must be assigned combat damage first.) When you play me, channel 1 rune exhausted.',
  flavor: '"The Ursine speak for man, and the wild responds." —Volibear',
})
