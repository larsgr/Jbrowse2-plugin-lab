import { ConfigurationSchema } from '@jbrowse/core/configuration'

/**
 * Config for a pair of BigWig files holding forward- and reverse-strand
 * coverage for the same sample.
 *
 * The colors are deliberately NOT configured here. Coloring belongs to the
 * renderer: StrandedXYPlotRenderer draws the forward strand in `posColor` and
 * the reverse strand in `negColor`, re-themed with those standard keys on the
 * track's renderer. Duplicating them here would give two competing sources of
 * truth for the same pixel. The same goes for the log transform, which is a
 * display setting (track menu → Score → Scale type) rather than adapter config.
 */
const configSchema = ConfigurationSchema(
  'StrandedBigWigAdapter',
  {
    forwardBigWigLocation: {
      type: 'fileLocation',
      description: 'BigWig of coverage on the forward (+) strand',
      defaultValue: {
        uri: '/path/to/forward.bw',
        locationType: 'UriLocation',
      },
    },
    reverseBigWigLocation: {
      type: 'fileLocation',
      description: 'BigWig of coverage on the reverse (-) strand',
      defaultValue: {
        uri: '/path/to/reverse.bw',
        locationType: 'UriLocation',
      },
    },
    negateReverse: {
      type: 'boolean',
      description:
        'Negate reverse-strand scores so they draw below the axis. Turn off to overlay both strands above the axis.',
      defaultValue: true,
    },
  },
  { explicitlyTyped: true },
)

export default configSchema
