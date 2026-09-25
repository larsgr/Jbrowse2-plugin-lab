import Plugin from '@jbrowse/core/Plugin'
import AdapterType from '@jbrowse/core/pluggableElementTypes/AdapterType'
import type PluginManager from '@jbrowse/core/PluginManager'
import configSchema from './configSchema'
import registerStrandedXYPlotRenderer from './StrandedXYPlotRenderer'
import registerLinearStrandedWiggleDisplay from './LinearStrandedWiggleDisplay'

/**
 * StrandedBigWigPlugin: stranded coverage from a forward/reverse BigWig pair.
 *
 * It spans three extension points, because a stranded plot needs changes at
 * every layer:
 *
 *   - AdapterType `StrandedBigWigAdapter` reads both files, flips the reverse
 *     strand below the axis, applies the optional log transform, and tags
 *     every feature with its strand.
 *   - RendererType `StrandedXYPlotRenderer` draws the two strands as separate
 *     series, so one strand's colors and whiskers can't bleed into the other
 *     where both have signal.
 *   - DisplayType `LinearStrandedWiggleDisplay` extends the stock wiggle
 *     display with a two-strand tooltip, a signed log2(x+1) scale, and an
 *     axis labelled in raw units.
 *
 * An adapter alone is not enough: the stock renderer and tooltip assume one
 * series, and the stock log scale cannot go below zero.
 *
 * Usage in a track config:
 *
 *   {
 *     type: 'QuantitativeTrack',
 *     trackId: 'my_stranded_coverage',
 *     assemblyNames: ['volvox'],
 *     adapter: {
 *       type: 'StrandedBigWigAdapter',
 *       forwardBigWigLocation: { uri: '...forward.bw', locationType: 'UriLocation' },
 *       reverseBigWigLocation: { uri: '...reverse.bw', locationType: 'UriLocation' },
 *     },
 *     displays: [{
 *       type: 'LinearStrandedWiggleDisplay',
 *       displayId: 'my_stranded_coverage-LinearStrandedWiggleDisplay',
 *       // optional: open on the log scale, and re-theme the strands
 *       scaleType: 'log',
 *       renderers: {
 *         StrandedXYPlotRenderer: { posColor: '#1a7abf', negColor: '#d1495b' },
 *       },
 *     }],
 *   }
 */
export default class StrandedBigWigPlugin extends Plugin {
  name = 'StrandedBigWigPlugin'

  install(pluginManager: PluginManager) {
    pluginManager.addAdapterType(
      () =>
        new AdapterType({
          name: 'StrandedBigWigAdapter',
          displayName: 'Stranded BigWig pair (forward/reverse)',
          configSchema,
          // Loaded on demand so the BigWig parsing code stays out of the
          // initial bundle for sessions that never open one of these tracks.
          getAdapterClass: () =>
            import('./StrandedBigWigAdapter').then(m => m.default),
        }),
    )
    registerStrandedXYPlotRenderer(pluginManager)
    registerLinearStrandedWiggleDisplay(pluginManager)
  }

  configure(_pluginManager: PluginManager) {
    // Nothing to configure: adapters are reached through track configuration
    // rather than menus.
  }
}
