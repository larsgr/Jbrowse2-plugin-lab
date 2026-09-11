// Visual check that StrandedBigWigPlugin renders a real forward/reverse BigWig
// pair with the reverse strand below the axis.
//
//   node .claude/skills/run-app/scripts/verify-stranded.mjs
//
// Expects a dev server already running on :5173. Exits non-zero unless every
// forward-strand (blue) pixel sits above every reverse-strand (red) pixel,
// which is the assertion that actually discriminates - it is axis-relative, so
// it survives autoscale changes, unlike splitting the canvas at its midline.
import { chromium } from 'playwright'
import fs from 'node:fs'

const SHOTS = process.env.SHOTS || `${process.env.TMPDIR || '/tmp'}/stranded-shots`
const TRACK = 'Ssal_v3.1-bodymap-Liver-stranded'
fs.mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })

// The container's egress proxy serves node but closes Chromium's tunnels, so
// forward salmobase requests through the node side. Range requests included.
let n = 0
await page.route('https://salmobase.org/**', async route => {
  const req = route.request(); const headers = { ...req.headers() }; delete headers.host
  const short = req.url().replace(/.*\//, '').slice(0, 45)
  const rng = headers.range || '-'
  const t0 = Date.now()
  console.log(`  -> START ${short} ${rng}`)
  try {
    const res = await fetch(req.url(), { headers, method: req.method() })
    const body = Buffer.from(await res.arrayBuffer()); const h = {}
    for (const [k, v] of res.headers) if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) h[k] = v
    h['access-control-allow-origin'] = '*'
    h['access-control-expose-headers'] = 'Content-Length,Content-Range'
    n++
    console.log(`  <- DONE  ${short} ${rng} ${res.status} ${body.length}b ${Date.now() - t0}ms`)
    await route.fulfill({ status: res.status, headers: h, body })
  } catch (e) { console.log('PROXY-ERR', req.url(), String(e)); await route.abort() }
})

const errors = []
page.on('pageerror', e => errors.push(String(e)))

await page.goto(process.env.URL || 'http://localhost:5173/Jbrowse2-plugin-lab/', { waitUntil: 'domcontentloaded' })

// Wait for the LGV to finish loading the assembly.
await page.locator('text=Show all regions in assembly').first()
  .waitFor({ state: 'visible', timeout: 120000 }).catch(() => {})
await page.waitForTimeout(2000)
await page.screenshot({ path: `${SHOTS}/01-loaded.png` })

// Open the track selector and tick the stranded track. Clicking the visible
// text label does not toggle it - the checkbox inside the label row does.
await page.locator('button[data-testid="track_select"], button:has-text("Open track selector")').first()
  .click({ timeout: 30000 }).catch(async () => {
    await page.locator('[data-testid="view_menu_icon"]').first().click()
    await page.locator('[role="menu"]').getByText('Open track selector', { exact: true }).click()
  })
await page.waitForTimeout(1500)
await page.screenshot({ path: `${SHOTS}/02-track-selector.png` })

await page.locator(`label:has([data-testid="htsTrackLabel-Tracks,${TRACK}"]) input[type="checkbox"]`)
  .first().click({ timeout: 30000 })
console.log('enabled', TRACK)
await page.keyboard.press('Escape')
await page.waitForTimeout(2000)

// A newly enabled track stays in "Loading" until the view changes - it never
// requests data on its own. Reproduces with a stock BigWigAdapter track too,
// so it is the app shell, not the adapter. Nudge the view to kick rendering.
const loc = page.locator('input[value*="ssa01"], input[value*="56,1"]').first()
await loc.click()
await loc.fill('ssa01:56,174,000..56,190,000')
await loc.press('Enter')
await page.waitForTimeout(8000)
await page.screenshot({ path: `${SHOTS}/03-track-on.png` })

// Poll the canvases for both strand colors.
const deadline = Date.now() + 150000
let result = null
while (Date.now() < deadline) {
  result = await page.evaluate(() => {
    const POS = [26, 122, 191], NEG = [209, 73, 91]
    const near = (r, g, b, t) => Math.abs(r - t[0]) < 60 && Math.abs(g - t[1]) < 60 && Math.abs(b - t[2]) < 60
    for (const c of document.querySelectorAll('canvas')) {
      if (c.width < 200 || c.height < 40) continue
      let d
      try { d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data } catch { continue }
      let posMin = 1e9, posMax = -1, negMin = 1e9, negMax = -1, posN = 0, negN = 0
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4
        if (d[i + 3] < 40) continue
        const r = d[i], g = d[i + 1], b = d[i + 2]
        if (near(r, g, b, POS)) { posN++; if (y < posMin) posMin = y; if (y > posMax) posMax = y }
        else if (near(r, g, b, NEG)) { negN++; if (y < negMin) negMin = y; if (y > negMax) negMax = y }
      }
      if (posN > 50 && negN > 50) return { w: c.width, h: c.height, posN, negN, posMin, posMax, negMin, negMax }
    }
    return null
  })
  if (result) break
  await page.waitForTimeout(4000)
}
await page.screenshot({ path: `${SHOTS}/04-final.png` })
const diag = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid^="trackRenderingContainer"], [class*="trackRenderingContainer"]')]
  const canvases = [...document.querySelectorAll('canvas')].map(c => `${c.width}x${c.height}`)
  const texts = rows.map(r => r.innerText.replace(/\s+/g, ' ').slice(0, 200))
  const body = document.body.innerText
  const msg = ['Zoom in to see', 'force load', 'Failed', 'Error', 'No stats'].filter(m => body.includes(m))
  return { canvases, texts, msg }
})
console.log('canvases:', JSON.stringify(diag.canvases))
console.log('track text:', JSON.stringify(diag.texts))
console.log('messages:', JSON.stringify(diag.msg))
console.log('salmobase requests proxied:', n)
console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none')
if (!result) { console.log('FAIL: no canvas with both strand colors'); await browser.close(); process.exit(1) }
console.log(`canvas ${result.w}x${result.h}`)
console.log(`  forward (blue): ${result.posN} px, y ${result.posMin}..${result.posMax}`)
console.log(`  reverse (red) : ${result.negN} px, y ${result.negMin}..${result.negMax}`)
const ok = result.posMax <= result.negMin
console.log(ok ? `  PASS: all blue above all red (blue ends ${result.posMax}, red starts ${result.negMin})`
               : `  FAIL: strands overlap vertically`)
await browser.close(); process.exit(ok ? 0 : 1)
