/**
 * The value transforms a stranded track can be plotted with.
 *
 * JBrowse's own log scale cannot be used here: it is a d3 `scaleLog`, which
 * is undefined at and below zero, and a stranded track puts the whole reverse
 * strand below zero. So the log option is a signed transform applied to the
 * data instead, and the axis stays linear in transformed units:
 *
 *   log2(x + 1) for x >= 0, mirrored as -log2(|x| + 1) below the axis
 *
 * The +1 pseudocount keeps zero coverage at zero, so the axis still separates
 * the strands, and makes the transform continuous across it.
 */
export type StrandedScale = 'linear' | 'log2'

export function transformScore(value: number, scale: StrandedScale) {
  if (scale === 'linear') {
    return value
  }
  return Math.sign(value) * Math.log2(Math.abs(value) + 1)
}

/** Inverse of `transformScore`, for labelling a log axis in raw units. */
export function untransformScore(value: number, scale: StrandedScale) {
  if (scale === 'linear') {
    return value
  }
  return Math.sign(value) * (2 ** Math.abs(value) - 1)
}
