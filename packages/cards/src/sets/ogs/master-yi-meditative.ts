import { defineCard } from '../../schema.js'

/**
 * OGS-004 — transcribed from the printed card.
 *
 * A conditional Might bonus is a continuous effect, which the engine cannot
 * apply yet; he plays as a 4-Might body until then.
 */
export default defineCard({
  id: 'OGS-004',
  set: 'ogs',
  name: 'Master Yi',
  subtitle: 'Meditative',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Master Yi', 'Ionia'],
  domains: ['calm'],
  cost: { energy: 5, power: [{ kind: 'domain', domain: 'calm' }] },
  might: 4,
  abilities: [
    {
      kind: 'passive',
      id: 'master-yi-meditative-eight-runes',
      text: 'While you have 8+ runes, I have +4 Might.',
      notImplemented: 'conditional Might modifiers need the continuous-effect layer',
    },
  ],
  text: 'While you have 8+ runes, I have +4 [Might].',
  flavor: 'Anger gives motivation without purpose.',
})
