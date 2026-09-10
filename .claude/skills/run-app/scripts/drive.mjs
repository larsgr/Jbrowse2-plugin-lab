// Smoke test for the JBrowse2 Plugin Lab: drives all three plugins in a real
// browser and screenshots each step. Run it via scripts/smoke.sh, which handles
// installing playwright and starting the dev server.
//
// Env:
//   URL   - app URL (default http://localhost:5173/Jbrowse2-plugin-lab/)
//   SHOTS - directory for screenshots (default ./shots next to this script)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_URL = process.env.URL || 'http://localhost:5173/Jbrowse2-plugin-lab/'
const SHOTS = process.env.SHOTS || join(dirname(fileURLToPath(import.meta.url)), 'shots')
mkdirSync(SHOTS, { recursive: true })

const errors = []
const dialogs = []
let fails = 0

// The container ships Chromium build 1194; a freshly npm-installed playwright
// usually expects a newer build and refuses to launch. Point it at the binary
// that is actually present rather than downloading one.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
})
const page = await (
  await browser.newContext({ viewport: { width: 1600, height: 1000 } })
).newPage()

page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
// FeatureCountPlugin reports through alert(). Without a dialog handler the
// click never returns and the step times out looking like an app failure.
page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss() })

const step = async (name, fn) => {
  try { await fn(); console.log(`OK   ${name}`) }
  catch (e) {
    fails++
    console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`)
    // Dismiss any popover the failed step left open. Otherwise a MUI menu sits
    // over the page and every later click times out too, turning one real
    // failure into a cascade that hides which step actually broke.
    await page.keyboard.press('Escape').catch(() => {})
  }
}

// Menu bar entries are plain <button>s whose rendered text is uppercased by CSS.
const menu = n =>
  page.locator('button').filter({ hasText: new RegExp(`^${n}$`, 'i') }).first()
// Scope menu items to the open popover. The demo page repeats these same labels
// in its "Loaded Plugins" description cards, so an unscoped getByText matches
// the card and reports success while the menu is still shut.
const item = n => page.locator('[role="menu"]').getByText(n, { exact: true })

await step('page loads and JBrowse shell mounts', async () => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('heading', { name: /JBrowse2 Plugin Lab/ }).waitFor({ timeout: 60000 })
  await menu('ADD').waitFor({ timeout: 60000 })
})
await page.waitForTimeout(3000)
await page.screenshot({ path: `${SHOTS}/01-initial.png`, fullPage: true })

await step('ADD menu lists both plugin items', async () => {
  await menu('ADD').click()
  await item('Open Hello World Widget').waitFor({ timeout: 10000 })
  await item('Open Sequence Stats View').waitFor({ timeout: 10000 })
  await page.screenshot({ path: `${SHOTS}/02-add-menu.png` })
  await page.keyboard.press('Escape')
})

// Each menu-driven step opens the menu itself rather than inheriting an open
// popover from the step before. Otherwise one failure makes every later step
// fail for the wrong reason and the output stops telling you what broke.
await step('HelloWorldPlugin (WidgetType): widget opens in drawer', async () => {
  await menu('ADD').click()
  await item('Open Hello World Widget').click()
  await page.locator('#name-input').waitFor({ timeout: 15000 })
})
await page.screenshot({ path: `${SHOTS}/03-helloworld-widget.png` })

await step('HelloWorldPlugin: widget reacts to typing', async () => {
  await page.locator('#name-input').fill('Lars')
  await page.getByText(/Hello, Lars!/).waitFor({ timeout: 8000 })
})
await page.screenshot({ path: `${SHOTS}/04-helloworld-typed.png` })

await step('CustomViewPlugin (ViewType): Sequence Stats view opens', async () => {
  await menu('ADD').click()
  await item('Open Sequence Stats View').click()
  await page.locator('#seq-input').waitFor({ timeout: 15000 })
})
await page.screenshot({ path: `${SHOTS}/05-seqstats-view.png`, fullPage: true })

await step('CustomViewPlugin: MST recomputes GC content', async () => {
  await page.locator('#seq-input').fill('GGGGCCCCAAAA') // 8 of 12 G/C => 66.7%
  await page.getByText('66.7%').first().waitFor({ timeout: 8000 })
})
await page.screenshot({ path: `${SHOTS}/06-seqstats-recomputed.png`, fullPage: true })

await step('FeatureCountPlugin (configure): Count Tracks in View', async () => {
  await menu('TOOLS').click()
  await item('Count Tracks in View').click()
  await page.waitForTimeout(1500)
  if (!dialogs.some(d => d.includes('FeatureCountPlugin Report'))) {
    throw new Error('no report dialog fired')
  }
})

await step('FeatureCountPlugin: About Plugin Lab', async () => {
  await menu('TOOLS').click()
  await item('About Plugin Lab').click()
  await page.waitForTimeout(1500)
  if (!dialogs.some(d => d.includes('JBrowse2 Plugin Lab'))) {
    throw new Error('no about dialog fired')
  }
})
await page.screenshot({ path: `${SHOTS}/07-final.png`, fullPage: true })

console.log('\n--- ALERT DIALOGS ---')
dialogs.forEach(d => console.log(JSON.stringify(d)))

// Remote genome data is usually unreachable from a sandboxed container; that is
// an environment limit, not a regression, so separate it from real page errors.
const uniq = [...new Set(errors)]
const netBlocked = uniq.filter(e => /ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION|Failed to fetch/i.test(e))
const real = uniq.filter(e => !netBlocked.includes(e))
console.log(`\n--- CONSOLE: ${netBlocked.length} network-blocked (expected offline), ${real.length} other ---`)
real.slice(0, 20).forEach(e => console.log('* ' + e.slice(0, 200)))

console.log(`\nScreenshots: ${SHOTS}`)
console.log(`=== ${fails} step(s) failed ===`)
await browser.close()
process.exit(fails ? 1 : 0)
