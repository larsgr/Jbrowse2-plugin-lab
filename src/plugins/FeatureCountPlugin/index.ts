import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import { isAbstractMenuManager } from '@jbrowse/core/util/types'
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered'
import InfoIcon from '@mui/icons-material/Info'

/**
 * FeatureCountPlugin demonstrates the configure() hook for adding custom menu items.
 *
 * The configure() method runs after the root model is created, making it the
 * right place to add menu items, customize existing UI elements, or register
 * callbacks. This plugin adds a custom "Tools" submenu with a feature-counting
 * action that shows information about the current session.
 */
export default class FeatureCountPlugin extends Plugin {
  name = 'FeatureCountPlugin'

  install(_pluginManager: PluginManager) {
    // No new types to install for this plugin - it only customizes existing UI
  }

  configure(pluginManager: PluginManager) {
    if (isAbstractMenuManager(pluginManager.rootModel)) {
      // Add a top-level "Tools" menu if it doesn't exist
      pluginManager.rootModel.appendMenu('Tools')

      // Add an item to count tracks in the current view
      pluginManager.rootModel.appendToMenu('Tools', {
        label: 'Count Tracks in View',
        icon: FormatListNumberedIcon,
        onClick: (session: {
          views: Array<{
            tracks?: Array<unknown>
            displayedRegions?: Array<{ refName: string; start: number; end: number }>
          }>
        }) => {
          const view = session.views[0]
          if (!view) {
            alert('No active view found.')
            return
          }
          const trackCount = view.tracks?.length ?? 0
          const regions = view.displayedRegions ?? []
          const regionSummary =
            regions.length > 0
              ? regions
                  .map(r => `${r.refName}:${r.start}..${r.end}`)
                  .join(', ')
              : 'none'
          alert(
            `FeatureCountPlugin Report\n\n` +
              `Active tracks: ${trackCount}\n` +
              `Displayed regions: ${regionSummary}`,
          )
        },
      })

      // Separator
      pluginManager.rootModel.appendToMenu('Tools', { type: 'divider' })

      // Add an informational item about this demo
      pluginManager.rootModel.appendToMenu('Tools', {
        label: 'About Plugin Lab',
        icon: InfoIcon,
        onClick: () => {
          alert(
            'JBrowse2 Plugin Lab\n\n' +
              'This demo showcases different JBrowse2 plugin types:\n\n' +
              '• HelloWorldPlugin — WidgetType\n' +
              '  Adds a custom drawer panel widget\n\n' +
              '• FeatureCountPlugin — configure() hook\n' +
              '  Adds custom menu items (this menu!)\n\n' +
              '• CustomViewPlugin — ViewType\n' +
              '  Adds a custom visualization view\n\n' +
              'See: Add menu → Open Hello World Widget\n' +
              'See: Add menu → Open Sequence Stats View',
          )
        },
      })
    }
  }
}
