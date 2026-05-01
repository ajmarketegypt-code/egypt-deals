import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'icons')
fs.mkdirSync(outDir, { recursive: true })

function makeSVG(size) {
  const s = size
  const pad = s * 0.14        // padding from edge
  const cx = s / 2
  const cy = s / 2

  // Sparkline: 5 points, last one hits the green ATL dot
  // Map points in a 0..1 grid then scale into the icon canvas
  const pts = [
    [0.18, 0.42],
    [0.35, 0.26],
    [0.52, 0.50],
    [0.68, 0.32],
    [0.82, 0.68],   // ATL low — the green dot lands here
  ]
  const xMin = pad, xMax = s - pad
  const yMin = pad + s * 0.04, yMax = s - pad - s * 0.04
  const map = ([px, py]) => [
    xMin + px * (xMax - xMin),
    yMin + py * (yMax - yMin),
  ]

  const mapped = pts.map(map)
  const polyline = mapped.map(([x, y]) => `${x},${y}`).join(' ')

  const [dotX, dotY] = mapped[mapped.length - 1]
  const stroke = Math.round(s * 0.058)
  const dotR  = Math.round(s * 0.090)
  const dotRing = Math.round(s * 0.118)

  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${s}" height="${s}" fill="#0f172a"/>
  <!-- Glow halo behind the ATL dot -->
  <circle cx="${dotX}" cy="${dotY}" r="${dotRing}" fill="#22c55e" opacity="0.18"/>
  <!-- Trend line -->
  <polyline
    points="${polyline}"
    fill="none"
    stroke="white"
    stroke-width="${stroke}"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.92"
  />
  <!-- ATL dot — green, on top -->
  <circle cx="${dotX}" cy="${dotY}" r="${dotR}" fill="#22c55e"/>
</svg>`
}

async function render(svgContent, outPath, size) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0f172a">${svgContent}</body></html>`)
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: size, height: size } })
  await browser.close()
  console.log(`[icons] wrote ${outPath}`)
}

const sizes = [192, 512]
for (const size of sizes) {
  const svg = makeSVG(size)
  const outPath = path.join(outDir, `icon-${size}.png`)
  await render(svg, outPath, size)
}

// apple-touch-icon.png at public root (180×180) — iOS convention
const applePath = path.join(__dirname, '..', 'public', 'apple-touch-icon.png')
await render(makeSVG(180), applePath, 180)

console.log('[icons] done')
