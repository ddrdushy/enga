// Downloads the avatar pictures listed in avatars.json and saves app-sized copies.
// Runs on GitHub (.github/workflows/avatars.yml) whenever avatars.json changes.
//
//   avatars.json:  { "<name in lower case>": { "still": "<url>", "anim": "<url of a GIF>" } }
//   writes:        src/assets/avatars/<name>.webp        256px still, shown everywhere
//                  src/assets/avatars/<name>.anim.webp   256px animation, shown on the home circle
//                  design/avatars/<name>.webp            768px master copy of the still
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

/** How long an animation rests on its last frame before playing again. */
const REST_MS = 3500
const ALLOWED = /^https:\/\/[a-z0-9]+\.cloudfront\.net\//
const list = JSON.parse(await readFile(process.argv[2] ?? 'avatars.json', 'utf8'))

async function bytes(url) {
  if (url.startsWith('file:')) return readFile(new URL(url))
  if (!ALLOWED.test(url)) throw new Error(`not an allowed address: ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

await mkdir('src/assets/avatars', { recursive: true })
await mkdir('design/avatars', { recursive: true })
let failed = 0
for (const [name, art] of Object.entries(list)) {
  if (!/^[a-z0-9-]+$/.test(name)) { console.error(`skipped "${name}": names are lower-case letters, digits and dashes`); failed++; continue }
  try {
    if (art.still) {
      const src = await bytes(art.still)
      await sharp(src).resize(256, 256, { fit: 'cover' }).webp({ quality: 86 }).toFile(`src/assets/avatars/${name}.webp`)
      await sharp(src).resize(768, 768, { fit: 'cover' }).webp({ quality: 92 }).toFile(`design/avatars/${name}.webp`)
      console.log(`${name}: still saved`)
    }
    if (art.anim) {
      const gif = await bytes(art.anim)
      // Rest on the last frame before looping, so the faces are still most of the time.
      const meta = await sharp(gif, { animated: true }).metadata()
      const delay = Array.from({ length: meta.pages ?? 1 }, (_, i) => meta.delay?.[i] ?? 150)
      delay[delay.length - 1] = REST_MS
      const out = await sharp(gif, { animated: true }).resize(256, 256, { fit: 'cover' }).webp({ quality: 80, effort: 5, loop: 0, delay }).toBuffer()
      await writeFile(`src/assets/avatars/${name}.anim.webp`, out)
      console.log(`${name}: animation saved (${Math.round(out.length / 1024)} KB)`)
    }
  } catch (err) {
    failed++
    console.error(`${name}: ${err.message}`)
  }
}
process.exit(failed ? 1 : 0)
