import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import registerChromatinStates from './chromatinStates'
import registerConditionWiggle from './conditionWiggle'

/**
 * ConditionPileupPlugin: tracks that combine many conditions (tissues,
 * developmental stages, ...) into one "pile-up" that expands into a row per
 * condition.
 *
 * Two track kinds share that layout (see shared/):
 *
 *   Chromatin states - one BigBed segmentation per condition (ChromHMM).
 *     FeatureTrack + MultiBigBedAdapter + LinearChromatinStateDisplay
 *     (ChromatinStateRenderer). Collapsed: a stacked histogram of how many
 *     conditions are in each state at each position. Expanded: each
 *     condition's segmentation as a colored row.
 *
 *   Signal - one BigWig (ChIP-seq) or forward/reverse BigWig pair (RNA-seq)
 *     per condition. QuantitativeTrack + MultiConditionBigWigAdapter +
 *     LinearConditionWiggleDisplay (ConditionWiggleRenderer). Collapsed: the
 *     conditions stacked as areas, + strand up and - strand down. Expanded:
 *     each condition as its own row on a shared, optionally log, scale.
 *
 * Both adapters wrap the stock BigBedAdapter/BigWigAdapter via
 * getSubAdapter, and both renderers resample to one value per condition per
 * pixel column - the only way to stack files whose intervals do not line up,
 * and what makes hover tooltips free (the raster comes back with the image).
 *
 * Expand/collapse: the button on the track, or the track menu. Dragging the
 * track's bottom edge resizes the rows (expanded) or the pile-up (collapsed).
 *
 * Usage, chromatin states:
 *
 *   {
 *     type: 'FeatureTrack',
 *     trackId: 'chromhmm',
 *     assemblyNames: ['Ssal_v3.1'],
 *     adapter: {
 *       type: 'MultiBigBedAdapter',
 *       conditions: [
 *         { name: 'Brain Imm F', group: 'Brain',
 *           bigBedLocation: { uri: '.../Brain_Immature_Female.bb', locationType: 'UriLocation' } },
 *         ...
 *       ],
 *     },
 *     displays: [{
 *       type: 'LinearChromatinStateDisplay',
 *       displayId: 'chromhmm-LinearChromatinStateDisplay',
 *       // optional: palette, legend order and stacking order
 *       states: [{ name: 'Active TSS', color: '#b2182b' }, ...],
 *     }],
 *   }
 *
 * Usage, stranded RNA-seq (ChIP-seq: `bigWigLocation` instead of the pair):
 *
 *   {
 *     type: 'QuantitativeTrack',
 *     trackId: 'rnaseq',
 *     assemblyNames: ['Ssal_v3.1'],
 *     adapter: {
 *       type: 'MultiConditionBigWigAdapter',
 *       conditions: [
 *         { name: 'Brain Imm F', group: 'Brain',
 *           forwardBigWigLocation: { uri: '...forward.bw', locationType: 'UriLocation' },
 *           reverseBigWigLocation: { uri: '...reverse.bw', locationType: 'UriLocation' } },
 *         ...
 *       ],
 *     },
 *     displays: [{
 *       type: 'LinearConditionWiggleDisplay',
 *       displayId: 'rnaseq-LinearConditionWiggleDisplay',
 *       scaleType: 'log', // the rows; the pile-up is always linear
 *     }],
 *   }
 */
export default class ConditionPileupPlugin extends Plugin {
  name = 'ConditionPileupPlugin'

  install(pluginManager: PluginManager) {
    registerChromatinStates(pluginManager)
    registerConditionWiggle(pluginManager)
  }

  configure(_pluginManager: PluginManager) {
    // Nothing to configure: these tracks are reached through track
    // configuration and the track selector rather than menus.
  }
}
