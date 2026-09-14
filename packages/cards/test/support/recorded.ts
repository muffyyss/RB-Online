import { expect } from 'vitest'

import type { CardDefinition } from '../../src/schema.js'

/**
 * Assert an ability is recorded but honestly marked as not yet runnable.
 *
 * When the engine grows the missing piece, the card's test is where this call
 * is replaced by one that runs the ability — so it fails loudly the moment
 * someone removes `notImplemented` without writing that test.
 */
export function expectRecordedButNotRunnable(
  card: CardDefinition,
  abilityId: string,
  shape: Record<string, unknown>,
): void {
  const ability = card.abilities?.find((a) => a.id === abilityId)
  expect(ability, `${card.id} should have ability ${abilityId}`).toMatchObject(shape)
  expect(ability?.notImplemented, `${abilityId} must say why it cannot run yet`).toMatch(/\S/)
}
