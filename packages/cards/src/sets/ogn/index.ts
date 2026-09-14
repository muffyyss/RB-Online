/**
 * Origins (OGN) — the base set. Only the cards the four Proving Grounds
 * decks use are entered so far: their Runes, Battlefields and Main Deck
 * cards. The rest of the set is added as it is needed.
 */

import type { CardDefinition } from '../../schema.js'

import disintegrate from './disintegrate.js'
import furyRune from './fury-rune.js'
import poutyPoro from './pouty-poro.js'
import calmRune from './calm-rune.js'
import enGarde from './en-garde.js'
import meditation from './meditation.js'
import playfulPhantom from './playful-phantom.js'
import stalwartPoro from './stalwart-poro.js'
import wielderOfWater from './wielder-of-water.js'
import eagerApprentice from './eager-apprentice.js'
import fallingComet from './falling-comet.js'
import lecturingYordle from './lecturing-yordle.js'
import megaMech from './mega-mech.js'
import mindRune from './mind-rune.js'
import stupefy from './stupefy.js'
import ravenbloomStudent from './ravenbloom-student.js'
import singularity from './singularity.js'
import bodyRune from './body-rune.js'
import cannonBarrage from './cannon-barrage.js'
import confront from './confront.js'
import crackshotCorsair from './crackshot-corsair.js'
import duneDrake from './dune-drake.js'
import firstMate from './first-mate.js'
import mobilize from './mobilize.js'
import stormclawUrsine from './stormclaw-ursine.js'
import mountainDrake from './mountain-drake.js'
import chaosRune from './chaos-rune.js'
import gust from './gust.js'
import morbidReturn from './morbid-return.js'
import mysticPoro from './mystic-poro.js'
import saiScout from './sai-scout.js'
import sneakyDeckhand from './sneaky-deckhand.js'
import travelingMerchant from './traveling-merchant.js'
import maddenedMarauder from './maddened-marauder.js'
import backToBack from './back-to-back.js'
import daringPoro from './daring-poro.js'
import faithfulManufactor from './faithful-manufactor.js'
import orderRune from './order-rune.js'
import pettyOfficer from './petty-officer.js'
import vanguardSergeant from './vanguard-sergeant.js'
import noxianDrummer from './noxian-drummer.js'
import fortifiedPosition from './fortified-position.js'
import startippedPeak from './startipped-peak.js'
import trifarianWarCamp from './trifarian-war-camp.js'
import voidGate from './void-gate.js'

/** In collector-number order. */
export const OGN_CARDS: readonly CardDefinition[] = [
  disintegrate,
  furyRune,
  poutyPoro,
  calmRune,
  enGarde,
  meditation,
  playfulPhantom,
  stalwartPoro,
  wielderOfWater,
  eagerApprentice,
  fallingComet,
  lecturingYordle,
  megaMech,
  mindRune,
  stupefy,
  ravenbloomStudent,
  singularity,
  bodyRune,
  cannonBarrage,
  confront,
  crackshotCorsair,
  duneDrake,
  firstMate,
  mobilize,
  stormclawUrsine,
  mountainDrake,
  chaosRune,
  gust,
  morbidReturn,
  mysticPoro,
  saiScout,
  sneakyDeckhand,
  travelingMerchant,
  maddenedMarauder,
  backToBack,
  daringPoro,
  faithfulManufactor,
  orderRune,
  pettyOfficer,
  vanguardSergeant,
  noxianDrummer,
  fortifiedPosition,
  startippedPeak,
  trifarianWarCamp,
  voidGate,
]
