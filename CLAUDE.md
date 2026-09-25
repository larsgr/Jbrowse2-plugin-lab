# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A lab for experimenting with JBrowse2 plugin extension points. The whole app is a
demo harness: `src/App.tsx` embeds the **full JBrowse app shell** and loads three
example plugins, each demonstrating a different extension point. Deployed to
GitHub Pages at https://larsgr.github.io/Jbrowse2-plugin-lab/.

There is no library build and no test suite — the deliverable is the deployed demo
page, and "does it work" means running `npm run dev` and clicking through the menus.

## Commands

```bash
npm install --legacy-peer-deps   # REQUIRED flag: @jbrowse/* peer deps don't match React 19
npm run dev                      # Vite dev server with HMR
npm run build                    # tsc -b && vite build  (this is also the typecheck)
npm run lint                     # ESLint
npm run preview                  # Serve dist/ locally
```

There is no separate `typecheck` script — run `npx tsc -b` (or `npm run build`) to
type-check. There are no tests, so there is no "run a single test" workflow.

To verify a plugin actually works, run it in a browser:

```bash
.claude/skills/run-app/scripts/smoke.sh   # dev server + headless Chromium, screenshots all three plugins
```

See `.claude/skills/run-app/SKILL.md` (the `run-app` skill) for the environment
gotchas — Playwright browser-version mismatch, selector traps that cause false
passes, and why blocked remote genome data is expected rather than a regression.
A passing `npm run build` says nothing about whether a plugin still loads.

## Architecture

### The app shell choice matters

`src/App.tsx` uses `createViewState` + `JBrowseApp` from `@jbrowse/react-app2`.
This is deliberate: the *full app* shell renders the main menu bar, so plugin menu
items registered under **Add** and **Tools** are actually reachable. The lighter
`@jbrowse/react-linear-genome-view` component has no menu bar and would make most
of these plugins invisible. Don't swap it out.

The JBrowse config (assemblies `volvox` and `Ssal_v3.1`, plus their tracks) is an
inline object literal in `App.tsx`, not a config file. All data is fetched from
remote URLs (GMOD test data on raw.githubusercontent.com, and salmobase.org), so
the dev server needs network access to render anything.

`createViewState` is wrapped in `useMemo(..., [])` — it must be created exactly once.

### The mobile app shell

The page is a full-viewport app shell (`App.tsx` + `App.css`), installable as a
standalone app via `public/manifest.webmanifest` and the `apple-*` tags in
`index.html`. At `max-width: 899px` (or a phone on its side:
`max-height: 499px` with a coarse pointer — keep `NARROW_SCREEN` in `App.tsx`
in step) it is two tabs — the browser and the plugin
guide (`src/PluginGuide.tsx`) — switched by a bottom tab bar; wider screens show
the guide as a sidebar. The guide covers the browser rather than unmounting it,
so JBrowse never sees a 0px-wide view.

`App.css` overrides some of JBrowse's own layout, all scoped under `.jb-host`:
its root hard-codes `height: 100vh` (pinned to the host box instead), and on
narrow screens the widget drawer becomes a full-screen sheet and the menu bar
scrolls sideways. These key off MUI class names and DOM nesting, so re-check
them on a phone viewport after a JBrowse bump. The drawer header is an
`AppBar` too, which is why the menu-bar selectors exclude `.MuiPaper-root`.
`isolation: isolate` on the browser pane keeps JBrowse's z-indexes (1200+)
from painting over the guide.

JBrowse's `LinearGenomeView` has no touch handling (mouse drag and wheel only),
so `src/touchNavigation.ts` adds swipe-to-pan (with fling) and pinch-to-zoom
from outside, via delegated listeners on `.jb-host`. It maps a touch to its
view through the `view-container-<id>` test id and drives the view's own
`horizontalScroll`/`zoomTo`. A pinch only previews through `setScaleFactor`
(the CSS `scaleX` that ctrl+wheel zoom uses, which scales about the view's
centre) and commits one `zoomTo` on release, so tracks aren't re-rendered on
every frame. `touch-action: pan-y` on the tracks container keeps native
vertical scrolling and stops a pinch from zooming the page.

The tab bar's **Full screen** button (`src/fullScreen.ts`) hides the tab bar
and JBrowse's menu bar, calls each view's own `setHideHeader(true)` (restored
on exit), and requests browser full screen where supported (not iPhone
Safari). The view title bar stays on purpose: JBrowse pins its sticky ruler at
`VIEW_HEADER_HEIGHT` below it, so hiding it slides the ruler over the first
track.

The guide's launch buttons look up the plugins' own `configure()` menu items
via `session.menus()` and call their `onClick`, so they exercise the same code
path as the menu bar — don't reimplement plugin behavior there.

### Plugin anatomy

Each plugin is a directory under `src/plugins/<Name>/` exporting a default class
extending `@jbrowse/core/Plugin`, registered in the `plugins: [...]` array of
`createViewState` in `App.tsx`. A plugin is not loaded until it is added there.

Two lifecycle methods split the work:

- **`install(pluginManager)`** — register pluggable types (`addWidgetType`,
  `addViewType`, `addAdapterType`, …). A plugin with nothing to register still
  defines it with an `_pluginManager` parameter (see `FeatureCountPlugin`).
- **`configure(pluginManager)`** — runs after the root model exists. This is where
  menu items go, and it is how the user actually reaches a widget or view.
  Always guard with `isAbstractMenuManager(pluginManager.rootModel)` first.

The three examples map to the three extension points:

| Plugin | Extension point | Reached via |
|---|---|---|
| `HelloWorldPlugin` | `WidgetType` (right drawer panel) | Add → Open Hello World Widget |
| `CustomViewPlugin` | `ViewType` (main visualization panel) | Add → Open Sequence Stats View |
| `FeatureCountPlugin` | `configure()` only, no new types | Tools → Count Tracks in View |
| `StrandedBigWigPlugin` | `AdapterType` + `RendererType` + `DisplayType` | track config, then the track selector |

### Writing an AdapterType (`StrandedBigWigPlugin`)

An adapter plugs in below the renderers, so it registers no menu item — a track
reaches it through `adapter: { type: '...' }` in config. Two things about this
one generalise:

- **Wrap existing adapters instead of re-parsing formats.** `getSubAdapter`
  (available on the adapter instance) builds a configured child adapter, so
  reading a BigWig pair means delegating to two `BigWigAdapter`s and merging
  their observables. Cache the *promise*, not the result — `getFeatures` can be
  re-entered before the first build resolves.
- **Let the base class derive stats.** `BaseFeatureDataAdapter` computes
  quantitative stats by scanning `getFeatures`, so transformed scores autoscale
  correctly with no extra code. But it computes *feature density* the same way,
  and for a BigWig that trips the display's "Zoom in to see features" guard —
  quantitative adapters must override `getMultiRegionFeatureDensityStats()` to
  return `{ featureDensity: 0 }`, as `BigWigAdapter` and `MultiWiggleAdapter` do.

- **Transform every field the renderer reads, not just `score`.** Zoomed out,
  `BigWigAdapter` stops returning raw values and returns summary bins carrying
  `summary: true`, `minScore` and `maxScore`, which the renderer draws as
  whiskers. Negating `score` alone leaves the reverse strand's whiskers
  positive — and the bug is invisible at high zoom, where there is no summary
  and `score` is all the renderer has. Negating an interval also reverses it:
  `[min, max]` becomes `[-max, -min]`, so the two must be swapped or the
  whisker is drawn upside down. Any visual check of a quantitative adapter has
  to cover both a zoomed-in and a zoomed-out view for this reason.

### Why the stranded track also needs a renderer and a display

The plugin started as an adapter alone, relying on the stock `XYPlotRenderer`
splitting its palette at zero. That breaks where both strands have signal at
the same position, which real RNA-seq has all the time:

- `drawXY`'s whiskers pass caches the last color it computed and only refreshes
  the cache on summary bins. The two files' features arrive interleaved, and
  one file can return raw values while the other returns summaries, so the
  reverse strand's red leaks into forward-strand bars.
- The renderer keeps one feature per pixel column for mouseover, so the
  tooltip shows whichever strand came first — never both.
- The stock log scale is a d3 `scaleLog`, undefined for the reverse strand's
  negative values.

So `StrandedXYPlotRenderer` draws each strand as its own series (keyed on the
`strand` the adapter tags every feature with) and returns per-strand,
per-pixel tooltip features carrying the file's raw values.
`LinearStrandedWiggleDisplay` extends the stock display model and overrides
only the single-series spots: renderer name, tooltip, `graphType`/`canHaveFill`
(which test for stock renderer names), axis ticks, and the scale.

The log option is a signed `log2(x+1)` applied **in the adapter**, not the
renderer: the display adds `strandedScale` to `adapterProps()`, and both the
stats RPC and the render call pass those props to `getFeatures` as options, so
autoscale is computed from exactly the values drawn. The display reports
`scaleType` as linear to the stock machinery and labels the axis in raw units
itself (YScaleBar prints tick *values* as labels, so the values are label
strings and `position` maps them back).

`.claude/skills/run-app/scripts/verify-stranded.sh` covers all of this:
zoomed-in, zoomed-out, a region with both strands at once, the two-strand
tooltip, and the log scale. The pre-renderer code fails the zoomed-out and
both-strands checks.

### Importing from JBrowse packages

Only `@jbrowse/core` and `@jbrowse/react-app2` are resolvable from the project
root. The individual plugin packages that `react-app2` bundles — including
`@jbrowse/plugin-wiggle` — are nested under
`node_modules/@jbrowse/react-app2/node_modules/` and **cannot be imported**.
Reference their pluggable elements by name in config (`'QuantitativeTrack'`,
`'LinearWiggleDisplay'`, `'BigWigAdapter'`) rather than importing them. Their
source is still worth reading as reference; `MultiWiggleAdapter` is the closest
model for a multi-file adapter.

To *extend* one of their types, go through the running plugin instead:
`pluginManager.getPlugin('WigglePlugin').exports` hands out
`linearWiggleDisplayModelFactory`, `xyPlotRendererConfigSchema` and `utils`,
and `pluginManager.getDisplayType('LinearWiggleDisplay')` /
`getRendererType(...)` give registered types (inside an `add*Type` callback;
renderers are created before displays). This is how `StrandedBigWigPlugin`
builds on the stock wiggle display. A model composed with a JBrowse model must
use `types` from `@jbrowse/mobx-state-tree` (the copy JBrowse itself uses,
resolvable as a transitive dependency like `@mui/icons-material`), not this
repo's `mobx-state-tree`.

### The MST double-cast (important, appears in every state model)

The repo's `mobx-state-tree` and the copy bundled inside `@jbrowse/core` are
different type instantiations, so MST models cannot be passed to JBrowse types
directly. Every state model uses the same two-step escape hatch:

```typescript
// stateModel.ts — export the real type for components, default-export the erased one
export type MyModel = typeof MyModelDefinition
export default MyModelDefinition as unknown as IAnyModelType

// index.ts — cast again at the registration site
// eslint-disable-next-line @typescript-eslint/no-explicit-any
stateModel: MyModelDefinition as any,
```

Consequence for React components: a component can still be typed properly by
importing the `typeof` alias (`{ model }: { model: Instance<HelloWorldWidgetModel> }`
in `HelloWorldWidget.tsx`), but where the cast has erased everything the component
falls back to `model: any` with an eslint-disable comment
(`SequenceStatsView.tsx`). Both patterns are intentional — match the neighbouring file.

### State model contracts

- Every model needs `id: types.identifier` and `type: types.literal('<TypeName>')`,
  and the literal must match the registered type name.
- A **ViewType** model must additionally implement a `setWidth(newWidth)` action
  (JBrowse calls it on resize; a no-op body is fine) and a `menuItems()` view
  returning `MenuItem[]`.
- Derived data goes in MST `views()` (e.g. the `stats` getter), mutations in
  `actions()`. Components are wrapped in `observer()` from `mobx-react`.

### Menu items

`icon` takes a React component from `@mui/icons-material` (`icon: AnalyticsIcon`),
never a string. Note that **`@mui/icons-material` is not a direct dependency** — it
resolves transitively through `@jbrowse/*`. It works, but be aware if imports start
failing after a dependency bump.

Use `{ type: 'divider' }` for separators. The demo plugins use `alert()` for output
purely for brevity; real plugins should use `session.notify()` or a WidgetType panel
(the source comments say so too).

## Vite configuration gotchas

`vite.config.ts` carries three non-obvious workarounds — all are load-bearing:

- `vite-plugin-node-polyfills` for `buffer`/`stream`/`util`/`path` plus the `Buffer`
  global, because JBrowse2 uses Node built-ins in the browser.
- `resolve.alias` maps `stream/web` to an inline empty module. `xz-decompress` (a
  transitive JBrowse dep) marks it `false` for browsers, but Vite resolves the
  polyfilled `stream` first and then fails on the missing `web` sub-export.
- `base: '/Jbrowse2-plugin-lab/'` must exactly match the repo name, or the GitHub
  Pages build produces broken asset URLs.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs
`npm ci --legacy-peer-deps && npm run build` on Node 20 and publishes `dist/` to
GitHub Pages. A build failure is a deploy failure, so `npm run build` should pass
before merging to `main`.

## Code style

- TypeScript strict, with `noUnusedLocals` and `noUnusedParameters` — prefix
  intentionally-unused parameters with `_` (ESLint is configured to match on
  args, vars, and caught errors).
- Reach for `any` only via the MST cast pattern above, always with the
  `@typescript-eslint/no-explicit-any` disable comment on the line.
- Components are function components with hooks; styling is inline `style` objects
  in the plugin components (no CSS modules), while the outer demo page uses `App.css`.

## Known stale bits

- `README.md` predates the current setup: it claims `@jbrowse/react-linear-genome-view`
  and JBrowse v3.1.0. The code actually uses `@jbrowse/react-app2` at v4.1.14
  (see `package.json`). Trust `package.json` over the README.
- `.github/copilot-instructions.md` covers the same conventions and is broadly
  accurate, but its `base` example has the wrong capitalisation.
- `hdf5-indexed-reader` (dependency) and `src/types/hdf5-indexed-reader.d.ts` are
  leftovers from a `CoolerAdapterPlugin` that was removed in commit `3cd54b2`.
  Nothing in `src/` imports them.
