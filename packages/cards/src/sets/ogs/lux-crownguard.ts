import { defineCard } from '../../schema.js'

/**
 * OGS-014 — transcribed from the printed card.
 *
 * The activated ability's restriction ("Use only to play spells") is a
 * constraint on how the added Energy may be *spent*, which the DSL has no way to
 * express yet — resources in the Rune Pool are currently fungible (166). Marked
 * `notImplemented` so card-lint reports it rather than the card shipping as a
 * strictly better mana source than it should be.
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
      steps: [{ op: 'add', energy: 2 }],
      notImplemented:
        'the added Energy may only be spent on spells; the Rune Pool has no per-resource spending restriction yet',
    },
  ],
  text: '[E] [Reaction] — Add [2]. Use only to play spells.',
  flavor: "I've been hiding my light long enough.",
})
