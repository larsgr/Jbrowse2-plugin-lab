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
| `StrandedBigWigPlugin` | `AdapterType` (no UI at all) | track config, then the track selector |

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

The strand flip and its two colors are not custom code: negating the reverse
strand's scores puts them below the axis, and the built-in wiggle renderer
already splits its palette at zero (`posColor`/`negColor`, chosen only while
`color` is left at its `#f0f` sentinel). Prefer moving data into the shape
JBrowse already renders over writing a renderer.

### Importing from JBrowse packages

Only `@jbrowse/core` and `@jbrowse/react-app2` are resolvable from the project
root. The individual plugin packages that `react-app2` bundles — including
`@jbrowse/plugin-wiggle` — are nested under
`node_modules/@jbrowse/react-app2/node_modules/` and **cannot be imported**.
Reference their pluggable elements by name in config (`'QuantitativeTrack'`,
`'LinearWiggleDisplay'`, `'BigWigAdapter'`) rather than importing them. Their
source is still worth reading as reference; `MultiWiggleAdapter` is the closest
model for a multi-file adapter.

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
