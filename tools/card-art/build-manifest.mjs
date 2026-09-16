/**
 * Build the card-art manifest from the reference corpus.
 *
 * The corpus under docs/reference is not in the repository (it is Riot's data),
 * so neither is the manifest it produces: run this once locally and the client
 * shows real card faces; without it the client draws its own card frames.
 *
 *   node tools/card-art/build-manifest.mjs [--out <file>]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SOURCES = ['docs/reference/ogs-cards.json', 'docs/reference/ogn-cards.json']
const DEFAULT_OUT = 'apps/client/src/renderer/public/card-art.json'

/** `OGN-131` from a set code and collector number. */
function cardId(entry) {
  const set = String(entry.set_id ?? '').toUpperCase()
  const number = String(entry.collector_number ?? '').padStart(3, '0')
  return set && number ? `${set}-${number}` : null
}

async function entriesOf(file) {
  const parsed = JSON.parse(await readFile(resolve(ROOT, file), 'utf8'))
  const list = Array.isArray(parsed) ? parsed : (parsed.cards ?? Object.values(parsed))
  return Array.isArray(list) ? list : []
}

const out = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : DEFAULT_OUT

const art = {}
for (const source of SOURCES) {
  let entries
  try {
    entries = await entriesOf(source)
  } catch (error) {
    console.error(`cannot read ${source}: ${error.message}`)
    console.error('the reference corpus is not in the repository; skipping')
    continue
  }
  for (const entry of entries) {
    const id = cardId(entry)
    // Variants repeat a card under the same id; the first one wins.
    if (!id || art[id]) continue
    const url = entry.image_thumb?.large ?? entry.image_thumb?.medium ?? entry.image
    if (typeof url === 'string') art[id] = url
  }
}

const count = Object.keys(art).length
if (count === 0) {
  console.error('no card art found; nothing written')
  process.exit(1)
}

const target = resolve(ROOT, out)
await mkdir(dirname(target), { recursive: true })
await writeFile(target, `${JSON.stringify(art, null, 2)}\n`, 'utf8')
console.log(`${String(count)} card faces -> ${out}`)
