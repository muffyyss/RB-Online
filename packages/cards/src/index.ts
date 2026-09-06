/**
 * Card definitions live under `src/sets/<set>/`, one file per card.
 * The V1 set is Origins: Proving Grounds (OGS).
 */
export const SETS = ['ogs'] as const
export type SetCode = (typeof SETS)[number]
