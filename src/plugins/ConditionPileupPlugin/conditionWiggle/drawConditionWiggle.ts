import { ROW_PAD, rowTop, type PileupLayout } from '../shared/layout'
import { valueAt, type WiggleRaster } from './rasterize'

export type RowScale = 'linear' | 'log2'

export interface DrawWiggleOptions {
  layout: PileupLayout
  colors: string[]
  stranded: boolean
  /** largest stacked total per strand: the pile-up's scale */
  stacked: { fwd: number; rev: number }
  /** largest single-condition value: every row's scale */
  rowMax: number
  rowScale: RowScale
}

const ROW_BACKGROUND = '#f4f5f7'
const AXIS = 'rgba(0,0,0,0.35)'

/**
 * Fills the band between two step curves, one y per pixel column.
 *
 * Consecutive columns with the same y are merged into one segment, so flat
 * stretches (including all the zeros between genes) cost nothing.
 */
function fillBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  outer: (col: number) => number,
  inner: (col: number) => number,
  color: string,
) {
  ctx.beginPath()
  let y = outer(0)
  ctx.moveTo(0, y)
  for (let col = 1; col < width; col++) {
    const next = outer(col)
    if (next !== y) {
      ctx.lineTo(col, y)
      ctx.lineTo(col, next)
      y = next
    }
  }
  ctx.lineTo(width, y)
  y = inner(width - 1)
  ctx.lineTo(width, y)
  for (let col = width - 2; col >= 0; col--) {
    const next = inner(col)
    if (next !== y) {
      ctx.lineTo(col + 1, y)
      ctx.lineTo(col + 1, next)
      y = next
    }
  }
  ctx.lineTo(0, y)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

function hasSignal(raster: WiggleRaster, c: number, slot: 0 | 1) {
  const { width, values } = raster
  const base = (c * 2 + slot) * width
  for (let i = base; i < base + width; i++) {
    if (values[i]! > 0) {
      return true
    }
  }
  return false
}

/**
 * Draws a multi-condition wiggle block:
 *
 *   - the combined pile-up: conditions stacked on top of each other in their
 *     colors, forward strand up from the axis and reverse strand down, on a
 *     linear scale (sums only add up on a linear scale);
 *   - when expanded, one row per condition on a shared scale, linear or
 *     log2(x+1), forward up and reverse down from the row's midline.
 *
 * Unstranded conditions are drawn up from the bottom instead of a midline.
 */
export function drawConditionWiggle(
  ctx: CanvasRenderingContext2D,
  raster: WiggleRaster,
  opts: DrawWiggleOptions,
) {
  const { layout, colors, stranded, stacked, rowMax, rowScale } = opts
  const { width, conditionCount: n } = raster

  // Combined pile-up. The axis splits the height in proportion to each
  // strand's stacked maximum, so both strands share one px-per-unit scale.
  const top = layout.top + 2
  const bottom = layout.top + layout.pileupHeight - 2
  const span = stranded ? stacked.fwd + stacked.rev : stacked.fwd
  const pxPerUnit = span > 0 ? (bottom - top) / span : 0
  const axis = stranded ? top + stacked.fwd * pxPerUnit : bottom
  const cumFwd = new Float32Array(width)
  const cumRev = new Float32Array(width)
  for (let c = 0; c < n; c++) {
    const color = colors[c] ?? '#888'
    for (const slot of [0, 1] as const) {
      if (!hasSignal(raster, c, slot)) {
        continue
      }
      const cum = slot === 0 ? cumFwd : cumRev
      const dir = slot === 0 ? -1 : 1
      const at = (v: number) =>
        Math.min(bottom, Math.max(top, axis + dir * v * pxPerUnit))
      fillBand(
        ctx,
        width,
        col => at(cum[col]! + valueAt(raster, c, slot, col)),
        col => at(cum[col]!),
        color,
      )
      for (let col = 0; col < width; col++) {
        cum[col]! += valueAt(raster, c, slot, col)
      }
    }
  }
  ctx.fillStyle = AXIS
  ctx.fillRect(0, Math.round(axis) - 0.5, width, 1)

  if (!layout.expanded) {
    return
  }

  const norm =
    rowScale === 'log2'
      ? (v: number) => (rowMax > 0 ? Math.log2(v + 1) / Math.log2(rowMax + 1) : 0)
      : (v: number) => (rowMax > 0 ? v / rowMax : 0)
  const h = layout.rowHeight - ROW_PAD
  for (let c = 0; c < n; c++) {
    const y0 = rowTop(layout, c)
    const mid = stranded ? y0 + h / 2 : y0 + h
    const half = stranded ? h / 2 : h
    ctx.fillStyle = ROW_BACKGROUND
    ctx.fillRect(0, y0, width, h)
    const color = colors[c] ?? '#888'
    for (const slot of [0, 1] as const) {
      if (!hasSignal(raster, c, slot)) {
        continue
      }
      const dir = slot === 0 ? -1 : 1
      fillBand(
        ctx,
        width,
        col =>
          mid + dir * Math.min(1, norm(valueAt(raster, c, slot, col))) * half,
        () => mid,
        color,
      )
    }
    if (stranded) {
      ctx.fillStyle = 'rgba(0,0,0,0.12)'
      ctx.fillRect(0, Math.round(mid) - 0.5, width, 1)
    }
  }
}
