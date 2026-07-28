// Rasterizes public/icon.svg (original artwork — see that file's own header
// comment) into the PNG sizes the PWA manifest and iOS both need. Run via
// `npm run icons`; re-run any time icon.svg changes, since the PNGs are
// committed output, not generated at build time.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ACCENT_COLOR = '#2563eb'

// iOS reads `apple-touch-icon` at 180x180 (index.html), never the web
// manifest's own icons array.
const APPLE_TOUCH_ICON_SIZE = 180
const ICON_SIZE_STANDARD = 192
const ICON_SIZE_LARGE = 512

// Maskable icons get cropped to a circle/squircle by the OS that displays
// them, so the meaningful artwork has to live inside a "safe zone" in the
// middle. Keeping content to 80% of the canvas leaves a 10% margin on every
// side, which is the padding this task's brief calls for.
const MASKABLE_CONTENT_RATIO = 0.8

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(rootDir, 'public')
const svgPath = join(publicDir, 'icon.svg')

async function renderSquare(svgBuffer, size, fileName) {
  await sharp(svgBuffer).resize(size, size).png().toFile(join(publicDir, fileName))
}

async function renderMaskable(svgBuffer, size, fileName) {
  const contentSize = Math.round(size * MASKABLE_CONTENT_RATIO)
  const content = await sharp(svgBuffer).resize(contentSize, contentSize).png().toBuffer()

  await sharp({
    create: { width: size, height: size, channels: 4, background: ACCENT_COLOR },
  })
    .composite([{ input: content, gravity: 'center' }])
    .png()
    .toFile(join(publicDir, fileName))
}

async function main() {
  const svgBuffer = readFileSync(svgPath)

  await renderSquare(svgBuffer, APPLE_TOUCH_ICON_SIZE, 'apple-touch-icon.png')
  await renderSquare(svgBuffer, ICON_SIZE_STANDARD, 'icon-192.png')
  await renderSquare(svgBuffer, ICON_SIZE_LARGE, 'icon-512.png')
  await renderMaskable(svgBuffer, ICON_SIZE_LARGE, 'icon-512-maskable.png')

  console.log('Generated apple-touch-icon.png, icon-192.png, icon-512.png, icon-512-maskable.png in public/')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
