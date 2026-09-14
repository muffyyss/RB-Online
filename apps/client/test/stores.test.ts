import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { DeckPreset, PresetFile } from '@rb/engine'

import { MAX_PRESETS, PresetStore } from '../src/main/presets.js'
import { FileSecretStore } from '../src/main/secrets.js'
import type { Cipher } from '../src/main/secrets.js'
import { SettingsStore, normaliseServerUrl } from '../src/main/settings.js'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rb-client-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const preset = (id: string, name = id): DeckPreset => ({
  id,
  name,
  updatedAt: 1,
  deck: { legend: 'L', champion: 'C', main: ['A', 'A'], runes: ['R'], battlefields: ['B'] },
})

const fileOf = (...presets: DeckPreset[]): PresetFile => ({ version: 1, presets })

describe('PresetStore', () => {
  it('starts empty when there is no file', async () => {
    expect(await new PresetStore(join(dir, 'presets.json')).load()).toEqual(fileOf())
  })

  it('round-trips presets', async () => {
    const store = new PresetStore(join(dir, 'presets.json'))
    await store.save(fileOf(preset('a', 'Lux ramp'), preset('b')))
    expect(await store.load()).toEqual(fileOf(preset('a', 'Lux ramp'), preset('b')))
  })

  it('keeps the previous version as a backup on every save', async () => {
    const store = new PresetStore(join(dir, 'presets.json'))
    await store.save(fileOf(preset('old')))
    await store.save(fileOf(preset('new')))
    const backup = JSON.parse(
      await readFile(join(dir, 'presets.backup.json'), 'utf8'),
    ) as PresetFile
    expect(backup.presets.map((p) => p.id)).toEqual(['old'])
  })

  it('drops malformed presets the renderer sends, keeping the good ones', async () => {
    const store = new PresetStore(join(dir, 'presets.json'))
    const saved = await store.save({ version: 1, presets: [preset('good'), { id: 42 }, null] })
    expect(saved.presets.map((p) => p.id)).toEqual(['good'])
  })

  it('refuses an absurd number of presets', async () => {
    const store = new PresetStore(join(dir, 'presets.json'))
    const many = Array.from({ length: MAX_PRESETS + 1 }, (_, i) => preset(String(i)))
    await expect(store.save(fileOf(...many))).rejects.toThrow(/too many/)
  })

  it('moves a corrupt file aside instead of letting the next save destroy it', async () => {
    const path = join(dir, 'presets.json')
    await writeFile(path, '{ this is not json', 'utf8')
    const store = new PresetStore(path, () => 1234)

    expect(await store.load()).toEqual(fileOf())
    const files = await readdir(dir)
    expect(files).toContain('presets.corrupt-1234.json')
    expect(await readFile(join(dir, 'presets.corrupt-1234.json'), 'utf8')).toBe(
      '{ this is not json',
    )
  })

  it('sets aside a file from a newer client version', async () => {
    const path = join(dir, 'presets.json')
    await writeFile(path, JSON.stringify({ version: 2, presets: [] }), 'utf8')
    await new PresetStore(path, () => 99).load()
    expect(await readdir(dir)).toContain('presets.version-2-99.json')
  })

  it('leaves no temporary file behind', async () => {
    const store = new PresetStore(join(dir, 'presets.json'))
    await store.save(fileOf(preset('a')))
    expect((await readdir(dir)).some((f) => f.endsWith('.tmp'))).toBe(false)
  })
})

/** Reversible stand-in for DPAPI that is visibly not plaintext. */
const fakeCipher = (available = true): Cipher => ({
  isAvailable: () => available,
  encrypt: (plain) => Buffer.from([...Buffer.from(plain)].map((b) => b ^ 0x5a)),
  decrypt: (cipher) => Buffer.from([...cipher].map((b) => b ^ 0x5a)).toString(),
})

describe('FileSecretStore', () => {
  it('persists values across instances without writing them in plaintext', async () => {
    const path = join(dir, 'secrets.json')
    await new FileSecretStore(path, fakeCipher()).set('refresh-token', 'super-secret-token')
    expect(await readFile(path, 'utf8')).not.toContain('super-secret-token')
    expect(await new FileSecretStore(path, fakeCipher()).get('refresh-token')).toBe(
      'super-secret-token',
    )
  })

  it('deletes', async () => {
    const path = join(dir, 'secrets.json')
    const store = new FileSecretStore(path, fakeCipher())
    await store.set('a', '1')
    await store.set('b', '2')
    await store.delete('a')
    const reopened = new FileSecretStore(path, fakeCipher())
    expect(await reopened.get('a')).toBeNull()
    expect(await reopened.get('b')).toBe('2')
  })

  it('never writes to disk when encryption is unavailable', async () => {
    const path = join(dir, 'secrets.json')
    const store = new FileSecretStore(path, fakeCipher(false))
    await store.set('refresh-token', 'super-secret-token')
    expect(await store.get('refresh-token')).toBe('super-secret-token')
    expect(await readdir(dir)).not.toContain('secrets.json')
  })

  it('treats an undecryptable value as absent', async () => {
    const path = join(dir, 'secrets.json')
    await writeFile(path, JSON.stringify({ 'refresh-token': 'AAAA' }), 'utf8')
    const broken: Cipher = {
      ...fakeCipher(),
      decrypt: () => {
        throw new Error('wrong user')
      },
    }
    expect(await new FileSecretStore(path, broken).get('refresh-token')).toBeNull()
  })
})

describe('server address', () => {
  it('accepts https anywhere, and assumes https when no scheme is typed', () => {
    expect(normaliseServerUrl('https://rb.example.com/')).toBe('https://rb.example.com')
    expect(normaliseServerUrl('  rb.example.com ')).toBe('https://rb.example.com')
  })

  it('accepts plain http only for this machine and the local network', () => {
    expect(normaliseServerUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
    expect(normaliseServerUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(normaliseServerUrl('http://192.168.1.20:3000')).toBe('http://192.168.1.20:3000')
    expect(normaliseServerUrl('http://10.0.0.5')).toBe('http://10.0.0.5')
    expect(normaliseServerUrl('http://rb.example.com')).toBeNull()
    expect(normaliseServerUrl('http://8.8.8.8')).toBeNull()
  })

  it('rejects junk, other schemes and embedded credentials', () => {
    for (const input of ['', 'ftp://x.example', 'javascript:alert(1)', 'https://me:pw@x.example']) {
      expect(normaliseServerUrl(input)).toBeNull()
    }
  })

  it('persists a chosen address, and ignores an invalid one', async () => {
    const path = join(dir, 'settings.json')
    const store = new SettingsStore(path)
    expect(await store.setServerUrl('rb.example.com')).toBe(true)
    expect(await store.setServerUrl('http://rb.example.com')).toBe(false)
    expect(await new SettingsStore(path).get()).toEqual({ serverUrl: 'https://rb.example.com' })
  })
})
