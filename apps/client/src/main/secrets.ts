/**
 * Somewhere safe to keep the refresh token and the guest secret.
 *
 * Values are encrypted with Electron's `safeStorage`, which on Windows is DPAPI:
 * the ciphertext on disk can only be decrypted by the same Windows user on the
 * same machine. Copying the file elsewhere yields nothing usable.
 *
 * If encryption is unavailable the store refuses to write, and secrets live in
 * memory for the session only. Silently writing plaintext would be worse than
 * asking the player to log in again next time.
 */

import { readFile, rename, writeFile } from 'node:fs/promises'

export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface Cipher {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(cipher: Buffer): string
}

export const SECRET_KEYS = {
  refreshToken: 'refresh-token',
  guestSecret: 'guest-secret',
} as const

/** Encrypted values in one JSON file, base64 per key. */
export class FileSecretStore implements SecretStore {
  private cache: Record<string, string> | null = null
  /** Used when encryption is unavailable, so the session still works. */
  private readonly memory = new Map<string, string>()

  constructor(
    private readonly path: string,
    private readonly cipher: Cipher,
  ) {}

  async get(key: string): Promise<string | null> {
    if (!this.cipher.isAvailable()) return this.memory.get(key) ?? null
    const encoded = (await this.load())[key]
    if (encoded === undefined) return null
    try {
      return this.cipher.decrypt(Buffer.from(encoded, 'base64'))
    } catch {
      // Unreadable — a different Windows user, or a damaged file. Treat it as
      // absent; the player logs in again.
      return null
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.cipher.isAvailable()) {
      this.memory.set(key, value)
      return
    }
    const entries = { ...(await this.load()), [key]: this.cipher.encrypt(value).toString('base64') }
    await this.write(entries)
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key)
    const entries = { ...(await this.load()) }
    if (!(key in entries)) return
    delete entries[key]
    await this.write(entries)
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      this.cache =
        typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? Object.fromEntries(
              Object.entries(parsed).filter((entry): entry is [string, string] => {
                return typeof entry[1] === 'string'
              }),
            )
          : {}
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  private async write(entries: Record<string, string>): Promise<void> {
    // Write beside, then rename: a crash mid-write must not leave half a file.
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(entries), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.path)
    this.cache = entries
  }
}

/** For tests, and for anywhere a store is needed without a disk. */
export class MemorySecretStore implements SecretStore {
  readonly values = new Map<string, string>()
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.values.get(key) ?? null)
  }
  set(key: string, value: string): Promise<void> {
    this.values.set(key, value)
    return Promise.resolve()
  }
  delete(key: string): Promise<void> {
    this.values.delete(key)
    return Promise.resolve()
  }
}
