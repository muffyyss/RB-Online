/**
 * Origins: Proving Grounds (OGS) — 24 set-exclusive cards.
 *
 * Every OGS card is here. The set has no Runes, Battlefields or Gear of its own:
 * the Proving Grounds decks take those from the Origins base set (OGN).
 *
 * Add a card by writing its file and listing it here. Every card needs a test;
 * `npm run card-lint` fails if one does not have it.
 */

import type { CardDefinition } from '../../schema.js'

import annieFiery from './annie-fiery.js'
import annieStubborn from './annie-stubborn.js'
import blastOfPower from './blast-of-power.js'
import darkChildStarter from './dark-child-starter.js'
import decisiveStrike from './decisive-strike.js'
import finalSpark from './final-spark.js'
import firestorm from './firestorm.js'
import flash from './flash.js'
import garenCommander from './garen-commander.js'
import garenRugged from './garen-rugged.js'
import gentlemensDuel from './gentlemens-duel.js'
import highlander from './highlander.js'
import incinerate from './incinerate.js'
import ladyOfLuminosityStarter from './lady-of-luminosity-starter.js'
import luxCrownguard from './lux-crownguard.js'
import luxIlluminated from './lux-illuminated.js'
import masterYiHoned from './master-yi-honed.js'
import masterYiMeditative from './master-yi-meditative.js'
import mightOfDemaciaStarter from './might-of-demacia-starter.js'
import recruitTheVanguard from './recruit-the-vanguard.js'
import tibbers from './tibbers.js'
import vanguardAttendant from './vanguard-attendant.js'
import wujuBladesmanStarter from './wuju-bladesman-starter.js'
import zephyrSage from './zephyr-sage.js'

/** In collector-number order, OGS-001 to OGS-024. */
export const OGS_CARDS: readonly CardDefinition[] = [
  annieFiery,
  firestorm,
  incinerate,
  masterYiMeditative,
  zephyrSage,
  luxIlluminated,
  garenRugged,
  gentlemensDuel,
  masterYiHoned,
  annieStubborn,
  flash,
  blastOfPower,
  garenCommander,
  luxCrownguard,
  recruitTheVanguard,
  vanguardAttendant,
  darkChildStarter,
  tibbers,
  wujuBladesmanStarter,
  highlander,
  ladyOfLuminosityStarter,
  finalSpark,
  mightOfDemaciaStarter,
  decisiveStrike,
]
