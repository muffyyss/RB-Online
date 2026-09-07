export { SeededRng } from './rng.js'
export type { RngState } from './rng.js'

export {
  DOMAINS,
  DOMAIN_COLOUR,
  DOMAIN_SHORTHAND,
  isDomain,
  isWithinIdentity,
} from './model/domain.js'
export type { Domain, DomainIdentity } from './model/domain.js'

export { CARD_TYPES, SUPERTYPES, categoryOf, fullName, isPermanentType } from './model/card.js'
export type { CardCategory, CardType, Supertype, Tag } from './model/card.js'

export {
  EMPTY_POOL,
  canPay,
  costValue,
  emptyPool,
  formatCost,
  resolveRequirements,
} from './model/cost.js'
export type { Cost, PowerSymbol, RunePool } from './model/cost.js'

export {
  IMPLEMENTED_KEYWORDS,
  KEYWORDS,
  TIMING_KEYWORDS,
  VALUED_KEYWORDS,
  isImplemented,
  isKeyword,
  takesValue,
} from './model/keyword.js'
export type { Keyword, TimingKeyword } from './model/keyword.js'

export {
  CONTROL_OPS,
  GAME_ACTIONS,
  IMPLEMENTED_OPS,
  amountSchema,
  bindingSchema,
  effectStepSchema,
  isImplementedOp,
  selectorSchema,
  targetSchema,
} from './effects/steps.js'
export type {
  Amount,
  ControlOp,
  EffectStep,
  GameActionName,
  Selector,
  Target,
} from './effects/steps.js'

export {
  PLAYERS,
  battlefield,
  getObject,
  isClosedState,
  isShowdownState,
  objectsAt,
  opponentOf,
  playerState,
  powerOf,
  requireObject,
  turnStateOf,
} from './state/game-state.js'
export type {
  BattlefieldState,
  CardId,
  ChainItem,
  CombatRole,
  GameObject,
  GameState,
  Location,
  ObjectId,
  PendingChoice,
  Phase,
  PlayerId,
  PlayerState,
  Step,
  TurnState,
  ZoneName,
} from './state/game-state.js'

export { canSee, hiddenIdsFor, redactFor } from './state/redact.js'
export type { GameView, PendingChoiceView, PlayerView, ZoneView } from './state/redact.js'

export { oracleFrom } from './effects/oracle.js'
export type { CardFacts, CardOracle } from './effects/oracle.js'
export { resolveSelector, selectorCount } from './effects/selector.js'
export type { SelectorContext } from './effects/selector.js'
export { beginExecution, resolveChoice, runExecution } from './effects/interpreter.js'
export type { Execution, ExecutionResult, Frame } from './effects/interpreter.js'
export type { GameEvent } from './effects/events.js'

export {
  RUNES_PER_TURN,
  TURN_STEPS,
  VICTORY_SCORE,
  advanceFlow,
  channel,
  checkWin,
  endMainPhase,
  score,
} from './flow/phases.js'
export type { AdvanceResult } from './flow/phases.js'

export { applyAction, legalActions } from './actions/index.js'
export type { ActionResult, GameAction, RuleViolation } from './actions/index.js'

export { addToChain, advanceChain, passOnChain, resumeResolution } from './flow/chain.js'
export type { ChainResult } from './flow/chain.js'
export type { EngineAbility } from './effects/oracle.js'

export { canPlayNow, timingRefusal } from './flow/timing.js'
export type { TimingRefusal } from './flow/timing.js'
export { pay, usableFor } from './model/cost.js'
export type {
  PaymentTarget,
  PowerAssignment,
  Resources,
  RestrictedResources,
} from './model/cost.js'

export { moveRefusal, performMove } from './flow/movement.js'
export type { MoveRefusal } from './flow/movement.js'
export { runCleanup, stagedCombats } from './flow/cleanup.js'

export { assignDamage, lethalThreshold, sumMight } from './flow/damage.js'
export type { DamageTarget } from './flow/damage.js'
export { beginCombat, closeCombat, resolveCombatDamage, resolveCombatEnd } from './flow/combat.js'
export type { CombatResult } from './flow/combat.js'
export { settleBoard } from './flow/cleanup.js'

export {
  MULLIGAN_LIMIT,
  OPENING_HAND,
  beginPlay,
  createGame,
  inSetup,
  performMulligan,
} from './flow/setup.js'
export type { DeckList } from './flow/setup.js'

export {
  DUEL_BATTLEFIELDS,
  MAX_COPIES,
  MAX_SIGNATURE,
  MIN_MAIN_DECK,
  RUNE_DECK_SIZE,
  describeDeck,
  validateDeck,
} from './deck/validate.js'
export type { DeckError, DeckErrorCode, DeckValidation } from './deck/validate.js'

export {
  DECK_CODE_VERSION,
  PRESET_FILE_VERSION,
  canEnterRoom,
  decodeDeck,
  emptyPresetFile,
  encodeDeck,
  parsePresetFile,
} from './deck/preset.js'
export type { DeckCodeError, DeckCodeResult, DeckPreset, PresetFile } from './deck/preset.js'
