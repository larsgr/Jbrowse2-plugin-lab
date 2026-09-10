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
`App.tsx` fetches from `salmobase.org` and `raw.githubusercontent.com`. When the
proxy blocks those you get a red `Failed to fetch` banner, the Linear Genome
View falls back to its assembly-picker import form, and the console shows
`ERR_TUNNEL_CONNECTION_FAILED`. **This is expected offline and is not a
regression** — the driver reports those separately from real page errors. All
three plugins work regardless, because none of them depend on track data. If you
need to verify actual track rendering, you need network access to those hosts.

## Writing your own interactions

Two selector traps, both of which produce *false passes* rather than obvious
breakage — worth knowing before you trust a hand-written check:

**Scope menu items to the open popover.** The demo page repeats every menu label
in its "Loaded Plugins" description cards ("Open with Add → Open Hello World
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

## Adding a plugin to the smoke test

When you add a plugin under `src/plugins/`, register it in the `plugins` array
in `src/App.tsx` (it does not load otherwise) and add a `step(...)` to
`scripts/drive.mjs` that opens it from its menu and asserts something only a
working plugin produces — a computed value, not merely a heading. To confirm the
new step actually discriminates, remove the plugin from the `App.tsx` array,
re-run, and check that your step fails and the others still pass.
