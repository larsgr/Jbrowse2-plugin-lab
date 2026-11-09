// End-to-end check of ConditionPileupPlugin against the live Aqua-Faang data.
//
//   node .claude/skills/run-app/scripts/verify-condition-pileups.mjs
//
// Expects a dev server already running on :5173 and REPO_ROOT pointing at the
// repo (verify-condition-pileups.sh sets both up). Exits non-zero on any FAIL.
//
// The assertions compare what the tracks *say* (their hover tooltips, which
// read the renderer's own per-pixel raster) with the same files read
// independently here in node through @gmod/bbi. A track that draws something
// plausible but mislabels conditions, miscounts states, swaps strands or
// misses a file fails here, where a screenshot would look fine.
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SHOTS = process.env.SHOTS || `${process.env.TMPDIR || '/tmp'}/pileup-shots`
const REPO = process.env.REPO_ROOT || process.cwd()
fs.mkdirSync(SHOTS, { recursive: true })

const mod = p => import(pathToFileURL(path.join(REPO, 'node_modules', p)).href)
const { BigBed, BigWig } = await mod('@jbrowse/react-app2/node_modules/@gmod/bbi/dist/index.js')
const gfh = await mod('generic-filehandle2/dist/index.js').catch(() => mod('generic-filehandle2/esm/index.js'))
const RemoteFile = gfh.RemoteFile ?? gfh.default?.RemoteFile

// The sandbox's egress proxy answers 503/429 when too many requests are in
// flight (this script reads the files while the page does). Back off and
// retry, so a busy proxy is not reported as a broken track.
async function fetchRetry(url, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init)
    if (![429, 502, 503].includes(res.status) || attempt >= 5) return res
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt))
  }
}

const AF = 'https://salmobase.org/datafiles/datasets/Aqua-Faang'
const DISPLAY = {
  chrom: 'Ssal_v3.1-aquafaang-chromatin-states-LinearChromatinStateDisplay',
  rna: 'Ssal_v3.1-aquafaang-rnaseq-conditions-LinearConditionWiggleDisplay',
  k4: 'Ssal_v3.1-aquafaang-chip-H3K4me3-conditions-LinearConditionWiggleDisplay',
  k27: 'Ssal_v3.1-aquafaang-chip-H3K27ac-conditions-LinearConditionWiggleDisplay',
}

// The conditions exactly as src/conditionTracks.ts lists them.
const TISSUE_STATES = [['Immature', 'Imm'], ['Mature', 'Mat']]
const SEXES = [['Female', 'F'], ['Male', 'M']]
const bodyMap = tissues => tissues.flatMap(t => TISSUE_STATES.flatMap(([s, ss]) =>
  SEXES.map(([x, xs]) => ({ name: `${t} ${ss} ${xs}`, sample: `${t}_${s}_${x}` }))))
const CHROM_CONDITIONS = [
  ...bodyMap(['Brain', 'Gonad', 'Liver', 'Muscle']).map(c => ({
    ...c, url: `${AF}/chromatin_states/AtlanticSalmon/BodyMap/AtlanticSalmon_${c.sample}.bb` })),
  ...[['LateBlastulation', 'L blastula'], ['MidGastrulation', 'M gastrula'],
    ['EarlySomitogenesis', 'E somit.'], ['MidSomitogenesis', 'M somit.'],
    ['LateSomitogenesis', 'L somit.']].map(([s, name]) => ({
    name, url: `${AF}/chromatin_states/AtlanticSalmon/DevMap/AtlanticSalmon_${s}.bb` })),
]
const RNA_CONDITIONS = bodyMap(['Brain', 'Gonad', 'Liver', 'Muscle', 'Gill']).map(c => ({
  ...c,
  fwd: `${AF}/trackhub/AtlanticSalmon/BodyMap/RNA/bigWig/AtlanticSalmon_RNA_${c.sample}_R1.forward.bigWig`,
  rev: `${AF}/trackhub/AtlanticSalmon/BodyMap/RNA/bigWig/AtlanticSalmon_RNA_${c.sample}_R1.reverse.bigWig`,
}))
// The palette's folding of file names into legend entries (conditionTracks.ts).
const FOLD = { 'Poised enhancer 1': 'Poised enhancer', 'Poised enhancer 2': 'Poised enhancer',
  'Unknown 1': 'Unknown', 'Unknown 2': 'Unknown' }
const BACKGROUND = new Set(['Quiescent'])

const bigBeds = CHROM_CONDITIONS.map(c => new BigBed({ filehandle: new RemoteFile(c.url, { fetch: fetchRetry }) }))
const bigWigs = new Map()
const bw = url => {
  if (!bigWigs.has(url)) bigWigs.set(url, new BigWig({ filehandle: new RemoteFile(url, { fetch: fetchRetry }) }))
  return bigWigs.get(url)
}

/** Each condition's state at bp (0-based), and the segment it sits in. */
async function statesAt(bp) {
  return Promise.all(bigBeds.map(async b => {
    const [f] = await b.getFeatures('25', bp, bp + 1)
    if (!f) return { state: undefined, start: bp, end: bp + 1 }
    const name = f.rest.split('\t')[0]
    return { state: BACKGROUND.has(name) ? undefined : (FOLD[name] ?? name), start: f.start, end: f.end }
  }))
}

/** Raw coverage per condition and strand at bp (0-based). */
async function rnaAt(bp) {
  const at = async url => (await bw(url).getFeatures('25', bp, bp + 1, { scale: 1 }))
    .find(f => f.start <= bp && f.end > bp)?.score ?? 0
  // One condition at a time: 40 parallel reads trip the proxy's limits.
  const out = []
  for (const c of RNA_CONDITIONS) out.push({ name: c.name, fwd: Math.abs(await at(c.fwd)), rev: Math.abs(await at(c.rev)) })
  return out
}

// ---------------------------------------------------------------------------

// The container's Chromium, as in the other scripts: a freshly installed
// playwright expects a newer build than the image ships.
const CHROMIUM = '/opt/pw-browsers/chromium'
const browser = await chromium.launch({
  executablePath: fs.existsSync(CHROMIUM) ? CHROMIUM : undefined,
  args: ['--no-sandbox'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })

// The egress proxy serves node but closes Chromium's tunnels, so forward
// salmobase requests through the node side. Range requests survive.
let proxied = 0
await page.route('https://salmobase.org/**', async route => {
  const req = route.request(); const headers = { ...req.headers() }; delete headers.host
  try {
    const res = await fetchRetry(req.url(), { headers, method: req.method() })
    const body = Buffer.from(await res.arrayBuffer()); const h = {}
    for (const [k, v] of res.headers) if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) h[k] = v
    h['access-control-allow-origin'] = '*'
    h['access-control-expose-headers'] = 'Content-Length,Content-Range'
    proxied++
    await route.fulfill({ status: res.status, headers: h, body })
  } catch (e) { console.log('PROXY-ERR', req.url(), String(e)); await route.abort() }
})

const errors = []
page.on('pageerror', e => errors.push(String(e)))
// A throw inside a MobX reaction is only logged, never a 'pageerror'.
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(m.text().slice(0, 300)) })

let failures = 0
const pass = msg => console.log(`  PASS: ${msg}`)
const fail = msg => { console.log(`  FAIL: ${msg}`); failures++ }
const display = id => page.locator(`[data-testid="display-${id}"]`)
const tooltip = () => page.locator('[data-testid="pileup-tooltip"]').first().innerText({ timeout: 1500 }).catch(() => '')

async function waitRendered(label, timeout = 150000) {
  // Ready = every block in every display has drawn its canvas and none is
  // still showing JBrowse's loading overlay. Counting only the blocks that
  // exist is not enough: a block that has not started rendering yet has no
  // canvas at all, only the hatched loading placeholder.
  await page.waitForTimeout(1000)
  const deadline = Date.now() + timeout
  let state = []
  while (Date.now() < deadline) {
    state = await page.evaluate(ids => ids.map(id => {
      const d = document.querySelector(`[data-testid="display-${id}"]`)
      if (!d) return 'missing'
      if (/error/i.test(d.innerText)) return `error: ${d.innerText.slice(0, 120)}`
      const blocks = d.querySelectorAll('[data-testid="pileup-block"]').length
      const done = d.querySelectorAll('[data-testid="pileup-block"] canvas[data-testid$="_done"]').length
      const loading = d.querySelectorAll('[data-testid="loading-overlay"]').length
      return blocks && blocks === done && !loading ? 'ok' : `${done}/${blocks} drawn, ${loading} loading`
    }), Object.values(DISPLAY))
    if (state.some(s => s.startsWith('error'))) break
    if (state.every(s => s === 'ok')) return true
    await page.waitForTimeout(1000)
  }
  fail(`${label}: tracks did not finish rendering (${state.join('; ')})`)
  return false
}

/** The view's displayed range, read back from its location box. */
async function visibleRange() {
  const v = await page.locator('input[value*=":"]').first().inputValue()
  const m = v.replace(/,/g, '').match(/:(\d+)\.\.(\d+)/)
  const box = await page.locator('[data-testid^="view-container-"]').first().boundingBox()
  const start = +m[1] - 1, end = +m[2]
  return { start, end, xOf: bp => box.x + ((bp + 0.5 - start) / (end - start)) * box.width }
}

async function goTo(loc) {
  const input = await page.locator('input[value*=":"]').first().elementHandle()
  await input.click(); await input.fill(loc); await input.press('Enter')
  await page.waitForTimeout(1500)
}

/** Hovers until the tooltip reports a single bp, returns [bp, text]. */
async function hoverBp(x, y) {
  for (const dx of [0, 1, -1, 2, -2, 3]) {
    await page.mouse.move(x + dx, y)
    await page.waitForTimeout(400)
    const text = await tooltip()
    const m = text.match(/^25:([\d,]+)\n/)
    if (m) return [+m[1].replace(/,/g, '') - 1, text]
  }
  return [undefined, await tooltip()]
}

// ---------------------------------------------------------------------------

await page.goto(process.env.URL || 'http://localhost:5173/Jbrowse2-plugin-lab/', { waitUntil: 'domcontentloaded', timeout: 240000 })
await page.locator('text=Show all regions in assembly').first().waitFor({ state: 'visible', timeout: 120000 }).catch(() => {})
await page.waitForTimeout(1500)

console.log('\nguide card: Open at prototype locus')
await page.getByRole('button', { name: 'Open at prototype locus' }).click()
const t0 = Date.now()
if (await waitRendered('prototype locus')) pass(`all four tracks rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
await page.screenshot({ path: `${SHOTS}/01-collapsed.png` })
for (const [k, id] of Object.entries(DISPLAY)) await display(id).screenshot({ path: `${SHOTS}/01-${k}-collapsed.png` })

// --- chromatin states, collapsed ------------------------------------------
console.log('\nchromatin pile-up tooltip vs. the 21 BigBeds')
{
  // A position well inside every condition's segment, so the pixel column
  // under the mouse cannot straddle a state boundary in any file.
  const range = await visibleRange()
  const margin = 4 * (range.end - range.start) / 1250
  let P, truth
  for (let bp = 28994200; bp < 28994400; bp += 20) {
    const s = await statesAt(bp)
    if (s.every(x => x.start <= bp - margin && x.end >= bp + margin)) { P = bp; truth = s; break }
  }
  const expected = new Map()
  for (const [i, s] of truth.entries()) if (s.state) expected.set(s.state, [...(expected.get(s.state) ?? []), i])
  const box = await display(DISPLAY.chrom).boundingBox()
  await page.mouse.move(range.xOf(P), box.y + box.height - 8)
  await page.waitForTimeout(800)
  const text = await tooltip()
  await page.screenshot({ path: `${SHOTS}/02-chrom-tooltip.png` })
  console.log('  ' + text.replace(/\n/g, ' | '))
  const shown = new Map([...text.matchAll(/^(.+?)\t(\d+)\/21/gm)].map(m => [m[1].trim(), +m[2]]))
  const want = new Map([...expected].map(([k, v]) => [k, v.length]))
  console.log('  expected', JSON.stringify([...want]))
  if (shown.size && JSON.stringify([...shown].sort()) === JSON.stringify([...want].sort()))
    pass(`state counts at 25:${P + 1} match the files`)
  else fail(`state counts at 25:${P + 1} differ from the files`)

  // --- expand -------------------------------------------------------------
  console.log('\nchromatin expanded rows')
  const before = box.height
  await display(DISPLAY.chrom).locator('[data-testid="pileup-expand"]').click()
  await page.waitForTimeout(500)
  await waitRendered('chromatin expanded')
  const labels = await display(DISPLAY.chrom).locator('[data-testid="pileup-row-label"]').allInnerTexts()
  const after = (await display(DISPLAY.chrom).boundingBox()).height
  if (labels.length === 21 && labels.every((l, i) => l.trim() === CHROM_CONDITIONS[i].name))
    pass(`21 row labels in config order (track grew ${before}px -> ${after}px)`)
  else fail(`row labels: ${JSON.stringify(labels)}`)
  await display(DISPLAY.chrom).screenshot({ path: `${SHOTS}/03-chrom-expanded.png` })

  // One row with a state and one without, each checked against its file.
  const withState = truth.findIndex(s => s.state)
  const without = truth.findIndex(s => !s.state)
  for (const row of [withState, without].filter(r => r >= 0)) {
    const lb = await display(DISPLAY.chrom).locator('[data-testid="pileup-row-label"]').nth(row)
    await lb.scrollIntoViewIfNeeded()
    const rb = await lb.boundingBox()
    const r2 = await visibleRange()
    await page.mouse.move(r2.xOf(P), rb.y + rb.height / 2)
    await page.waitForTimeout(800)
    const t = await tooltip()
    const ok = t.includes(CHROM_CONDITIONS[row].name) &&
      (truth[row].state ? t.includes(truth[row].state) : t.includes('background state'))
    console.log(`  row ${row}: ${t.replace(/\n/g, ' | ')}`)
    if (ok) pass(`row ${row} (${CHROM_CONDITIONS[row].name}) reports ${truth[row].state ?? 'background'}`)
    else fail(`row ${row} (${CHROM_CONDITIONS[row].name}) should report ${truth[row].state ?? 'background'}`)
  }
  await page.mouse.move(0, 0)
}

// --- RNA-seq, zoomed in to single bases ------------------------------------
console.log('\nRNA-seq tooltip vs. the 40 BigWigs (single-base zoom)')
{
  // Find a position with signal on both strands in the locus.
  let Q
  for (let bp = 28994600; bp < 29000000 && Q === undefined; bp += 97) {
    const v = await rnaAt(bp)
    if (v.some(x => x.fwd > 0) && v.some(x => x.rev > 0)) Q = bp
  }
  if (Q === undefined) fail('no position with signal on both strands found')
  else {
    await goTo(`25:${Q - 150}..${Q + 150}`)
    await waitRendered('RNA zoomed in')
    await display(DISPLAY.rna).scrollIntoViewIfNeeded()
    const range = await visibleRange()
    const box = await display(DISPLAY.rna).boundingBox()
    // Over the pile-up (just under the caption block's right edge).
    const [bp, text] = await hoverBp(range.xOf(Q), box.y + 70)
    await page.screenshot({ path: `${SHOTS}/04-rna-tooltip.png` })
    console.log('  ' + text.replace(/\n/g, ' | '))
    if (bp === undefined) fail('no single-base tooltip over the RNA pile-up')
    else {
      const truth = await rnaAt(bp)
      const rows = new Map([...text.matchAll(/^(.+?)\t([\d.k]+)\t([\d.k]+)$/gm)].map(m => [m[1].trim(), [+m[2], +m[3]]]))
      const totFwd = truth.reduce((a, v) => a + v.fwd, 0), totRev = truth.reduce((a, v) => a + v.rev, 0)
      const combined = rows.get('Combined') ?? [...rows].find(([k]) => k.startsWith('Combined'))?.[1]
      let bad = 0
      for (const [name, [f, r]] of rows) {
        if (name.startsWith('Combined')) continue
        const t = truth.find(x => x.name === name)
        if (!t || Math.abs(t.fwd - f) > 0.01 || Math.abs(t.rev - r) > 0.01) { bad++; console.log(`    mismatch ${name}: shown ${f}/${r}, file ${t?.fwd}/${t?.rev}`) }
      }
      if (rows.size > 1 && !bad) pass(`${rows.size - 1} conditions at 25:${bp + 1} match their forward/reverse files`)
      else fail(`per-condition values at 25:${bp + 1} differ from the files`)
      if (combined && Math.abs(combined[0] - totFwd) < 0.01 && Math.abs(combined[1] - totRev) < 0.01)
        pass(`combined totals ${combined[0]} / ${combined[1]} = sum over all 20 conditions`)
      else fail(`combined ${JSON.stringify(combined)} != ${totFwd} / ${totRev}`)
    }
  }
}

// --- RNA-seq expanded, log rows, then linear --------------------------------
console.log('\nRNA-seq expanded + row scale')
{
  await display(DISPLAY.rna).locator('[data-testid="pileup-expand"]').click()
  await page.waitForTimeout(500)
  await waitRendered('RNA expanded')
  const caption = await display(DISPLAY.rna).locator('[data-testid="pileup-caption"]').innerText()
  const labels = await display(DISPLAY.rna).locator('[data-testid="pileup-row-label"]').count()
  console.log('  caption: ' + caption.replace(/\n/g, ' | '))
  if (labels === 20 && /rows: log scale/.test(caption)) pass('20 rows, log scale from config')
  else fail(`expected 20 rows on a log scale, got ${labels} / "${caption}"`)
  await display(DISPLAY.rna).screenshot({ path: `${SHOTS}/05-rna-expanded-log.png` })

  await display(DISPLAY.rna).scrollIntoViewIfNeeded()
  const menuButtons = page.locator('[data-testid="track_menu_icon"]')
  // The RNA track is second in the view.
  await menuButtons.nth(1).click()
  const item = t => page.locator('[role="menu"]').last().getByText(t, { exact: true })
  await item('Score').click()
  await item('Row scale').click()
  await item('Linear').click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(1000)
  await waitRendered('RNA linear rows')
  const caption2 = await display(DISPLAY.rna).locator('[data-testid="pileup-caption"]').innerText()
  if (/rows: linear scale/.test(caption2)) pass('Score → Row scale → Linear re-labels and redraws the rows')
  else fail(`row scale switch: "${caption2}"`)
  await display(DISPLAY.rna).screenshot({ path: `${SHOTS}/06-rna-expanded-linear.png` })

  await display(DISPLAY.rna).locator('[data-testid="pileup-expand"]').click()
  await page.waitForTimeout(800)
  if (await display(DISPLAY.rna).locator('[data-testid="pileup-row-label"]').count() === 0) pass('Collapse removes the rows')
  else fail('Collapse left row labels behind')
}

// --- zoomed out ---------------------------------------------------------------
console.log('\nzoomed out (BigWig summary bins, thousands of segments)')
{
  await goTo('25:27,000,000..31,000,000')
  const t1 = Date.now()
  if (await waitRendered('4 Mb')) pass(`4 Mb window rendered in ${((Date.now() - t1) / 1000).toFixed(1)}s`)
  const tooLarge = await display(DISPLAY.chrom).getByText(/Zoom in|Force load/i).count()
  if (tooLarge) fail('chromatin track asks to zoom in at 4 Mb')
  else pass('chromatin track draws at 4 Mb')
  await page.screenshot({ path: `${SHOTS}/07-zoomed-out.png` })
  const range = await visibleRange()
  const box = await display(DISPLAY.rna).boundingBox()
  let text = ''
  for (let x = range.xOf(range.start) + 200; x < range.xOf(range.end) - 20 && !/mean over/.test(text); x += 37) {
    await page.mouse.move(x, box.y + 70); await page.waitForTimeout(250); text = await tooltip()
  }
  console.log('  ' + text.replace(/\n/g, ' | ').slice(0, 200))
  if (/mean over [\d.k]+ bp/.test(text)) pass('tooltip reports the per-pixel summary')
  else fail('no summary tooltip when zoomed out')
}

console.log('\nsalmobase requests proxied:', proxied)
console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none')
if (errors.length) failures++
await browser.close()
console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED')
process.exit(failures ? 1 : 0)
