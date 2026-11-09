import { ROW_PAD, rowTop, type PileupLayout } from '../shared/layout'
import type { StateRaster } from './rasterize'

const ROW_BACKGROUND = '#f1f3f5'
const BASELINE = '#c8c8c8'

/**
 * Draws a block of a chromatin-state track: the stacked pile-up and, when
 * expanded, one row per condition.
 *
 * Both are drawn as runs of identical columns rather than column by column,
 * so a 10 kb quiescent stretch costs one rectangle, not hundreds.
 */
export function drawChromatinStates(
  ctx: CanvasRenderingContext2D,
  raster: StateRaster,
  colors: string[],
  layout: PileupLayout,
) {
  const { width, conditionCount: n, stateCount: S, dominant } = raster
  const base = layout.top + layout.pileupHeight - 1

  // Pile-up: per column, how many conditions are in each state, stacked in
  // palette order from the baseline up. Full height = all N conditions.
  if (n && S) {
    const unit = (layout.pileupHeight - 4) / n
    const counts = new Uint16Array(width * S)
    for (let c = 0; c < n; c++) {
      for (let col = 0; col < width; col++) {
        const s = dominant[c * width + col]!
        if (s >= 0) {
          counts[col * S + s]! += 1
        }
      }
    }
    const sameColumn = (a: number, b: number) => {
      for (let s = 0; s < S; s++) {
        if (counts[a * S + s] !== counts[b * S + s]) {
          return false
        }
      }
      return true
    }
    let runStart = 0
    for (let col = 1; col <= width; col++) {
      if (col < width && sameColumn(col, runStart)) {
        continue
      }
      let y = base
      for (let s = 0; s < S; s++) {
        const k = counts[runStart * S + s]!
        if (k) {
          const h = k * unit
          ctx.fillStyle = colors[s]!
          ctx.fillRect(runStart, y - h, col - runStart, h)
          y -= h
        }
      }
      runStart = col
    }
  }
  ctx.fillStyle = BASELINE
  ctx.fillRect(0, base, width, 1)

  if (!layout.expanded) {
    return
  }
  const h = layout.rowHeight - ROW_PAD
  for (let c = 0; c < n; c++) {
    const y = rowTop(layout, c)
    ctx.fillStyle = ROW_BACKGROUND
    ctx.fillRect(0, y, width, h)
    let runStart = 0
    for (let col = 1; col <= width; col++) {
      const s = dominant[c * width + runStart]!
      if (col < width && dominant[c * width + col] === s) {
        continue
      }
      if (s >= 0) {
        ctx.fillStyle = colors[s]!
        ctx.fillRect(runStart, y, col - runStart, h)
      }
      runStart = col
    }
  }
}
