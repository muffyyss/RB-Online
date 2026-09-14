/**
 * Client settings: for now, only which server to talk to.
 *
 * Kept in plain JSON — nothing here is secret. The address can be set from the
 * login screen, so the same build works for anyone's server.
 */

import { readFile, rename, writeFile } from 'node:fs/promises'

import type { Settings } from '../shared/bridge.js'

export const DEFAULT_SERVER_URL = 'http://127.0.0.1:3000'

/**
 * Normalise a typed server address, or null if it is not usable.
 *
 * Plain `http` is only accepted for this machine or a LAN address: over the
 * internet it would send passwords in the clear.
 */
export function normaliseServerUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  if (url.protocol === 'http:' && !isPrivateHost(url.hostname)) return null
  return url.origin
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false
  }
  const [a = 0, b = 0] = octets
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}

export class SettingsStore {
  private cache: Settings | null = null

  constructor(
    private readonly path: string,
    private readonly fallbackUrl: string = DEFAULT_SERVER_URL,
  ) {}

  async get(): Promise<Settings> {
    if (this.cache) return this.cache
    let serverUrl = this.fallbackUrl
    try {
      const raw = JSON.parse(await readFile(this.path, 'utf8')) as { serverUrl?: unknown }
      if (typeof raw.serverUrl === 'string') {
        serverUrl = normaliseServerUrl(raw.serverUrl) ?? serverUrl
      }
    } catch {
      // Missing or unreadable: defaults.
    }
    this.cache = { serverUrl }
    return this.cache
  }

  /** Cached value for synchronous callers; call `get()` once at startup first. */
  current(): Settings {
    return this.cache ?? { serverUrl: this.fallbackUrl }
  }

  async setServerUrl(input: string): Promise<boolean> {
    const serverUrl = normaliseServerUrl(input)
    if (!serverUrl) return false
    const next = { ...(await this.get()), serverUrl }
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(next, null, 2), 'utf8')
    await rename(temporary, this.path)
    this.cache = next
    return true
  }
}
