import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import WidgetType from '@jbrowse/core/pluggableElementTypes/WidgetType'
import { ConfigurationSchema } from '@jbrowse/core/configuration'
import { isAbstractMenuManager } from '@jbrowse/core/util/types'
import WavingHandIcon from '@mui/icons-material/WavingHand'
import HelloWorldWidgetModel from './stateModel'
import HelloWorldWidget from './HelloWorldWidget'

/**
 * HelloWorldPlugin demonstrates the WidgetType extension point.
 *
 * Widgets are panels that appear in the right-hand drawer of JBrowse2.
 * They can display feature information, custom analysis results, or any
 * React-based UI. This plugin:
 *   1. Registers a new WidgetType called "HelloWorldWidget"
 *   2. Adds an "Open Hello World Widget" menu item under the "Add" menu
 */
export default class HelloWorldPlugin extends Plugin {
  name = 'HelloWorldPlugin'

  install(pluginManager: PluginManager) {
    pluginManager.addWidgetType(() => {
      return new WidgetType({
        name: 'HelloWorldWidget',
        heading: 'Hello World',
        configSchema: ConfigurationSchema('HelloWorldWidget', {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        stateModel: HelloWorldWidgetModel as any,
        ReactComponent: HelloWorldWidget,
      })
    })
  }

  configure(pluginManager: PluginManager) {
    if (isAbstractMenuManager(pluginManager.rootModel)) {
      pluginManager.rootModel.appendToMenu('Add', {
        label: 'Open Hello World Widget',
        icon: WavingHandIcon,
        onClick: (session: { showWidget: (widget: unknown) => void; addWidget: (type: string, id: string) => unknown }) => {
          const widget = session.addWidget(
            'HelloWorldWidget',
            `helloWorldWidget-${Date.now()}`,
          )
          session.showWidget(widget)
        },
      })
    }
  }
}
