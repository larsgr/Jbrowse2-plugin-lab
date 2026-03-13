import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import { AdapterType } from '@jbrowse/core/pluggableElementTypes'
import CoolerAdapterConfigSchema from './configSchema'

export default class CoolerAdapterPlugin extends Plugin {
  name = 'CoolerAdapterPlugin'

  install(pluginManager: PluginManager) {
    pluginManager.addAdapterType(
      () =>
        new AdapterType({
          name: 'CoolerAdapter',
          displayName: 'Cooler adapter',
          configSchema: CoolerAdapterConfigSchema,
          getAdapterClass: () => import('./CoolerAdapter').then(r => r.default),
        }),
    )
  }
}
