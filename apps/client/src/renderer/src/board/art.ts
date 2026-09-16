/**
 * Where a card's face comes from.
 *
 * In the app it is `rb-art://card/<id>`, which the main process answers from its
 * own cache — the renderer never fetches anything itself. The board preview
 * harness has no main process, so it points this at the sources directly.
 */

export type ArtResolver = (cardId: string) => string

let resolver: ArtResolver = (cardId) => `rb-art://card/${cardId}`

export function artUrl(cardId: string): string {
  return resolver(cardId)
}

/** Used by the preview harness only. */
export function setArtResolver(next: ArtResolver): void {
  resolver = next
}
