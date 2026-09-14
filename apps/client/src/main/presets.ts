/**
 * Deck presets on disk.
 *
 * Presets are local by design: no server copy, no sync. That makes this file
 * the player's *only* copy of their decks, so it is handled with more care than
 * its size suggests:
 *
 *  - Writes go to a temporary file and are renamed into place, so a crash or a
 *    full disk mid-write leaves the old file intact.
 *  - The previous version is kept as `presets.backup.json` on every save.
 *  - A file that cannot be read — corrupt JSON, or a format from a newer client
 *    — is moved aside rather than overwritten by the next save.
 */

import { PRESET_FILE_VERSION, emptyPresetFile, parsePresetFile } from '@rb/engine'
import type { PresetFile } from '@rb/engine'
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Far beyond any real collection; stops a runaway renderer filling the disk. */
export const MAX_PRESETS = 500

export class PresetStore {
  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now,
  ) {}

  async load(): Promise<PresetFile> {
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyPresetFile()
      throw error
    }

    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      await this.setAside('corrupt')
      return emptyPresetFile()
    }

    const version = (raw as { version?: unknown } | null)?.version
    if (version !== PRESET_FILE_VERSION) {
      // Probably written by a newer client. Keep it for that client to read.
      await this.setAside(`version-${String(version)}`)
      return emptyPresetFile()
    }
    return parsePresetFile(raw)
  }

  async save(file: unknown): Promise<PresetFile> {
    // The renderer is not trusted to send a well-formed file.
    const clean = parsePresetFile(file)
    if (clean.presets.length > MAX_PRESETS) {
      throw new Error(`too many presets (limit ${String(MAX_PRESETS)})`)
    }

    try {
      await copyFile(this.path, join(dirname(this.path), 'presets.backup.json'))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(clean, null, 2), 'utf8')
    await rename(temporary, this.path)
    return clean
  }

  private async setAside(reason: string): Promise<void> {
    const aside = join(dirname(this.path), `presets.${reason}-${String(this.now())}.json`)
    await rename(this.path, aside)
  }
}
