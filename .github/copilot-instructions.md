# Copilot Instructions

## Project Overview

This is a JBrowse2 Plugin Lab — a demo project for experimenting with [JBrowse2](https://jbrowse.org/jb2/) plugins. It showcases three JBrowse2 plugin extension points in a React application deployed to GitHub Pages.

## Technology Stack

- **JBrowse2** (`@jbrowse/core`, `@jbrowse/react-app2`) — Genome browser framework
- **React 19** — UI library
- **MobX-State-Tree (MST) v5** — Reactive state management (pinned to `^5.4.2` for `@jbrowse/*` compatibility)
- **TypeScript** — Type safety throughout
- **Vite v7** — Build tool with custom polyfills for Node.js built-ins

## Development Commands

```bash
# Install dependencies (--legacy-peer-deps required for @jbrowse peer dep constraints)
npm install --legacy-peer-deps

# Start development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint

# Preview production build
npm run preview
```

## Project Structure

```
src/
  plugins/
    HelloWorldPlugin/     # WidgetType example — drawer panel widget
    FeatureCountPlugin/   # configure() hook example — custom menu items
    CustomViewPlugin/     # ViewType example — custom visualization panel
  App.tsx                 # Wires all plugins into the JBrowse2 app
  main.tsx                # Entry point
.github/
  workflows/
    deploy.yml            # GitHub Actions → GitHub Pages deployment
```

## Plugin Conventions

### Plugin structure
Each plugin lives in `src/plugins/<PluginName>/` and exports a class extending `@jbrowse/core`'s `Plugin`. The main file is `index.ts`.

### MST `as any` cast
MST state models passed to JBrowse2 types (`WidgetType`, `ViewType`) must be cast `as any` to bridge the MST version gap between the plugin and JBrowse2 internals:
```typescript
stateModel: MyStateModel as any,
```

### Menu guards
Always check `isAbstractMenuManager` before calling menu methods in `configure()`:
```typescript
import { isAbstractMenuManager } from '@jbrowse/core/util/types'

configure(pluginManager: PluginManager) {
  if (isAbstractMenuManager(pluginManager.rootModel)) {
    pluginManager.rootModel.appendToMenu('Add', { ... })
  }
}
```

### Icon imports
Menu item icons come from `@mui/icons-material` and are React `ComponentType<SvgIconProps>` — pass the component itself, not a string.

## Vite Configuration Notes

- **`vite-plugin-node-polyfills`**: Polyfills `buffer`, `stream`, `util`, `path` for JBrowse2's Node.js built-in usage in the browser.
- **`stream/web` alias**: Mapped to an empty module (`data:text/javascript,export default {}`) to prevent xz-decompress from failing on the `stream/web` sub-export.
- **`optimizeDeps.exclude: ['@jbrowse/core']`**: Prevents Vite from pre-bundling JBrowse2 core.
- **`base: '/JBrowse2-plugin-lab/'`**: Required for GitHub Pages deployment under the repo sub-path. Note: the actual base must match the repository name exactly (e.g., `'/Jbrowse2-plugin-lab/'` for this repo).

## GitHub Pages Deployment

Pushes to `main` automatically trigger the `deploy.yml` workflow which builds with `npm run build` and deploys `dist/` to GitHub Pages.
