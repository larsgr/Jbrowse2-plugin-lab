import { readConfObject } from '@jbrowse/core/configuration'
import type { AnyConfigurationModel } from '@jbrowse/core/configuration'
import { clamp } from '@jbrowse/core/util'
import { colord } from '@jbrowse/core/util/colord'
import type { Feature } from '@jbrowse/core/util'
import type { Region } from '@jbrowse/core/util/types'

/** Matches the stock wiggle renderer, so the two look alike side by side. */
const FUDGE_FACTOR = 0.3
const CLIP_HEIGHT = 2
/** `color` left at this value means "use posColor/negColor". */
const COLOR_DEFAULT = '#f0f'

export interface DrawStrandedProps {
  features: Map<string, Feature> | Feature[]
  regions: Region[]
  bpPerPx: number
  height: number
  offset?: number
  config: AnyConfigurationModel
  scaleOpts: { domain: [number, number] }
  inverted?: boolean
  displayCrossHatches?: boolean
  /** plotted-space y values to draw cross hatches at */
  tickValues?: number[]
}

/**
 * What the tooltip gets for one strand at one pixel column. Values are in the
 * file's own units (before the sign flip and log transform), since that is
 * what a user wants to read off; the canvas already shows the plotted ones.
 */
export interface StrandedTooltipFeature {
  uniqueId: string
  refName: string
  start: number
  end: number
  strand: 1 | -1
  score: number
  minScore: number
  maxScore: number
  summary: boolean
}

function lighten(color: string, amount: number) {
  const hsl = colord(color).toHsl()
  return colord({ ...hsl, l: clamp(hsl.l * (1 + amount), 0, 100) }).toHex()
}

function darken(color: string, amount: number) {
  const hsl = colord(color).toHsl()
  return colord({ ...hsl, l: clamp(hsl.l * (1 - amount), 0, 100) }).toHex()
}

/**
 * Draws forward and reverse coverage as two independent series.
 *
 * The stock drawXY treats a stranded track as one series whose values happen
 * to cross zero, and that breaks down in two ways once both strands have
 * signal at the same position:
 *
 *   - Whiskers mode caches the last color it computed and reuses it while the
 *     "current" color is unchanged, but only refreshes the cache for summary
 *     bins. The two files' features arrive interleaved, and a raw (non-summary)
 *     feature from one strand leaves the other strand's color in the cache, so
 *     the next forward bin is painted in the reverse strand's red.
 *   - It keeps one feature per pixel column for the tooltip, so hovering only
 *     ever reports one strand.
 *
 * Here each strand gets its own passes, its own color, and its own tooltip
 * features, so neither can leak into the other.
 */
export function drawStranded(ctx: CanvasRenderingContext2D, props: DrawStrandedProps) {
  const {
    features,
    regions,
    bpPerPx,
    height: totalHeight,
    offset = 0,
    config,
    scaleOpts,
    inverted,
    displayCrossHatches,
    tickValues = [],
  } = props
  const region = regions[0]!
  const width = (region.end - region.start) / bpPerPx
  const height = totalHeight - offset * 2

  const filled = readConfObject(config, 'filled') as boolean
  const minSize = readConfObject(config, 'minSize') as number
  const summaryScoreMode = readConfObject(config, 'summaryScoreMode') as string
  const clipColor = readConfObject(config, 'clipColor') as string
  const color = readConfObject(config, 'color') as string
  const colorIsCallback = Boolean(
    (config as { color?: { isCallback?: boolean } }).color?.isCallback,
  )
  const posColor = readConfObject(config, 'posColor') as string
  const negColor = readConfObject(config, 'negColor') as string

  const [niceMin, niceMax] = scaleOpts.domain
  const span = niceMax - niceMin
  const ratio = span !== 0 ? height / span : 0
  const toY = (n: number) => {
    const scaled = (n - niceMin) * ratio
    return clamp(inverted ? scaled : height - scaled, 0, height) + offset
  }
  const originY = toY(clamp(0, niceMin, niceMax))

  const strandColor = (feature: Feature, strand: 1 | -1) =>
    colorIsCallback
      ? (readConfObject(config, 'color', { feature }) as string)
      : color !== COLOR_DEFAULT
        ? color
        : strand === -1
          ? negColor
          : posColor

  const xOf = (feature: Feature) => {
    const start = feature.get('start') as number
    const end = feature.get('end') as number
    const left = region.reversed
      ? (region.end - end) / bpPerPx
      : (start - region.start) / bpPerPx
    const right = region.reversed
      ? (region.end - start) / bpPerPx
      : (end - region.start) / bpPerPx
    return { left, w: Math.max(right - left + FUDGE_FACTOR, minSize) }
  }

  // A bar grows from the axis to the value; unfilled, it is a thin mark at
  // the value, like the stock renderer's "no fill" modes.
  const bar = (feature: Feature, value: number, fill: string) => {
    const { left, w } = xOf(feature)
    const y = toY(value)
    ctx.fillStyle = fill
    if (filled) {
      ctx.fillRect(left, Math.min(y, originY), w, Math.abs(originY - y))
    } else {
      const size = Math.max(minSize, 1)
      ctx.fillRect(left, y - size / 2, w, size)
    }
  }

  // In plotted space the reverse strand is negative, so "the bigger value"
  // means the one further from the axis, whichever sign it has. Picking by
  // magnitude keeps the whisker nesting (outer, mean, inner) and the max/min
  // summary modes meaning the same thing on both strands - and still works
  // with `negateReverse: false`, where both strands are positive.
  const extremes = (feature: Feature) => {
    const score = feature.get('score') as number
    if (!feature.get('summary')) {
      return { outer: score, inner: score }
    }
    const lo = feature.get('minScore') as number
    const hi = feature.get('maxScore') as number
    return Math.abs(hi) >= Math.abs(lo)
      ? { outer: hi, inner: lo }
      : { outer: lo, inner: hi }
  }

  const byStrand: Record<'1' | '-1', Feature[]> = { '1': [], '-1': [] }
  for (const feature of features.values()) {
    byStrand[feature.get('strand') === -1 ? '-1' : '1'].push(feature)
  }

  let hasClipping = false
  const tooltipFeatures: StrandedTooltipFeature[] = []

  for (const strand of [1, -1] as const) {
    const feats = byStrand[strand === 1 ? '1' : '-1']
    if (summaryScoreMode === 'whiskers') {
      for (const f of feats) {
        if (f.get('summary')) {
          bar(f, extremes(f).outer, lighten(strandColor(f, strand), 0.4))
        }
      }
      for (const f of feats) {
        bar(f, f.get('score') as number, strandColor(f, strand))
      }
      for (const f of feats) {
        if (f.get('summary')) {
          bar(f, extremes(f).inner, darken(strandColor(f, strand), 0.4))
        }
      }
    } else {
      for (const f of feats) {
        const { outer, inner } = extremes(f)
        const value =
          summaryScoreMode === 'max'
            ? outer
            : summaryScoreMode === 'min'
              ? inner
              : (f.get('score') as number)
        bar(f, value, strandColor(f, strand))
      }
    }

    for (const f of feats) {
      const { outer } = extremes(f)
      if (outer > niceMax || outer < niceMin) {
        hasClipping = true
      }
    }
    tooltipFeatures.push(...columnSummaries(feats, strand, xOf))
  }

  // Values beyond a user-set min/max are clamped to the edge; mark where.
  if (hasClipping) {
    ctx.fillStyle = clipColor
    for (const f of features.values()) {
      const { outer } = extremes(f)
      const { left, w } = xOf(f)
      if (outer > niceMax) {
        ctx.fillRect(left, inverted ? offset + height - CLIP_HEIGHT : offset, w, CLIP_HEIGHT)
      } else if (outer < niceMin) {
        ctx.fillRect(left, inverted ? offset : offset + height - CLIP_HEIGHT, w, CLIP_HEIGHT)
      }
    }
  }

  if (displayCrossHatches) {
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(200,200,200,0.5)'
    for (const tick of tickValues) {
      const y = Math.round(toY(tick))
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
  }

  return { tooltipFeatures }
}

/**
 * Collapses one strand's features to one per pixel column for the tooltip.
 *
 * Zoomed out, several summary bins can land in the same column; they are all
 * drawn, so the tooltip merges them (min of mins, max of maxes, length-weighted
 * mean) rather than reporting just the first, which would disagree with the
 * whisker under the cursor.
 */
function columnSummaries(
  feats: Feature[],
  strand: 1 | -1,
  xOf: (f: Feature) => { left: number },
): StrandedTooltipFeature[] {
  const columns = new Map<number, StrandedTooltipFeature & { weight: number }>()
  for (const f of feats) {
    const start = f.get('start') as number
    const end = f.get('end') as number
    const summary = Boolean(f.get('summary'))
    const score = f.get('rawScore') as number
    const min = summary ? (f.get('rawMinScore') as number) : score
    const max = summary ? (f.get('rawMaxScore') as number) : score
    const len = Math.max(end - start, 1)
    const col = Math.floor(xOf(f).left)
    const prev = columns.get(col)
    if (!prev) {
      columns.set(col, {
        uniqueId: f.id(),
        refName: f.get('refName') as string,
        start,
        end,
        strand,
        score,
        minScore: min,
        maxScore: max,
        summary,
        weight: len,
      })
    } else {
      const weight = prev.weight + len
      prev.score = (prev.score * prev.weight + score * len) / weight
      prev.weight = weight
      prev.start = Math.min(prev.start, start)
      prev.end = Math.max(prev.end, end)
      prev.minScore = Math.min(prev.minScore, min)
      prev.maxScore = Math.max(prev.maxScore, max)
      prev.summary = true
    }
  }
  return [...columns.values()].map(({ weight: _weight, ...rest }) => rest)
}
