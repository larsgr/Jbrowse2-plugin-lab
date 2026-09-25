import { lazy } from 'react'
import { getConf } from '@jbrowse/core/configuration'
import type { AnyConfigurationSchemaType } from '@jbrowse/core/configuration'
import type PluginManager from '@jbrowse/core/PluginManager'
import type { MenuItem } from '@jbrowse/core/ui'
import { types } from '@jbrowse/mobx-state-tree'
import { wigglePluginExports } from '../StrandedXYPlotRenderer'
import { untransformScore, type StrandedScale } from '../scale'

const Tooltip = lazy(() => import('./Tooltip'))

/** Both strands at the position under the mouse, set by the rendering. */
export interface StrandedHover {
  refName: string
  /** 0-based bp position under the mouse */
  position: number
  forward?: Record<string, unknown>
  reverse?: Record<string, unknown>
}

const YSCALEBAR_LABEL_OFFSET = 5

/**
 * LinearStrandedWiggleDisplay: the stock wiggle display, pointed at
 * StrandedXYPlotRenderer, with a tooltip that shows both strands and a log
 * scale that works below zero.
 *
 * It extends LinearWiggleDisplay's model (from WigglePlugin's `exports`)
 * instead of re-implementing it, so autoscale, the y-axis, resolution, fill
 * mode, colors, min/max and SVG export all come along. Each override below is
 * one of the few places the stock behaviour assumes a single series.
 *
 * The base model reaches us untyped, so `self` is `any` throughout.
 */
export default function stateModelFactory(
  pluginManager: PluginManager,
  configSchema: AnyConfigurationSchemaType,
) {
  const { linearWiggleDisplayModelFactory } = wigglePluginExports(pluginManager)
  const { getScale } = wigglePluginExports(pluginManager).utils

  return (
    types
      .compose(
        'LinearStrandedWiggleDisplay',
        linearWiggleDisplayModelFactory(pluginManager, configSchema),
        types.model({ type: types.literal('LinearStrandedWiggleDisplay') }),
      )
      .volatile(() => ({
        strandedHover: undefined as StrandedHover | undefined,
        /** the scale the current stats were computed in */
        statsScale: undefined as StrandedScale | undefined,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .actions((self: any) => {
        const superUpdateQuantitativeStats = self.updateQuantitativeStats
        return {
          setStrandedHover(hover?: StrandedHover) {
            self.strandedHover = hover
          },
          updateQuantitativeStats(
            stats: { strandedScale?: StrandedScale },
            statsRegion: string,
          ) {
            superUpdateQuantitativeStats(stats, statsRegion)
            self.statsScale = stats.strandedScale
          },
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => ({
        /**
         * The user-facing scale setting. It lives in the stock `scale`
         * property / `scaleType` config slot, so a track config can default a
         * stranded track to log with `scaleType: 'log'` as for any wiggle.
         */
        get strandedScale(): StrandedScale {
          return (self.scale ?? getConf(self, 'scaleType')) === 'log'
            ? 'log2'
            : 'linear'
        },
        /**
         * What the stock machinery (domain, y-axis) sees: always linear. The
         * log option is applied to the data by the adapter instead, because
         * d3's log scale is undefined for the reverse strand's negative
         * values. See scale.ts.
         */
        get scaleType() {
          return 'linear'
        },
        get rendererTypeName() {
          return 'StrandedXYPlotRenderer'
        },
        get TooltipComponent() {
          return Tooltip
        },
        // The stock versions test for the stock renderer names.
        get graphType() {
          return true
        },
        get canHaveFill() {
          return true
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => ({
        /**
         * Axis ticks, labelled in the file's own units.
         *
         * YScaleBar prints each tick value as its label and places it with
         * `position(value)`, so the values here are the label strings and
         * `position` maps them back to plotted space. On a log scale that lets
         * the ticks fall on round raw values (10, 100, 1k) instead of on round
         * log2 units that would read as 1023, 65535, ...
         */
        get ticks() {
          const { domain, height, inverted } = self
          // Label in the scale the domain was computed in. Right after the
          // scale changes, the domain still comes from the old scale's stats:
          // reading a linear max of 5000 as log2 units would label 2^5000.
          const strandedScale: StrandedScale =
            self.statsScale ?? self.strandedScale
          if (!domain) {
            return undefined
          }
          const scale = getScale({
            scaleType: 'linear',
            domain,
            range: [height - YSCALEBAR_LABEL_OFFSET, YSCALEBAR_LABEL_OFFSET],
            inverted,
          })
          const minimal = height < 100 || getConf(self, 'minimalTicks')
          const plotted: number[] = minimal
            ? scale.domain()
            : strandedScale === 'log2'
              ? spaced(logTicks(domain), scale)
              : scale.ticks(4)
          const labels = plotted.map(v =>
            formatTick(untransformScore(v, strandedScale)),
          )
          const byLabel = new Map(labels.map((l, i) => [l, plotted[i]!]))
          return {
            range: scale.range(),
            values: labels,
            position: (label: string) => scale(byLabel.get(label) ?? 0),
            plotted,
          }
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => {
        const superAdapterProps = self.adapterProps
        const superRenderProps = self.renderProps
        const superScoreTrackMenuItems = self.scoreTrackMenuItems
        const superWiggleOnlyTrackMenuItems = self.wiggleOnlyTrackMenuItems
        return {
          /**
           * Stats and render requests both pass these through to the adapter
           * as options, which is how the scale reaches it.
           */
          adapterProps() {
            return { ...superAdapterProps(), strandedScale: self.strandedScale }
          },
          renderProps() {
            const props = superRenderProps()
            return {
              ...props,
              // `ticks` carries a function, and the renderer only needs the
              // numbers for cross hatches.
              ticks: undefined,
              tickValues: self.ticks?.plotted,
              // Right after the scale changes, the domain still comes from
              // stats in the old scale; drawing then would flash a plot
              // squashed flat or clipped at the edges.
              notReady:
                props.notReady || self.statsScale !== self.strandedScale,
            }
          },
          scoreTrackMenuItems() {
            return (superScoreTrackMenuItems() as MenuItem[]).map(item =>
              'label' in item && item.label === 'Scale type'
                ? {
                    label: 'Scale type',
                    subMenu: [
                      {
                        label: 'Linear',
                        type: 'radio' as const,
                        checked: self.strandedScale === 'linear',
                        onClick: () => self.setScaleType('linear'),
                      },
                      {
                        label: 'Log, log2(x+1)',
                        type: 'radio' as const,
                        checked: self.strandedScale === 'log2',
                        onClick: () => self.setScaleType('log'),
                      },
                    ],
                  }
                : item,
            )
          },
          // One renderer only: density and line plots would bring back the
          // single-series assumptions this display exists to avoid.
          wiggleOnlyTrackMenuItems() {
            return (superWiggleOnlyTrackMenuItems() as MenuItem[]).filter(
              item => !('label' in item && item.label === 'Renderer type'),
            )
          },
        }
      })
  )
}

/** Round raw values (0, ±1, ±10, ±100, ...) inside a log2(x+1) domain. */
function logTicks([lo, hi]: [number, number]) {
  // Compared in log2 space: untransforming the limit overflows to Infinity
  // past ~1024 log2 units, and `p <= Infinity` would never stop. 10^308 is
  // the largest power of ten a double holds.
  const side = (limit: number, sign: 1 | -1) => {
    const ticks: number[] = []
    for (let e = 0; e <= 308; e++) {
      const t = Math.log2(10 ** e + 1)
      if (t > Math.abs(limit)) {
        break
      }
      ticks.push(sign * t)
    }
    return ticks
  }
  return [...(lo < 0 ? side(lo, -1) : []), 0, ...(hi > 0 ? side(hi, 1) : [])]
}

/**
 * Drops ticks that would print on top of each other. On a log scale the
 * small powers bunch up around the axis (0, 1 and 10 are 1, 2.3 and 3.5 log2
 * units apart), so on a short track they would overlap. Zero and the largest
 * magnitudes are kept first, since they say the most about the range.
 */
function spaced(values: number[], toPx: (v: number) => number, minGap = 14) {
  const kept: number[] = []
  const byPriority = [...values].sort((a, b) =>
    a === 0 ? -1 : b === 0 ? 1 : Math.abs(b) - Math.abs(a),
  )
  for (const v of byPriority) {
    if (kept.every(k => Math.abs(toPx(k) - toPx(v)) >= minGap)) {
      kept.push(v)
    }
  }
  return kept.sort((a, b) => a - b)
}

function formatTick(value: number) {
  // Round first: a log tick's raw value comes back as 999999.99..., which
  // would otherwise print as 1000k rather than 1M.
  const n = +value.toPrecision(3)
  const abs = Math.abs(n)
  const [div, suffix] =
    abs >= 1e9 ? [1e9, 'G'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'k'] : [1, '']
  return `${+(n / div).toPrecision(3)}${suffix}`
}
