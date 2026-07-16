/**
 * Regenerates the Game's Up brand icon set in apps/web/public:
 *
 *   icon-wordmark-gold-bubble(.svg|-1024/-512/-192.png)      app + PWA + Discord server icon
 *   icon-wordmark-gold-bubble-maskable(.svg|-512/-192.png)   PWA maskable variant (art at 80% safe area)
 *   icon-up-bang(.svg|-64.png)                               small-size favicon cut ("UP!" only)
 *   icon-gold-ping-bot(.svg|-1024/-512.png)                  Discord bot avatar
 *
 * The wordmark is set in Archivo Black (vendored under scripts/dev/assets, OFL licensed)
 * and converted to path outlines, so the emitted SVGs have no font dependency and any
 * SVG rasterizer produces identical output. PNGs are rendered with @resvg/resvg-js.
 *
 * Icon geometry is authored here; the emitted SVGs are the browser-consumed artifacts.
 * After regenerating, bump the icon version query string in apps/web/vite.config.ts and
 * apps/web/index.html so installed clients refetch.
 *
 * Usage: npm run web:icons:export
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'
import { Resvg } from '@resvg/resvg-js'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const publicDir = path.join(repoRoot, 'apps', 'web', 'public')
const fontPath = path.join(scriptDir, 'assets', 'ArchivoBlack-Regular.ttf')

const INK = '#17181D'
const GOLD = '#F7B733'
const WHITE = '#FFFFFF'

const fontBuf = fs.readFileSync(fontPath)
const font = opentype.parse(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength))
const unitsPerEm = font.unitsPerEm
const capHeightEm = (font.tables.os2?.sCapHeight ?? 0.71 * unitsPerEm) / unitsPerEm

const advance = (text, size) => font.getAdvanceWidth(text, size)
const fitSize = (text, targetWidth) => targetWidth / (advance(text, 100) / 100)

function outlinedText(text, startX, baselineY, size, fill) {
  const glyphPath = font.getPath(text, startX, baselineY, size)
  return `<path d="${glyphPath.toPathData(2)}" fill="${fill}"/>`
}

function centeredText(text, centerX, baselineY, size, fill) {
  return outlinedText(text, centerX - advance(text, size) / 2, baselineY, size, fill)
}

/** "UP" in one color plus "!" in another, centered as a single run. */
function upBangRun(centerX, baselineY, size, upFill, bangFill) {
  const upWidth = advance('UP', size)
  const startX = centerX - (upWidth + advance('!', size)) / 2
  return outlinedText('UP', startX, baselineY, size, upFill)
    + outlinedText('!', startX + upWidth, baselineY, size, bangFill)
}

// App icon ("Gold Up"): gold outline bubble, white GAME'S, gold UP, white bang.
const bubble = { x: 60, y: 72, w: 392, h: 269, rx: 60, stroke: 21 }
const gamesSize = fitSize("GAME'S", 322)
const upSize = fitSize('UP!', 236)
const lineGap = 32
const innerTop = bubble.y + bubble.stroke / 2 + 16
const innerBottom = bubble.y + bubble.h - bubble.stroke / 2 - 16
const blockHeight = gamesSize * capHeightEm + lineGap + upSize * capHeightEm
const blockTop = innerTop + (innerBottom - innerTop - blockHeight) / 2
const gamesBaseline = blockTop + gamesSize * capHeightEm
const upBaseline = blockTop + blockHeight

const appArt = `
  <path d="M179 320 L179 431 L282 320 Z" fill="${GOLD}"/>
  <rect x="${bubble.x}" y="${bubble.y}" width="${bubble.w}" height="${bubble.h}" rx="${bubble.rx}" fill="${INK}" stroke="${GOLD}" stroke-width="${bubble.stroke}"/>
  ${centeredText("GAME'S", 256, gamesBaseline, gamesSize, WHITE)}
  ${upBangRun(256, upBaseline, upSize, GOLD, WHITE)}`

const appSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>${appArt}
</svg>`

// Maskable variant: same art scaled to 80% so mask shapes never clip the bubble.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>
  <g transform="translate(51.2 51.2) scale(0.8)">${appArt}</g>
</svg>`

// Favicon cut: "UP!" alone; the full wordmark is unreadable at tab sizes.
const faviconSize = fitSize('UP!', 430)
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>
  ${upBangRun(256, 256 + (faviconSize * capHeightEm) / 2, faviconSize, GOLD, WHITE)}
</svg>`

// Bot avatar ("Gold Ping"): solid gold bubble, ink bang, no wordmark.
const botSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${INK}"/>
  <rect x="77" y="68" width="358" height="299" rx="77" fill="${GOLD}"/>
  <path d="M192 367 L192 456 L294 367 Z" fill="${GOLD}"/>
  <rect x="222" y="128" width="68" height="132" rx="34" fill="${INK}"/>
  <circle cx="256" cy="316" r="34" fill="${INK}"/>
</svg>`

const renderPng = (svg, px) => new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng()

const outputs = [
  ['icon-wordmark-gold-bubble.svg', appSvg, [1024, 512, 192]],
  ['icon-wordmark-gold-bubble-maskable.svg', maskableSvg, [512, 192]],
  ['icon-up-bang.svg', faviconSvg, [64]],
  ['icon-gold-ping-bot.svg', botSvg, [1024, 512]]
]

for (const [svgName, svg, pngSizes] of outputs) {
  fs.writeFileSync(path.join(publicDir, svgName), svg)
  process.stdout.write(`Wrote ${svgName}\n`)
  for (const px of pngSizes) {
    const pngName = svgName.replace('.svg', `-${px}.png`)
    fs.writeFileSync(path.join(publicDir, pngName), renderPng(svg, px))
    process.stdout.write(`  Wrote ${pngName}\n`)
  }
}
