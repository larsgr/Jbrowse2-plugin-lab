# CLAUDE.md - JBrowse2 Plugin Lab

## Project Overview
A JBrowse2 plugin development lab using `@jbrowse/react-app2` (v4.1.14) as an embedded React component. Deployed to GitHub Pages at https://larsgr.github.io/Jbrowse2-plugin-lab/.

## Tech Stack
- **Language:** TypeScript (strict mode, ES2022 target)
- **UI:** React 19 + MobX-State-Tree for state management
- **Build:** Vite 7 with React plugin and Node.js polyfills
- **Linting:** ESLint 9 flat config + TypeScript ESLint
- **JBrowse2:** v4.1.14 (`@jbrowse/core`, `@jbrowse/react-app2`)
- **Deployment:** GitHub Pages via GitHub Actions

## Commands
```bash
npm install --legacy-peer-deps   # --legacy-peer-deps is required
npm run dev                       # Vite dev server with HMR
npm run build                     # tsc -b && vite build
npm run lint                      # ESLint
npm run preview                   # Preview production build
```

## Project Structure
```
src/
  App.tsx              # Main app - creates viewState with all plugins
  main.tsx             # React entry point
  plugins/
    HelloWorldPlugin/  # WidgetType example (drawer panel widget)
    FeatureCountPlugin/# configure() hook example (menu items only)
    CustomViewPlugin/  # ViewType example (Sequence Stats View)
    CoolerAdapterPlugin/ # AdapterType for .mcool Hi-C data via HDF5
```

## Plugin Conventions
- Each plugin lives in `src/plugins/<PluginName>/` with:
  - `index.ts` — Plugin class extending `@jbrowse/core/Plugin`
  - `stateModel.ts` — MobX-State-Tree model (if applicable)
  - `<Component>.tsx` — React component (if applicable)
  - `configSchema.ts` — Configuration schema (for adapters)
- Plugins are registered in `src/App.tsx` via `createViewState({ plugins: [...] })`
- Plugin methods: `install()` registers types, `configure()` customizes menus
- Use `isAbstractMenuManager()` type guard for menu operations
- Menu icons from `@mui/icons-material`

## State Management
- MobX-State-Tree models with `id` and `type` fields
- Components wrapped with `observer()` from `mobx-react`
- Computed properties via MST `views()`, mutations via `actions()`

## Code Style
- Unused parameters prefixed with `_`
- Functional React components with hooks
- No automated tests currently
