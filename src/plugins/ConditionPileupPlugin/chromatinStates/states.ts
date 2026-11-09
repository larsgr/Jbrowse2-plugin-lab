import type { Feature } from '@jbrowse/core/util'

/**
 * One chromatin state in a track's palette (display config `states`).
 *
 * The palette fixes three things: the legend, each state's color, and the
 * stacking order of the pile-up (first entry at the bottom). `match` folds
 * several names from the files into one entry, e.g. "Poised enhancer 1" and
 * "Poised enhancer 2" into "Poised enhancer".
 */
export interface StateDef {
  name: string
  color: string
  match?: string[]
}

export interface StateTable {
  /** legend/stacking order; background states are not in it */
  names: string[]
  colors: string[]
  /** name as written in the file -> index into names, or -1 for background */
  index: Map<string, number>
}

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

/**
 * The color a BigBed feature carries itself, from its itemRgb column. The BED
 * parser leaves it as the raw "r,g,b" string, under the column's autoSql name
 * (`reserved` in the UCSC bed9 definition, `itemRgb` in most others).
 */
export function featureColor(feature: Feature) {
  const raw = (feature.get('itemRgb') ??
    feature.get('reserved') ??
    feature.get('color')) as string | number | undefined
  if (typeof raw === 'number') {
    return `#${raw.toString(16).padStart(6, '0')}`
  }
  if (typeof raw === 'string' && /^\d+,\d+,\d+$/.test(raw.trim())) {
    return `rgb(${raw.trim()})`
  }
  return typeof raw === 'string' && raw ? raw : '#888888'
}

/**
 * Maps every state name in a block's features to a palette index.
 *
 * Names the palette does not cover still get drawn, in their own itemRgb
 * color, after the configured states. They are sorted (numerically aware, so
 * "2_TssFlnk" precedes "10_EnhG") rather than taken in order of appearance:
 * appearance order differs from block to block, and the pile-up's stacking
 * order has to be the same in every block or neighbouring blocks would not
 * line up. With no palette configured at all, this makes a stock ChromHMM file
 * ("1_TssA", "2_TssFlnk", ...) stack in state order and use its own colors.
 */
export function buildStateTable(
  defs: StateDef[],
  background: string[],
  features: Iterable<Feature>,
): StateTable {
  const bg = new Set(background)
  const names: string[] = []
  const colors: string[] = []
  const index = new Map<string, number>()

  for (const def of defs) {
    const aliases = [def.name, ...(def.match ?? [])]
    let i = -1
    if (!aliases.some(a => bg.has(a))) {
      i = names.length
      names.push(def.name)
      colors.push(def.color)
    }
    for (const alias of aliases) {
      index.set(alias, i)
    }
  }

  const extra = new Map<string, string>()
  for (const f of features) {
    const name = String(f.get('name') ?? '')
    if (!index.has(name) && !extra.has(name)) {
      extra.set(name, featureColor(f))
    }
  }
  for (const [name, color] of [...extra].sort(([a], [b]) => natural(a, b))) {
    if (bg.has(name)) {
      index.set(name, -1)
    } else {
      index.set(name, names.length)
      names.push(name)
      colors.push(color)
    }
  }
  return { names, colors, index }
}
