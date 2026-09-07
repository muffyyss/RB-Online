import { defineCard } from '../../schema.js'

/**
 * OGS-014 — transcribed from the printed card.
 *
 * "Use only to play spells" is a restriction on how the added Energy may be
 * *spent*. The rulebook has no general notion of restricted resources, but card
 * text supersedes rules text (Golden Rule, 001), so the Rune Pool keeps such
 * resources in their own bucket and payment checks what is being paid for.
 */
export default defineCard({
  id: 'OGS-014',
  set: 'ogs',
  name: 'Lux',
  subtitle: 'Crownguard',
  type: 'unit',
  supertypes: ['champion'],
  tags: ['Lux', 'Demacia'],
  domains: ['order'],
  cost: { energy: 4, power: [] },
  might: 2,
  abilities: [
    {
      kind: 'activated',
      id: 'lux-crownguard-ramp',
      exhaust: true,
      keywords: ['reaction'],
      steps: [{ op: 'add', energy: 2, onlyFor: ['spell'] }],
    },
  ],
  text: '[E] [Reaction] — Add [2]. Use only to play spells.',
  flavor: "I've been hiding my light long enough.",
})
