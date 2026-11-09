import type { Feature } from '@jbrowse/core/util'
import type { Region } from '@jbrowse/core/util/types'

export interface StateRaster {
  width: number
  conditionCount: number
  stateCount: number
  /**
   * The state shown for each condition in each pixel column, at
   * `condition * width + column`; -1 where the condition has no state other
   * than background there.
   */
  dominant: Int16Array
}

/**
 * Reduces segmentations to one state per condition per pixel column: the
 * non-background state covering the most of that column.
 *
 * Working per column rather than per feature is what keeps the track
 * readable at every zoom. Zoomed out, a column spans many segments; drawing
 * each as a rectangle would leave whichever happened to be drawn last, and
 * the pile-up could not count conditions at all. With one state per
 * condition per column, the pile-up is simply a histogram of the column, so
 * its height is always "how many conditions have a state here", 0..N.
 *
 * Background (e.g. Quiescent) is skipped rather than allowed to win: a column
 * that is mostly quiescent with a 200 bp enhancer in it should show the
 * enhancer, as a min-width feature glyph would.
 */
export function rasterizeStates(
  features: Iterable<Feature>,
  {
    region,
    bpPerPx,
    width,
    conditionCount,
    stateCount,
    stateOf,
  }: {
    region: Region
    bpPerPx: number
    width: number
    conditionCount: number
    stateCount: number
    stateOf: (feature: Feature) => number
  },
): StateRaster {
  const cover = new Float32Array(conditionCount * width * stateCount)
  const exactWidth = (region.end - region.start) / bpPerPx

  for (const f of features) {
    const condition = f.get('condition') as number | undefined
    const state = stateOf(f)
    if (condition === undefined || state < 0) {
      continue
    }
    let x0 = ((f.get('start') as number) - region.start) / bpPerPx
    let x1 = ((f.get('end') as number) - region.start) / bpPerPx
    if (region.reversed) {
      ;[x0, x1] = [exactWidth - x1, exactWidth - x0]
    }
    x0 = Math.max(0, x0)
    x1 = Math.min(width, x1)
    const rowBase = condition * width
    for (let col = Math.floor(x0); col < x1; col++) {
      const overlap = Math.min(x1, col + 1) - Math.max(x0, col)
      if (overlap > 0) {
        cover[(rowBase + col) * stateCount + state]! += overlap
      }
    }
  }

  const dominant = new Int16Array(conditionCount * width).fill(-1)
  for (let cell = 0; cell < conditionCount * width; cell++) {
    let best = -1
    let bestCover = 0
    for (let s = 0; s < stateCount; s++) {
      const v = cover[cell * stateCount + s]!
      if (v > bestCover) {
        best = s
        bestCover = v
      }
    }
    dominant[cell] = best
  }
  return { width, conditionCount, stateCount, dominant }
}

/** Conditions per state in one column, as the pile-up stacks them. */
export function columnCounts(raster: StateRaster, col: number) {
  const counts = new Uint16Array(raster.stateCount)
  for (let c = 0; c < raster.conditionCount; c++) {
    const s = raster.dominant[c * raster.width + col]!
    if (s >= 0) {
      counts[s]! += 1
    }
  }
  return counts
}
