import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import ViewType from '@jbrowse/core/pluggableElementTypes/ViewType'
import { isAbstractMenuManager } from '@jbrowse/core/util/types'
import AnalyticsIcon from '@mui/icons-material/Analytics'
import SequenceStatsViewModelDefinition from './stateModel'
import SequenceStatsView from './SequenceStatsView'

/**
 * CustomViewPlugin demonstrates the ViewType extension point.
 *
 * Views are the main visualization panels in JBrowse2. The built-in
 * LinearGenomeView, CircularView, and DotplotView are all ViewTypes.
 * Custom views can display any data in any way you choose.
 *
 * This plugin:
 *   1. Registers a "SequenceStatsView" that analyzes DNA sequences
 *   2. Adds a menu item to open the view from the "Add" menu
 */
export default class CustomViewPlugin extends Plugin {
  name = 'CustomViewPlugin'

  install(pluginManager: PluginManager) {
    pluginManager.addViewType(() => {
      return new ViewType({
        name: 'SequenceStatsView',
        displayName: 'Sequence Stats',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stateModel: SequenceStatsViewModelDefinition as any,
        ReactComponent: SequenceStatsView,
      })
    })
  }

  configure(pluginManager: PluginManager) {
    if (isAbstractMenuManager(pluginManager.rootModel)) {
      pluginManager.rootModel.appendToMenu('Add', {
        label: 'Open Sequence Stats View',
        icon: AnalyticsIcon,
        onClick: (session: { addView: (type: string, initialState: Record<string, unknown>) => void }) => {
          session.addView('SequenceStatsView', {})
        },
      })
    }
  }
}
