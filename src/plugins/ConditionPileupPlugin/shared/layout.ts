/**
 * Vertical layout of a condition pile-up track, top to bottom:
 *
 *   legend band   (`top` px; HTML only, the renderer leaves it blank)
 *   pile-up       (`pileupHeight` px; every condition combined)
 *   gap           (`rowGap` px, only when expanded)
 *   one row per condition (`rowHeight` px each, only when expanded)
 *
 * The display computes this once and hands the same object to the renderer
 * (as a render prop) and to the HTML overlay, so the canvas and the labels
 * drawn over it cannot drift apart.
 */
export interface PileupLayout {
  top: number
  pileupHeight: number
  rowGap: number
  rowHeight: number
  expanded: boolean
  rowCount: number
}

/** Blank strip between a row's band and the next, so rows read as rows. */
export const ROW_PAD = 2

export function layoutHeight(l: PileupLayout) {
  return (
    l.top +
    l.pileupHeight +
    (l.expanded && l.rowCount ? l.rowGap + l.rowCount * l.rowHeight : 0)
  )
}

export function rowTop(l: PileupLayout, row: number) {
  return l.top + l.pileupHeight + l.rowGap + row * l.rowHeight
}

export type PileupZone =
  | { zone: 'pileup' }
  | { zone: 'row'; row: number }
  | undefined

/** Which part of the track a y coordinate (px from the top) falls in. */
export function zoneAt(l: PileupLayout, y: number): PileupZone {
  if (y >= l.top && y < l.top + l.pileupHeight) {
    return { zone: 'pileup' }
  }
  if (!l.expanded) {
    return undefined
  }
  const row = Math.floor((y - rowTop(l, 0)) / l.rowHeight)
  return row >= 0 && row < l.rowCount ? { zone: 'row', row } : undefined
}

export interface LegendItem {
  label: string
  color: string
}

export interface PlacedLegendItem extends LegendItem {
  x: number
  y: number
}

export const LEGEND_LINE = 16
const LEGEND_FONT = 11
const SWATCH = 10
const ITEM_GAP = 12

/**
 * Wraps legend chips into lines that fit `width`, starting `indent` px in on
 * the first line. Computed here
 * rather than left to CSS flex-wrap because the band's height has to be known
 * before rendering: it shifts every row of the canvas down.
 */
export function placeLegend(
  items: LegendItem[],
  width: number,
  indent: number,
  measure: (text: string, fontSize: number) => number,
) {
  const placed: PlacedLegendItem[] = []
  let x = indent
  let line = 0
  for (const item of items) {
    const w = SWATCH + 4 + measure(item.label, LEGEND_FONT) + ITEM_GAP
    if (x + w > width && x > (line === 0 ? indent : 0)) {
      line += 1
      x = 4
    }
    placed.push({ ...item, x, y: line * LEGEND_LINE + 3 })
    x += w
  }
  return {
    items: placed,
    height: placed.length ? (line + 1) * LEGEND_LINE + 4 : 0,
    fontSize: LEGEND_FONT,
    swatch: SWATCH,
  }
}
