/**
 * Editing a preset file: pure functions, so the rules are testable without a
 * window and the renderer only wires them to buttons.
 */

import { decodeDeck, encodeDeck } from '@rb/engine'
import type { DeckList, DeckPreset, PresetFile } from '@rb/engine'

export const PRESET_NAME_MAX = 40

export function emptyDeck(): DeckList {
  return { legend: '', champion: '', main: [], runes: [], battlefields: [] }
}

export function cleanName(name: string, fallback = 'Untitled deck'): string {
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, PRESET_NAME_MAX)
  return trimmed || fallback
}

/** Insert or replace by id, newest first. */
export function upsertPreset(file: PresetFile, preset: DeckPreset): PresetFile {
  return {
    ...file,
    presets: [preset, ...file.presets.filter((p) => p.id !== preset.id)],
  }
}

export function removePreset(file: PresetFile, id: string): PresetFile {
  return { ...file, presets: file.presets.filter((p) => p.id !== id) }
}

export type ImportResult =
  | { readonly ok: true; readonly preset: DeckPreset }
  | { readonly ok: false; readonly message: string }

/** Make a preset from a pasted deck code. Legality is checked separately. */
export function importDeckCode(code: string, name: string, id: string, now: number): ImportResult {
  const decoded = decodeDeck(code)
  if (!decoded.ok) {
    return {
      ok: false,
      message:
        decoded.error === 'wrong-version'
          ? 'That deck code is from a different version of the game.'
          : 'That is not a deck code.',
    }
  }
  return {
    ok: true,
    preset: { id, name: cleanName(name, 'Imported deck'), deck: decoded.deck, updatedAt: now },
  }
}

export function exportDeckCode(preset: DeckPreset): string {
  return encodeDeck(preset.deck)
}

/** Add one copy of a card to a deck section. */
export function addCard(
  deck: DeckList,
  section: 'main' | 'runes' | 'battlefields',
  id: string,
): DeckList {
  return { ...deck, [section]: [...deck[section], id] }
}

/** Remove one copy of a card from a deck section. */
export function removeCard(
  deck: DeckList,
  section: 'main' | 'runes' | 'battlefields',
  id: string,
): DeckList {
  const index = deck[section].lastIndexOf(id)
  if (index === -1) return deck
  const next = [...deck[section]]
  next.splice(index, 1)
  return { ...deck, [section]: next }
}

export function countOf(cards: readonly string[], id: string): number {
  return cards.reduce((total, card) => total + (card === id ? 1 : 0), 0)
}
