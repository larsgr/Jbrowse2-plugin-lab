import { toLocale } from '@jbrowse/core/util'
import type { PileupHover } from './pileupMixin'

/** 1234.5 -> "1.23k"; keeps axis captions short. */
export function formatValue(value: number) {
  const n = +value.toPrecision(4)
  const abs = Math.abs(n)
  const [div, suffix] =
    abs >= 1e9
      ? [1e9, 'G']
      : abs >= 1e6
        ? [1e6, 'M']
        : abs >= 1e4
          ? [1e3, 'k']
          : [1, '']
  return `${+(n / div).toPrecision(4)}${suffix}`
}

/** "25:28,994,101" or, zoomed out, "25:28,994,101–28,994,116". */
export function locString(hover: PileupHover) {
  const start = hover.start + 1
  return hover.end - hover.start <= 1
    ? `${hover.refName}:${toLocale(start)}`
    : `${hover.refName}:${toLocale(start)}–${toLocale(hover.end)}`
}
