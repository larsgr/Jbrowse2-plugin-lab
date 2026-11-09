import type { ComponentType } from 'react'
import type { AnyConfigurationSchemaType } from '@jbrowse/core/configuration'
import type PluginManager from '@jbrowse/core/PluginManager'
import type { IAnyModelType } from '@jbrowse/mobx-state-tree'

/**
 * Building blocks from the running LinearGenomeViewPlugin.
 *
 * @jbrowse/plugin-linear-genome-view is bundled inside @jbrowse/react-app2 and
 * is not resolvable from this project, but the plugin instance hands out its
 * base display model, config schema and component to other plugins through
 * `exports` - the same route StrandedBigWigPlugin takes for the wiggle plugin.
 */
export function linearGenomeViewExports(pluginManager: PluginManager) {
  const lgv = pluginManager.getPlugin('LinearGenomeViewPlugin') as
    | { exports?: unknown }
    | undefined
  if (!lgv?.exports) {
    throw new Error('ConditionPileupPlugin needs the core LinearGenomeViewPlugin')
  }
  return lgv.exports as {
    BaseLinearDisplay: IAnyModelType
    baseLinearDisplayConfigSchema: AnyConfigurationSchemaType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    BaseLinearDisplayComponent: ComponentType<any>
  }
}

/** The wiggle plugin's exports, typed for what this plugin uses. */
export function wigglePluginExports(pluginManager: PluginManager) {
  const wiggle = pluginManager.getPlugin('WigglePlugin') as
    | { exports?: unknown }
    | undefined
  if (!wiggle?.exports) {
    throw new Error('ConditionPileupPlugin needs the core WigglePlugin')
  }
  return wiggle.exports as {
    xyPlotRendererConfigSchema: AnyConfigurationSchemaType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linearWiggleDisplayModelFactory: (pm: PluginManager, schema: any) => any
  }
}
