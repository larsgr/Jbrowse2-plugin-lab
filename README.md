# JBrowse2 Plugin Lab

A demo project for experimenting with [JBrowse2](https://jbrowse.org/jb2/) plugins. This repo includes a live demo hosted on GitHub Pages showcasing different JBrowse2 plugin extension points.

🔗 **Live Demo:** [https://larsgr.github.io/Jbrowse2-plugin-lab/](https://larsgr.github.io/Jbrowse2-plugin-lab/)

## Overview

This project demonstrates how to build custom plugins for JBrowse2 using the embedded [`@jbrowse/react-linear-genome-view`](https://www.npmjs.com/package/@jbrowse/react-linear-genome-view) React component. Three plugin types are covered:

| Plugin | Extension Point | What It Demonstrates |
|--------|----------------|---------------------|
| `HelloWorldPlugin` | `WidgetType` | Adds a custom drawer panel widget |
| `FeatureCountPlugin` | `configure()` hook | Adds custom menu items ("Tools" menu) |
| `CustomViewPlugin` | `ViewType` | Adds a custom visualization panel |

## Project Structure

```
src/
  plugins/
    HelloWorldPlugin/
      index.ts              # Plugin class — registers WidgetType
      stateModel.ts         # MobX-State-Tree model for the widget
      HelloWorldWidget.tsx  # React component for the widget UI
    FeatureCountPlugin/
      index.ts              # Plugin class — uses configure() to add menu items
    CustomViewPlugin/
      index.ts              # Plugin class — registers ViewType
      stateModel.ts         # MobX-State-Tree model for the view
      SequenceStatsView.tsx # React component for the view UI
  App.tsx                   # Demo app that wires all plugins together
  main.tsx                  # Entry point
.github/
  workflows/
    deploy.yml              # GitHub Actions workflow for GitHub Pages
```

## Plugin Types Demonstrated

### 1. WidgetType — `HelloWorldPlugin`

A **Widget** is a panel that appears in the right-hand drawer of JBrowse2. Widgets are used for feature detail panels, analysis tools, and custom UI.

**How to create a WidgetType:**

```typescript
import Plugin from '@jbrowse/core/Plugin'
import WidgetType from '@jbrowse/core/pluggableElementTypes/WidgetType'
import { ConfigurationSchema } from '@jbrowse/core/configuration'

export default class MyPlugin extends Plugin {
  name = 'MyPlugin'

  install(pluginManager) {
    pluginManager.addWidgetType(() => new WidgetType({
      name: 'MyWidget',
      heading: 'My Custom Widget',
      configSchema: ConfigurationSchema('MyWidget', {}),
      stateModel: myStateModel,          // MobX-State-Tree model
      ReactComponent: MyWidgetComponent, // React component
    }))
  }
}
```

**Key concepts:**
- The `stateModel` is a MobX-State-Tree (MST) model. It must include `id` and `type` fields.
- The `ReactComponent` receives the model as a `model` prop and is wrapped with `observer()` from `mobx-react` for reactivity.
- Open the widget from a `configure()` hook via `session.addWidget()` / `session.showWidget()`.

### 2. configure() Hook — `FeatureCountPlugin`

The **`configure()` method** runs after the root model is created. Use it to add menu items, register callbacks, or extend existing functionality without registering new types.

**How to add a custom menu:**

```typescript
import Plugin from '@jbrowse/core/Plugin'
import { isAbstractMenuManager } from '@jbrowse/core/util/types'
import MyIcon from '@mui/icons-material/MyIcon'

export default class MyPlugin extends Plugin {
  name = 'MyPlugin'

  configure(pluginManager) {
    if (isAbstractMenuManager(pluginManager.rootModel)) {
      pluginManager.rootModel.appendMenu('Tools')
      pluginManager.rootModel.appendToMenu('Tools', {
        label: 'My Action',
        icon: MyIcon,        // React ComponentType<SvgIconProps>
        onClick: (session) => {
          // Access the JBrowse session here
        },
      })
    }
  }
}
```

**Key concepts:**
- Always check `isAbstractMenuManager(pluginManager.rootModel)` before calling menu methods.
- The `icon` field takes a React component (from `@mui/icons-material`), not a string.
- The `configure()` hook runs once after plugin installation.

### 3. ViewType — `CustomViewPlugin`

A **View** is the main visualization panel in JBrowse2. The LinearGenomeView, CircularView, and DotplotView are all ViewTypes. Custom views can visualize any data in any way.

**How to create a ViewType:**

```typescript
import Plugin from '@jbrowse/core/Plugin'
import ViewType from '@jbrowse/core/pluggableElementTypes/ViewType'

export default class MyPlugin extends Plugin {
  name = 'MyPlugin'

  install(pluginManager) {
    pluginManager.addViewType(() => new ViewType({
      name: 'MyView',
      displayName: 'My View',
      stateModel: myStateModel,    // MST model with id, type, setWidth()
      ReactComponent: MyView,      // React component
    }))
  }

  configure(pluginManager) {
    if (isAbstractMenuManager(pluginManager.rootModel)) {
      pluginManager.rootModel.appendToMenu('Add', {
        label: 'Open My View',
        onClick: (session) => session.addView('MyView', {}),
      })
    }
  }
}
```

**Key concepts:**
- The view's `stateModel` must implement a `setWidth(newWidth)` action.
- The view's `stateModel` should implement a `menuItems()` view returning `MenuItem[]`.
- Add the view to the session via `session.addView('ViewTypeName', initialState)`.

## Getting Started

```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

The `--legacy-peer-deps` flag is needed because `@jbrowse/react-linear-genome-view` has peer dependency constraints that don't fully match the latest React version.

## GitHub Pages Deployment

The site is automatically deployed to GitHub Pages via GitHub Actions on every push to `main`. The workflow is defined in `.github/workflows/deploy.yml`.

To enable GitHub Pages in your own fork:
1. Go to **Settings → Pages**
2. Set **Source** to "GitHub Actions"

The Vite `base` config (`/Jbrowse2-plugin-lab/`) must match your repository name.

## Technology Stack

- [JBrowse2](https://jbrowse.org/jb2/) v3.1.0 — Genome browser framework
- [React](https://react.dev/) v19 — UI library
- [MobX-State-Tree](https://mobx-state-tree.js.org/) v7 — Reactive state management
- [Vite](https://vitejs.dev/) v7 — Build tool
- [TypeScript](https://www.typescriptlang.org/) — Type safety

## Further Reading

- [JBrowse2 Developer Guide](https://jbrowse.org/jb2/docs/developer_guide/)
- [Embedded Components Documentation](https://jbrowse.org/jb2/docs/embedded_components/)
- [JBrowse Plugin Template](https://github.com/GMOD/jbrowse-plugin-template) — Starting point for standalone plugins
- [JBrowse2 Storybook](https://jbrowse.org/storybook/lgv/main) — Live examples of the React component
