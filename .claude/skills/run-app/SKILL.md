---
name: run-app
description: Launch and visually verify the JBrowse2 Plugin Lab app in a real browser - Vite dev server plus headless Chromium, with a bundled smoke test that drives all three plugins and saves screenshots. Use this whenever you need to run, start, open, preview, or screenshot this app, or to confirm that a plugin change actually works in the browser rather than just compiling. Reach for it any time you touch src/plugins/ or src/App.tsx and want proof the menus, widget, or custom view still function - `npm run build` passing is not evidence that a plugin still loads.
---

# Running the JBrowse2 Plugin Lab

This app's whole purpose is plugin extension points that only exist at runtime:
a widget in the drawer, a custom view, and menu items injected via `configure()`.
None of that is covered by `tsc` or ESLint, and there is no test suite — so the
only way to know a plugin still works is to open the app and click it.

## Fast path: the bundled smoke test

```bash
.claude/skills/run-app/scripts/smoke.sh [screenshot-dir]
```

It installs Playwright if missing, starts the dev server, drives all three
plugins, writes numbered screenshots, and stops the server. Exit code is
non-zero if any step failed, and each step prints `OK` or `FAIL` with the step
name, so a failure tells you which plugin broke.

Default screenshot dir is `$TMPDIR/jbrowse-lab-shots`.

**Look at the screenshots, don't just trust the exit code.** A blank or
shell-only page can still satisfy several assertions. The interesting ones are
`02-add-menu.png` (both plugin items present in the ADD menu) and
`06-seqstats-recomputed.png` (all three plugins live at once).

## What it checks

| Step | Proves |
|---|---|
| shell mounts | `@jbrowse/react-app2` app shell renders with its menu bar |
| ADD menu lists both items | `configure()` + `appendToMenu` ran, MUI icons resolved |
| widget opens / reacts to typing | `WidgetType` registered, MST model instantiated |
| Sequence Stats view opens | `ViewType` registered, `setWidth` contract satisfied |
| GC content recomputes | MST `views()` recompute and `observer()` re-renders |
| Tools items fire | `configure()`-only plugin reads real session state |

## Environment specifics that will bite you

**Playwright's bundled browser version does not match the container.** A fresh
`npm install playwright` expects a newer Chromium build than the image ships
(1194), and fails with "Executable doesn't exist". Do not run
`npx playwright install` — launch with the browser that is already there:

```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
```

**Playwright is deliberately not a project dependency.** Installing it into the
repo would add a heavy devDependency and dirty `package.json` for what is only a
local verification tool. `smoke.sh` installs it into a temp dir instead and runs
the driver from there so Node resolves it.

**The dev server URL includes the base path**: `http://localhost:5173/Jbrowse2-plugin-lab/`
(from `base` in `vite.config.ts`). The bare root 302-redirects there, so either
works, but poll the base path when waiting for readiness.

**Stop the server by port, not by `$!`.** `npm` does not forward SIGTERM to the
Vite process it spawns, so killing the npm wrapper leaves a listener behind and
the next run hits `EADDRINUSE`:

```bash
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
```

Avoid `pkill -f vite` — a broad pattern can match the agent's own command line.

**Remote genome data does not load in a sandboxed container.** The config in
`App.tsx` fetches from `salmobase.org` and `raw.githubusercontent.com`. You get
a red `Failed to fetch` banner, the Linear Genome View falls back to its
assembly-picker import form, and the console shows `ERR_TUNNEL_CONNECTION_FAILED`
or `ERR_CONNECTION_RESET`. **This is expected and is not a regression** — the
driver reports those separately from real page errors. The menu/widget/view
plugins work regardless, because none of them depend on track data.

Note that `curl` succeeding tells you nothing about the browser here: the egress
proxy serves curl (including Range requests) while closing Chromium's tunnels
mid-exchange, so `raw.githubusercontent.com` returns 200 to curl and
`Failed to fetch` in the page. Check with an in-page `fetch()`, not curl.

**To verify anything that needs track data** (a new adapter, a renderer), get
the bytes into the page one of two ways.

*Route interception* is the better option for remote or large data. Node can
reach the network even though Chromium cannot, so forward the requests through
the node side and leave the repo config untouched — no temporary URL edits to
remember to revert. Range requests survive, so a 74MB BigWig costs only the few
KB the adapter actually reads:

```js
await page.route('https://salmobase.org/**', async route => {
  const req = route.request()
  const headers = { ...req.headers() }
  delete headers.host
  const res = await fetch(req.url(), { headers, method: req.method() })
  const body = Buffer.from(await res.arrayBuffer())
  const h = {}
  for (const [k, v] of res.headers) {
    if (!/^(content-encoding|content-length|transfer-encoding)$/i.test(k)) h[k] = v
  }
  h['access-control-allow-origin'] = '*'
  h['access-control-expose-headers'] = 'Content-Length,Content-Range'
  await route.fulfill({ status: res.status, headers: h, body })
})
```

`scripts/verify-stranded.mjs` does exactly this to check StrandedBigWigPlugin
against the live Aqua-Faang BodyMap BigWigs:

```bash
.claude/skills/run-app/scripts/verify-stranded.sh   # starts and stops the server itself
```

It enables the Liver track, first checks that the untouched default view
draws reverse-strand signal (what a user sees on opening the page), then
navigates to a zoomed-in and a zoomed-out region and asserts that every
forward-strand (blue) pixel sits above every reverse-strand (red) pixel. Like
`smoke.sh` it runs the driver out of the playwright temp dir, since `playwright`
is not resolvable from the repo root.

*Serving locally* is still simpler for small files:

```bash
mkdir -p public/test_data
V=https://raw.githubusercontent.com/GMOD/jbrowse-components/main/test_data/volvox
for f in volvox.2bit volvox.bw volvox-sorted.bam.coverage.bw; do
  curl -sS -o "public/test_data/$f" "$V/$f"
done
# then temporarily point VOLVOX_DATA_URL at '/Jbrowse2-plugin-lab/test_data'
```

Vite serves `public/` under the base path, so the browser fetches from
localhost and the volvox assembly loads. Revert both changes afterwards —
`public/test_data/` is deliberately not committed. Beware that `volvox.bw` and
`volvox_microarray.bw` are byte-identical, so pairing them hides bugs.

To drive a track: open a **fresh** Linear genome view from the Add menu (the
default session's view is wedged on the unreachable `Ssal_v3.1` assembly), wait
for **Show all regions in assembly** to become enabled, then check the track's
box — the row is
`label:has([data-testid="htsTrackLabel-Tracks,<trackId>"]) input[type="checkbox"]`,
and clicking the visible text label does *not* toggle it.

For a quantitative track, assert on canvas pixels rather than on text: read
`getImageData` and compare the y-ranges of each color. "Blue lies entirely above
red" is axis-relative and survives autoscale changes, whereas splitting the
canvas at its midline silently passes when the zero line is off-center.

## Writing your own interactions

Two selector traps, both of which produce *false passes* rather than obvious
breakage — worth knowing before you trust a hand-written check:

**Scope menu items to the open popover.** The demo page repeats every menu label
in its plugin guide cards ("Open with Add → Open Hello World
Widget"). An unscoped `getByText('Open Hello World Widget')` matches that card
and reports success while the menu is still shut:

```js
const item = n => page.locator('[role="menu"]').getByText(n, { exact: true })
```

**Menu bar entries are plain `<button>`s** with no explicit role, whose text is
uppercased by CSS (`FILE`, `ADD`, `TOOLS`, `HELP`):

```js
const menu = n => page.locator('button').filter({ hasText: new RegExp(`^${n}$`, 'i') }).first()
```

**Session regions must use canonical refNames.** If a newly enabled track
renders an empty `0` axis and requests nothing past the file header, check the
`refName` in `displayedRegions` before suspecting the adapter. JBrowse maps
region names to each adapter's names through a table keyed by the assembly's
*canonical* name (the `.fai` name, e.g. `1`), so an alias (`ssa01` from
`alias.txt`) reaches every adapter untranslated and every track comes back
empty — stock adapters included. Typing a location in the search box
canonicalises the name, which makes this look like a "track wakes up once the
view moves" stall. The track's `Loading` text in `innerText` is not evidence
either: `LoadingOverlay` always renders it, just at `opacity: 0` when idle.

**Keep `defaultSession` views free of `tracks`.** Naming tracks in
a session's `tracks: []` array blanks the entire app on load with
`Cannot read properties of undefined (reading 'resizeHeight')`, because
TrackContainer instantiates them before their displays exist. `bpPerPx` works
and frames the region at that zoom. Without it, a view opens at 1bp/px on the *left edge* of its region no matter how
wide that region is, so to have the demo open on actual signal, start
`displayedRegions` inside the feature you want shown rather than at a round
number.

**Handle `alert()` or clicks will hang.** `FeatureCountPlugin` reports through
`alert()`. Without a dialog handler the click never resolves and the step times
out looking like an app failure:

```js
page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss() })
```

**Open the menu inside each step** rather than relying on a previous step
leaving it open, and dismiss stray popovers after a failure (`Escape`). A menu
left hanging over the page makes every subsequent click time out, so one real
failure cascades and the output stops telling you what actually broke.

**React inputs need `fill`/`type`**, not `eval el.value = ...` — the latter
doesn't fire React's onChange, so MST never updates.

## Checking the phone layout

`smoke.sh` runs at 1600px wide, where the plugin guide is a sidebar. The phone
layout (bottom tab bar, full-screen widget sheet) only exists below 900px, so
check it separately with a Playwright device profile such as
`devices['iPhone 13']`. On a phone the guide covers the browser until you tap
the **Browser** tab, and the guide's launch buttons (`Open widget`,
`Open view`, ...) switch to it for you.

## Adding a plugin to the smoke test

When you add a plugin under `src/plugins/`, register it in the `plugins` array
in `src/App.tsx` (it does not load otherwise) and add a `step(...)` to
`scripts/drive.mjs` that opens it from its menu and asserts something only a
working plugin produces — a computed value, not merely a heading. To confirm the
new step actually discriminates, remove the plugin from the `App.tsx` array,
re-run, and check that your step fails and the others still pass.
