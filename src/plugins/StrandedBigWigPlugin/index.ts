import Plugin from '@jbrowse/core/Plugin'
import AdapterType from '@jbrowse/core/pluggableElementTypes/AdapterType'
import type PluginManager from '@jbrowse/core/PluginManager'
import configSchema from './configSchema'

/**
 * StrandedBigWigPlugin demonstrates the AdapterType extension point.
 *
 * An adapter turns a file format into features JBrowse can render. Unlike the
 * other plugins in this lab it registers no UI at all: it plugs in below the
 * renderers, so a track using it is configured like any other
 * QuantitativeTrack and picks up the whole built-in wiggle stack.
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
 *   }
 *
 * To re-theme the strands, set posColor/negColor on the track's renderer:
 *
 *   displays: [{
 *     type: 'LinearWiggleDisplay',
 *     displayId: 'my_stranded_coverage-display',
 *     renderers: { XYPlotRenderer: { posColor: '#1a7abf', negColor: '#d1495b' } },
 *   }]
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
  }

  configure(_pluginManager: PluginManager) {
    // Nothing to configure: adapters are reached through track configuration
    // rather than menus.
  }
}
