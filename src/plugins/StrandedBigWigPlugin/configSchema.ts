import { ConfigurationSchema } from '@jbrowse/core/configuration'

/**
 * Config for a pair of BigWig files holding forward- and reverse-strand
 * coverage for the same sample.
 *
 * The colors are deliberately NOT configured here. Coloring belongs to the
 * renderer, and the built-in wiggle renderer already splits its palette at
 * zero: `posColor` for scores above the axis, `negColor` for scores below it.
 * Because this adapter negates the reverse strand, that split lands exactly on
 * the strand boundary, so forward/reverse get different colors out of the box
 * and can be re-themed with the standard `posColor`/`negColor` keys on the
 * track's renderer. Duplicating them here would give two competing sources of
 * truth for the same pixel.
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
