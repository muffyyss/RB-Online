/**
 * Origins: Proving Grounds (OGS) — 24 set-exclusive cards.
 *
 * Add a card by writing its file and listing it here. Every card needs a test;
 * `npm run card-lint` fails if one does not have it.
 */

import type { CardDefinition } from '../../schema.js'

import darkChildStarter from './dark-child-starter.js'
import incinerate from './incinerate.js'
import luxCrownguard from './lux-crownguard.js'

export const OGS_CARDS: readonly CardDefinition[] = [darkChildStarter, incinerate, luxCrownguard]
