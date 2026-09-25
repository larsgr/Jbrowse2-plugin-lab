import { ConfigurationSchema } from '@jbrowse/core/configuration'
import DisplayType from '@jbrowse/core/pluggableElementTypes/DisplayType'
import type PluginManager from '@jbrowse/core/PluginManager'
import stateModelFactory from './model'

/**
 * Registers LinearStrandedWiggleDisplay, a display for QuantitativeTracks
 * whose adapter is a StrandedBigWigAdapter.
 *
 * Its config is LinearWiggleDisplay's plus one renderer slot. Renderers are
 * created before displays, and core plugins install before this one, so both
 * base types already exist when this callback runs.
 */
export default function registerLinearStrandedWiggleDisplay(
  pluginManager: PluginManager,
) {
  pluginManager.addDisplayType(() => {
    const wiggleDisplay = pluginManager.getDisplayType('LinearWiggleDisplay')
    const renderer = pluginManager.getRendererType('StrandedXYPlotRenderer')
    if (!wiggleDisplay || !renderer) {
      throw new Error('StrandedBigWigPlugin needs the core WigglePlugin')
    }
    const configSchema = ConfigurationSchema(
      'LinearStrandedWiggleDisplay',
      {
        renderers: ConfigurationSchema('RenderersConfiguration', {
          StrandedXYPlotRenderer: renderer.configSchema,
        }),
      },
      { baseConfiguration: wiggleDisplay.configSchema, explicitlyTyped: true },
    )
    return new DisplayType({
      name: 'LinearStrandedWiggleDisplay',
      displayName: 'Stranded wiggle display',
      configSchema,
      stateModel: stateModelFactory(pluginManager, configSchema),
      trackType: 'QuantitativeTrack',
      viewType: 'LinearGenomeView',
      // The stock component: canvas blocks plus the y-axis, which reads the
      // model's `ticks` - overridden to label the axis in raw units.
      ReactComponent: wiggleDisplay.ReactComponent,
    })
  })
}
