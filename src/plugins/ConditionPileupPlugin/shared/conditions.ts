import type { FileLocation } from '@jbrowse/core/util/types'

/**
 * One condition (sample, tissue, stage, ...) of a multi-condition track, as
 * written in the track's adapter config. Both adapters in this plugin take a
 * `conditions` array of these; which file fields they read depends on the
 * adapter:
 *
 *   - MultiBigBedAdapter reads `bigBedLocation`.
 *   - MultiConditionBigWigAdapter reads either the stranded pair
 *     (`forwardBigWigLocation` + `reverseBigWigLocation`, e.g. RNA-seq) or a
 *     single `bigWigLocation` (unstranded, e.g. ChIP-seq).
 */
export interface ConditionConfig {
  /** row label, e.g. "Brain Imm F" */
  name: string
  /**
   * Conditions in the same group share a color, e.g. a tissue. Defaults to
   * the condition's own name.
   */
  group?: string
  /** overrides the group color for this condition */
  color?: string
  bigBedLocation?: FileLocation
  bigWigLocation?: FileLocation
  forwardBigWigLocation?: FileLocation
  reverseBigWigLocation?: FileLocation
  /** multiplied into every score, e.g. 1e6 / mapped reads to plot RPM */
  scaleFactor?: number
}

/** A condition as the display and renderers use it: colors resolved. */
export interface Condition {
  name: string
  group: string
  color: string
}

/**
 * Okabe-Ito: a colorblind-safe qualitative palette, and the one the prototype
 * browser colors its tissues with. Groups take colors in order of first
 * appearance unless a condition sets its own.
 */
export const GROUP_PALETTE = [
  '#0072B2',
  '#CC79A7',
  '#D55E00',
  '#009E73',
  '#56B4E9',
  '#E69F00',
  '#F0E442',
  '#000000',
]

export function resolveConditions(configs: ConditionConfig[] = []): Condition[] {
  const groupColor = new Map<string, string>()
  return configs.map(c => {
    const group = c.group ?? c.name
    if (!groupColor.has(group)) {
      groupColor.set(
        group,
        c.color ?? GROUP_PALETTE[groupColor.size % GROUP_PALETTE.length]!,
      )
    }
    return { name: c.name, group, color: c.color ?? groupColor.get(group)! }
  })
}

/** One legend entry per group, in order of first appearance. */
export function groupLegend(conditions: Condition[]) {
  const seen = new Map<string, string>()
  for (const c of conditions) {
    if (!seen.has(c.group)) {
      seen.set(c.group, c.color)
    }
  }
  return [...seen].map(([label, color]) => ({ label, color }))
}
