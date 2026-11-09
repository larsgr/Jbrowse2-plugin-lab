import type { Feature } from '@jbrowse/core/util'
import type { Region } from '@jbrowse/core/util/types'

/**
 * How a pixel column that spans several data points is summarised:
 *
 *   - mean: coverage-weighted mean over the column, gaps counting as zero.
 *     Sums of means are means of sums, so the stacked pile-up stays exact.
 *   - max:  the highest value in the column (summary bins' maxScore), which
 *     keeps narrow peaks visible when zoomed far out.
 */
export type SummaryMode = 'mean' | 'max'

export interface WiggleRaster {
  width: number
  conditionCount: number
  /**
   * Signal magnitude (>= 0) per condition, strand and pixel column, at
   * `(condition * 2 + slot) * width + column`; slot 0 is the forward strand
   * (or the only one, for an unstranded condition), slot 1 the reverse.
   */
  values: Float32Array
}

export function valueAt(
  raster: WiggleRaster,
  condition: number,
  slot: 0 | 1,
  col: number,
) {
  return raster.values[(condition * 2 + slot) * raster.width + col] ?? 0
}

/**
 * Resamples every condition's features onto one grid of pixel columns.
 *
 * The files do not share coordinates: zoomed in, each BigWig returns its own
 * bedGraph intervals, and zoomed out each returns summary bins from its own
 * zoom levels, which differ between files. Stacking conditions on top of each
 * other needs them on a common grid, and the pixel column is the natural one.
 */
export function rasterizeWiggle(
  features: Iterable<Feature>,
  {
    region,
    bpPerPx,
    width,
    conditionCount,
    mode,
  }: {
    region: Region
    bpPerPx: number
    width: number
    conditionCount: number
    mode: SummaryMode
  },
): WiggleRaster {
  const values = new Float32Array(conditionCount * 2 * width)
  const exactWidth = (region.end - region.start) / bpPerPx
  for (const f of features) {
    const condition = f.get('condition') as number | undefined
    if (condition === undefined) {
      continue
    }
    const slot = f.get('strand') === -1 ? 1 : 0
    const score = f.get('score') as number
    const peak = f.get('summary') ? (f.get('maxScore') as number) : score
    let x0 = ((f.get('start') as number) - region.start) / bpPerPx
    let x1 = ((f.get('end') as number) - region.start) / bpPerPx
    if (region.reversed) {
      ;[x0, x1] = [exactWidth - x1, exactWidth - x0]
    }
    x0 = Math.max(0, x0)
    x1 = Math.min(width, x1)
    const base = (condition * 2 + slot) * width
    for (let col = Math.floor(x0); col < x1; col++) {
      const overlap = Math.min(x1, col + 1) - Math.max(x0, col)
      if (overlap <= 0) {
        continue
      }
      if (mode === 'max') {
        values[base + col] = Math.max(values[base + col]!, peak)
      } else {
        values[base + col]! += score * overlap
      }
    }
  }
  return { width, conditionCount, values }
}

/**
 * The numbers autoscale needs from a raster: the largest single-condition
 * value per strand (the rows' scale) and the largest stacked total per strand
 * (the pile-up's scale), plus mean/sd of non-zero values for "local ± 3σ".
 */
export function rasterStats(raster: WiggleRaster) {
  const { width, conditionCount } = raster
  let rowFwd = 0
  let rowRev = 0
  let stackFwd = 0
  let stackRev = 0
  let n = 0
  let sum = 0
  let sumSq = 0
  for (let col = 0; col < width; col++) {
    let f = 0
    let r = 0
    for (let c = 0; c < conditionCount; c++) {
      const vf = valueAt(raster, c, 0, col)
      const vr = valueAt(raster, c, 1, col)
      rowFwd = Math.max(rowFwd, vf)
      rowRev = Math.max(rowRev, vr)
      f += vf
      r += vr
      for (const v of [vf, vr]) {
        if (v > 0) {
          n++
          sum += v
          sumSq += v * v
        }
      }
    }
    stackFwd = Math.max(stackFwd, f)
    stackRev = Math.max(stackRev, r)
  }
  return { rowFwd, rowRev, stackFwd, stackRev, n, sum, sumSq }
}
