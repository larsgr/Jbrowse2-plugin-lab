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
// A throw inside a MobX reaction (e.g. a display's `ticks` getter) is caught
// by MobX and only logged, so it never reaches 'pageerror'.
page.on('console', m => {
  if (m.type() === 'error' && /RangeError|out of memory|Invalid array length/i.test(m.text())) {
    errors.push(m.text().slice(0, 200))
  }
})

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

async function goTo(region) {
  // Re-resolve by handle: fill() changes the value, so a value-based locator
  // stops matching between calls.
  const loc = await page
    .locator('input[value*="ssa01"], input[value*=":"]')
    .first()
    .elementHandle()
  await loc.click()
  await loc.fill(region)
  await loc.press('Enter')
  await page.waitForTimeout(12000)
}

function scanCanvases() {
  return page.evaluate(() => {
    const POS = [26, 122, 191], NEG = [209, 73, 91]
    const near = (r, g, b, t) =>
      Math.abs(r - t[0]) < 60 && Math.abs(g - t[1]) < 60 && Math.abs(b - t[2]) < 60
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
      if (posN > 20 && negN > 20) return { w: c.width, h: c.height, posN, negN, posMin, posMax, negMin, negMax }
    }
    return null
  })
}

// Both zoom levels matter, and they exercise different code paths.
//
// Zoomed in, BigWigAdapter returns raw values and the renderer only has
// `score` to go on. Zoomed out it returns summary bins carrying
// minScore/maxScore, which drawXY reads directly in its default "whiskers"
// mode. An adapter that negates `score` alone passes the first case and draws
// the reverse strand above the axis in the second, so checking one zoom proves
// nothing about the other.
//
// The third case has heavy signal on BOTH strands at the same positions, at a
// zoom where one file returns summary bins while the other can still return
// raw values. The stock XYPlotRenderer painted red bars inside the blue area
// there (its whiskers color cache leaked across the interleaved strands); it
// is the case that tells StrandedXYPlotRenderer apart from the stock one.
const CASES = [
  { name: 'zoomed in (raw values)', region: 'ssa01:56,174,000..56,190,000', shot: '04-zoomed-in' },
  { name: 'zoomed out (summary bins)', region: '1:158,800,000..159,800,000', shot: '05-zoomed-out' },
  { name: 'both strands at one position', region: '9:79,192,811..79,404,099', shot: '06-both-strands' },
]

let failures = 0

// First, the view exactly as a user opens it - no navigation. The default
// session starts inside a reverse-strand gene, so reverse (red) signal must be
// drawn. Navigating first would hide a broken default session: typing a
// location canonicalises the refName, so a session region naming an alias
// (`ssa01` rather than `1`) renders empty on load yet works after any move.
{
  const deadline = Date.now() + 60000
  let negN = 0
  while (Date.now() < deadline) {
    negN = await page.evaluate(() => {
      let best = 0
      for (const c of document.querySelectorAll('canvas')) {
        if (c.width < 200 || c.height < 40) continue
        let d
        try { d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data } catch { continue }
        let n = 0
        for (let i = 0; i < d.length; i += 4)
          if (d[i + 3] >= 40 && Math.abs(d[i] - 209) < 60 && Math.abs(d[i + 1] - 73) < 60 && Math.abs(d[i + 2] - 91) < 60) n++
        best = Math.max(best, n)
      }
      return best
    })
    if (negN > 20) break
    await page.waitForTimeout(3000)
  }
  await page.screenshot({ path: `${SHOTS}/03-default-view.png` })
  console.log('\ndefault view (no navigation)')
  if (negN > 20) console.log(`  PASS: reverse strand drawn (${negN} red px)`)
  else { console.log('  FAIL: default view draws no reverse-strand signal'); failures++ }
}

for (const c of CASES) {
  await goTo(c.region)
  const deadline = Date.now() + 120000
  let result = null
  while (Date.now() < deadline) {
    result = await scanCanvases()
    if (result) break
    await page.waitForTimeout(4000)
  }
  await page.screenshot({ path: `${SHOTS}/${c.shot}.png` })
  console.log(`\n${c.name}  ${c.region}`)
  if (!result) {
    console.log('  FAIL: no canvas carrying both strand colors')
    failures++
    continue
  }
  console.log(`  forward (blue): ${result.posN} px, y ${result.posMin}..${result.posMax}`)
  console.log(`  reverse (red) : ${result.negN} px, y ${result.negMin}..${result.negMax}`)
  if (result.posMax <= result.negMin) {
    console.log(`  PASS: all blue above all red`)
  } else {
    console.log(`  FAIL: strands overlap vertically - reverse strand is not below the axis`)
    failures++
  }
}

// The tooltip must report both strands at once. The stock one takes a single
// feature, so over a position with signal on both strands it showed one value.
{
  console.log('\ntooltip over the last region')
  // Blocks extend past the view on both sides (the first one starts behind
  // the guide sidebar), so sweep the on-screen part of the track rather than
  // a block's own box, until both strands have a value under the mouse.
  const both = /\+ strand\s*[\d,.]+[\s\S]*− strand\s*[\d,.]+/
  const view = await page.locator('[data-testid="stranded-wiggle-rendering"]').first().boundingBox()
  const canvas = await page.locator('[data-testid^="view-container-"]').first().boundingBox()
  let text = ''
  if (view && canvas) {
    for (let x = canvas.x + 60; x < canvas.x + canvas.width - 10 && !both.test(text); x += 8) {
      await page.mouse.move(x, view.y + view.height / 2)
      await page.waitForTimeout(150)
      text = await page.locator('[data-testid="stranded-tooltip"]').first().innerText({ timeout: 500 }).catch(() => '')
    }
  }
  await page.screenshot({ path: `${SHOTS}/07-tooltip.png` })
  console.log('  ' + text.replace(/\n/g, ' | '))
  if (both.test(text)) console.log('  PASS: tooltip reports both strands')
  else { console.log('  FAIL: no tooltip with values for both strands'); failures++ }
  await page.mouse.move(0, 0)
}

// Log scale: the stock d3 log scale is undefined below zero, so this is the
// display's own signed log2(x+1). Switch it from the track menu and check the
// strands are still split at the axis and the axis is labelled in raw units.
//
// Switch at the zoomed-in region, which peaks around 60k: for a moment after
// the switch the domain still comes from the linear stats, and reading that
// as log2 units once overflowed to 2^60000 = Infinity and hung building ticks
// (only above ~1024, so a low-coverage region hides it). Then check the
// strands on the two-strand region.
{
  console.log('\nlog scale')
  await goTo(CASES[0].region)
  await page.waitForTimeout(8000)
  await page.locator('[data-testid="track_menu_icon"]').first().click()
  const item = t => page.locator('[role="menu"]').last().getByText(t, { exact: true })
  await item('Score').click()
  await item('Scale type').click()
  await item('Log, log2(x+1)').click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(8000)
  const highLabels = await page.locator('svg text').allTextContents()
  console.log(`  axis labels at ${CASES[0].region}:`, highLabels.join(' '))
  await goTo(CASES[2].region)
  await page.waitForTimeout(8000)
  let result = null
  const deadline = Date.now() + 60000
  while (Date.now() < deadline && !(result = await scanCanvases())) await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/08-log-scale.png` })
  const labels = await page.locator('svg text').allTextContents()
  console.log('  axis labels:', labels.join(' '))
  if (!result) { console.log('  FAIL: no canvas carrying both strand colors'); failures++ }
  else if (result.posMax > result.negMin) { console.log('  FAIL: strands overlap on the log scale'); failures++ }
  else console.log(`  PASS: all blue above all red (blue y ${result.posMin}..${result.posMax}, red y ${result.negMin}..${result.negMax})`)
  if (labels.some(l => /^(10|100|1k|10k)$/.test(l))) console.log('  PASS: axis labelled in raw units')
  else { console.log('  FAIL: axis not labelled in raw units'); failures++ }
}

console.log('\nsalmobase requests proxied:', n)
console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none')
if (errors.length) failures++
await browser.close()
process.exit(failures ? 1 : 0)
