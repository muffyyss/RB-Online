/**
 * Recognising database errors.
 *
 * Drizzle wraps the driver's error in its own "Failed query: ..." error, with
 * the original — the one naming the violated constraint — as its `cause`.
 * Checking only the outer message therefore never matches, which quietly turns
 * a handled race into a 500. This walks the whole chain.
 */

/** True when `error`, or anything it wraps, is a violation of this unique index. */
export function violatesUnique(error: unknown, constraint: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== 'object') break
    const candidate = current as { message?: unknown; constraint_name?: unknown; cause?: unknown }
    if (candidate.constraint_name === constraint) return true
    if (typeof candidate.message === 'string' && candidate.message.includes(constraint)) return true
    current = candidate.cause
  }
  return false
}
