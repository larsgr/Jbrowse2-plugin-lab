/**
 * Track configs for ConditionPileupPlugin, built from the Aqua-Faang Atlantic
 * salmon data on salmobase.org - the same data and layout as the lab's
 * prototype browser (chromatin states, stranded RNA-seq and ChIP-seq, each a
 * combined pile-up that expands into one row per condition).
 *
 * Every file names chromosomes the Ensembl way (`1`..`29`), matching
 * Ssal_v3.1's .fai, so no refName translation is needed.
 */

const AQUA_FAANG = 'https://salmobase.org/datafiles/datasets/Aqua-Faang'
const CHROMHMM = `${AQUA_FAANG}/chromatin_states/AtlanticSalmon`
const BODYMAP = `${AQUA_FAANG}/trackhub/AtlanticSalmon/BodyMap`

const ASSEMBLY = 'Ssal_v3.1'
const CATEGORY = ['Aqua-Faang condition pile-ups']

/** The prototype's tissue colors (Okabe-Ito), so the two read the same. */
const TISSUE_COLORS: Record<string, string> = {
  Brain: '#0072B2',
  Gonad: '#CC79A7',
  Liver: '#D55E00',
  Muscle: '#009E73',
  Gill: '#56B4E9',
  Embryo: '#E69F00',
}

const STAGES = [
  ['Immature', 'Imm'],
  ['Mature', 'Mat'],
] as const
const SEXES = [
  ['Female', 'F'],
  ['Male', 'M'],
] as const

function uri(url: string) {
  return { uri: url, locationType: 'UriLocation' as const }
}

/** Tissue x maturity x sex, in the prototype's row order. */
function bodyMapConditions<T>(
  tissues: string[],
  files: (sample: string) => T,
) {
  return tissues.flatMap(tissue =>
    STAGES.flatMap(([stage, stageShort]) =>
      SEXES.map(([sex, sexShort]) => ({
        name: `${tissue} ${stageShort} ${sexShort}`,
        group: tissue,
        color: TISSUE_COLORS[tissue],
        ...files(`${tissue}_${stage}_${sex}`),
      })),
    ),
  )
}

/**
 * ChromHMM state palette, legend order and pile-up stacking order (first at
 * the bottom), matching the prototype's colors. `match` folds the files'
 * numbered variants into one entry. Quiescent is the display's default
 * background state: neither drawn nor counted.
 */
const CHROMHMM_STATES = [
  { name: 'Active TSS', color: '#b2182b' },
  { name: 'Flanking upstream', color: '#f4a582' },
  { name: 'Flanking downstream', color: '#fbd3bd' },
  { name: 'Active enhancer', color: '#e66101' },
  { name: 'Primed enhancer', color: '#fee08b' },
  {
    name: 'Poised enhancer',
    color: '#92c5de',
    match: ['Poised enhancer 1', 'Poised enhancer 2'],
  },
  { name: 'Accessible chromatin', color: '#2166ac' },
  { name: 'Bivalent', color: '#762a83' },
  { name: 'Repressed polycomb', color: '#7f7f7f' },
  { name: 'ZNF genes and repeats', color: '#b8b8b8' },
  { name: 'Unknown', color: '#dcdcdc', match: ['Unknown 1', 'Unknown 2'] },
]

const DEV_STAGES = [
  ['LateBlastulation', 'L blastula'],
  ['MidGastrulation', 'M gastrula'],
  ['EarlySomitogenesis', 'E somit.'],
  ['MidSomitogenesis', 'M somit.'],
  ['LateSomitogenesis', 'L somit.'],
] as const

const chromatinStateTrack = {
  type: 'FeatureTrack',
  trackId: 'Ssal_v3.1-aquafaang-chromatin-states',
  name: 'Chromatin states (ChromHMM, 21 conditions)',
  assemblyNames: [ASSEMBLY],
  category: CATEGORY,
  adapter: {
    type: 'MultiBigBedAdapter',
    conditions: [
      ...bodyMapConditions(['Brain', 'Gonad', 'Liver', 'Muscle'], sample => ({
        bigBedLocation: uri(
          `${CHROMHMM}/BodyMap/AtlanticSalmon_${sample}.bb`,
        ),
      })),
      ...DEV_STAGES.map(([stage, name]) => ({
        name,
        group: 'Embryo',
        color: TISSUE_COLORS.Embryo,
        bigBedLocation: uri(`${CHROMHMM}/DevMap/AtlanticSalmon_${stage}.bb`),
      })),
    ],
  },
  displays: [
    {
      type: 'LinearChromatinStateDisplay',
      displayId: 'Ssal_v3.1-aquafaang-chromatin-states-LinearChromatinStateDisplay',
      states: CHROMHMM_STATES,
    },
  ],
}

const SIGNAL_TISSUES = ['Brain', 'Gonad', 'Liver', 'Muscle', 'Gill']

/**
 * Stranded RNA-seq, replicate 1 of each condition. The BigWigs hold raw
 * per-base coverage, hence the unit. Rows open on a log scale, as in the
 * prototype; the combined pile-up is always linear.
 */
const rnaSeqTrack = {
  type: 'QuantitativeTrack',
  trackId: 'Ssal_v3.1-aquafaang-rnaseq-conditions',
  name: 'RNA-seq (+/-, 20 conditions)',
  assemblyNames: [ASSEMBLY],
  category: CATEGORY,
  adapter: {
    type: 'MultiConditionBigWigAdapter',
    conditions: bodyMapConditions(SIGNAL_TISSUES, sample => ({
      forwardBigWigLocation: uri(
        `${BODYMAP}/RNA/bigWig/AtlanticSalmon_RNA_${sample}_R1.forward.bigWig`,
      ),
      reverseBigWigLocation: uri(
        `${BODYMAP}/RNA/bigWig/AtlanticSalmon_RNA_${sample}_R1.reverse.bigWig`,
      ),
    })),
  },
  displays: [
    {
      type: 'LinearConditionWiggleDisplay',
      displayId: 'Ssal_v3.1-aquafaang-rnaseq-conditions-LinearConditionWiggleDisplay',
      scaleType: 'log',
      unit: 'coverage',
    },
  ],
}

/** Unstranded ChIP-seq, replicate 1; nf-core scales these to 1M reads. */
function chipSeqTrack(mark: string) {
  const trackId = `Ssal_v3.1-aquafaang-chip-${mark}-conditions`
  return {
    type: 'QuantitativeTrack',
    trackId,
    name: `ChIP-seq ${mark} (20 conditions)`,
    assemblyNames: [ASSEMBLY],
    category: CATEGORY,
    adapter: {
      type: 'MultiConditionBigWigAdapter',
      conditions: bodyMapConditions(SIGNAL_TISSUES, sample => ({
        bigWigLocation: uri(
          `${BODYMAP}/ChIP/bigWig/AtlanticSalmon_ChIP-${mark}_${sample}_R1.bigWig`,
        ),
      })),
    },
    displays: [
      {
        type: 'LinearConditionWiggleDisplay',
        displayId: `${trackId}-LinearConditionWiggleDisplay`,
        unit: 'RPM',
      },
    ],
  }
}

export const conditionPileupTracks = [
  chromatinStateTrack,
  rnaSeqTrack,
  chipSeqTrack('H3K4me3'),
  chipSeqTrack('H3K27ac'),
]

/** The prototype browser's locus, and the tracks to show there. */
export const PROTOTYPE_LOCUS = '25:28,985,000-29,010,000'
export const CONDITION_PILEUP_TRACK_IDS = conditionPileupTracks.map(
  t => t.trackId,
)
