import { defineCard } from '../../schema.js'

/**
 * OGS-019 — transcribed from the printed card. Master Yi's starter Legend.
 *
 * Sets a Body/Calm Domain Identity (103.1.b). "Defends alone" is a combat
 * condition on a continuous Might bonus, which the engine cannot apply yet.
 */
export default defineCard({
  id: 'OGS-019',
  set: 'ogs',
  name: 'Wuju Bladesman',
  subtitle: 'Starter',
  type: 'legend',
  tags: ['Master Yi'],
  domains: ['body', 'calm'],
  abilities: [
    {
      kind: 'passive',
      id: 'wuju-bladesman-defends-alone',
      text: 'While a friendly unit defends alone, it gets +2 Might.',
      notImplemented: 'conditional Might modifiers need the continuous-effect layer',
    },
  ],
  text: 'While a friendly unit defends alone, it gets +2 [Might].',
})
