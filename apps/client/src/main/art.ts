/**
 * Card faces, fetched once and then read from disk.
 *
 * The renderer still never talks to the network: it asks for `rb-art://card/<id>`
 * and this answers, downloading the image the first time and keeping it in the
 * user's data folder afterwards. Which URL belongs to which card comes from a
 * manifest built locally (tools/card-art); with no manifest nothing is served
 * and the renderer draws its own card frames instead.
 */

import { app, protocol } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'

export const ART_SCHEME = 'rb-art'

const TYPES: Readonly<Record<string, string>> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
}

/** `OGS-014` and nothing else: no path of our own to walk out of. */
const CARD_ID = /^[A-Z]{3}-\d{3}$/

export class CardArt {
  private manifest: Readonly<Record<string, string>> | null = null
  private readonly pending = new Map<string, Promise<Buffer | null>>()

  /**
   * @param manifestPaths where to look for the manifest, in order.
   * @param cacheDir where downloaded faces are kept.
   */
  constructor(
    private readonly manifestPaths: readonly string[],
    private readonly cacheDir: string,
  ) {}

  /** Serve the scheme. Call once, after the app is ready. */
  register(): void {
    protocol.handle(ART_SCHEME, async (request) => {
      const id = new URL(request.url).pathname.replace(/^\/+/, '').toUpperCase()
      if (!CARD_ID.test(id)) return new Response(null, { status: 400 })
      const image = await this.face(id)
      if (!image) return new Response(null, { status: 404 })
      return new Response(new Uint8Array(image.bytes), {
        status: 200,
        headers: { 'content-type': image.type, 'cache-control': 'max-age=31536000, immutable' },
      })
    })
  }

  private async face(id: string): Promise<{ bytes: Buffer; type: string } | null> {
    const url = (await this.load())[id]
    if (!url) return null
    const extension = extname(new URL(url).pathname).toLowerCase()
    const type = TYPES[extension] ?? 'image/webp'
    const file = join(this.cacheDir, `${id}${extension}`)

    // One download per card, however many places on the board show it.
    let work = this.pending.get(id)
    if (!work) {
      work = this.fetchOnce(url, file)
      this.pending.set(id, work)
    }
    const bytes = await work
    return bytes ? { bytes, type } : null
  }

  private async fetchOnce(url: string, file: string): Promise<Buffer | null> {
    try {
      return await readFile(file)
    } catch {
      // Not cached yet.
    }
    try {
      const response = await fetch(url)
      if (!response.ok) return null
      const bytes = Buffer.from(await response.arrayBuffer())
      await mkdir(this.cacheDir, { recursive: true })
      await writeFile(file, bytes)
      return bytes
    } catch {
      // Offline, or the source moved: the renderer falls back to a card frame.
      return null
    }
  }

  private async load(): Promise<Readonly<Record<string, string>>> {
    if (this.manifest) return this.manifest
    for (const path of this.manifestPaths) {
      try {
        const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
        if (parsed && typeof parsed === 'object') {
          this.manifest = parsed as Record<string, string>
          return this.manifest
        }
      } catch {
        // Try the next place.
      }
    }
    this.manifest = {}
    return this.manifest
  }
}

/**
 * Where a manifest may be: alongside the built renderer, in the repository's
 * renderer public folder while developing, or dropped into the data folder by
 * hand.
 */
export function manifestPaths(rendererDir: string): readonly string[] {
  return [
    join(rendererDir, 'card-art.json'),
    join(app.getAppPath(), 'src/renderer/public/card-art.json'),
    join(app.getPath('userData'), 'card-art.json'),
  ]
}
