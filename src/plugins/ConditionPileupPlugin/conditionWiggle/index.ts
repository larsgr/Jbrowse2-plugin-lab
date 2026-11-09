import { lazy } from 'react'
import { ConfigurationSchema, getConf } from '@jbrowse/core/configuration'
import type { AnyConfigurationSchemaType } from '@jbrowse/core/configuration'
import AdapterType from '@jbrowse/core/pluggableElementTypes/AdapterType'
import DisplayType from '@jbrowse/core/pluggableElementTypes/DisplayType'
import type PluginManager from '@jbrowse/core/PluginManager'
import type { MenuItem } from '@jbrowse/core/ui'
import { types } from '@jbrowse/mobx-state-tree'
import { groupLegend, type ConditionConfig } from '../shared/conditions'
import { formatValue } from '../shared/format'
import { makePileupDisplayComponent } from '../shared/PileupDisplayComponent'
import {
  linearGenomeViewExports,
  wigglePluginExports,
} from '../shared/linearGenomeViewExports'
import { withPileupLayout } from '../shared/pileupMixin'
import ConditionWiggleRenderer from './ConditionWiggleRenderer'
import type { RowScale } from './drawConditionWiggle'
import type { SummaryMode } from './rasterize'

const WiggleTooltip = lazy(() => import('./WiggleTooltip'))

/**
 * Registers the multi-condition wiggle track: MultiConditionBigWigAdapter,
 * ConditionWiggleRenderer, and LinearConditionWiggleDisplay for
 * QuantitativeTracks. One track type covers stranded RNA-seq (a BigWig pair
 * per condition) and unstranded ChIP-seq/ATAC-seq (one BigWig per condition).
 */
export default function registerConditionWiggle(pluginManager: PluginManager) {
  pluginManager.addAdapterType(
    () =>
      new AdapterType({
        name: 'MultiConditionBigWigAdapter',
        displayName: 'BigWig per condition, optionally stranded',
        configSchema: ConfigurationSchema(
          'MultiConditionBigWigAdapter',
          {
            conditions: {
              type: 'frozen',
              description:
                'One entry per condition: { name, group?, color?, scaleFactor?, ' +
                'and either bigWigLocation or forwardBigWigLocation + ' +
                'reverseBigWigLocation }. Rows and stacking follow this order.',
              defaultValue: [],
            },
          },
          { explicitlyTyped: true },
        ),
        getAdapterClass: () =>
          import('./MultiConditionBigWigAdapter').then(m => m.default),
      }),
  )

  // Extends the stock XYPlotRenderer config so the stock wiggle display
  // model's renderer-config plumbing (summary mode, ...) finds its slots.
  const { xyPlotRendererConfigSchema } = wigglePluginExports(pluginManager)
  const rendererConfigSchema = ConfigurationSchema(
    'ConditionWiggleRenderer',
    {},
    { baseConfiguration: xyPlotRendererConfigSchema, explicitlyTyped: true },
  )
  pluginManager.addRendererType(
    () =>
      new ConditionWiggleRenderer({
        name: 'ConditionWiggleRenderer',
        ReactComponent: lazy(() => import('./ConditionWiggleRendering')),
        configSchema: rendererConfigSchema,
        pluginManager,
      }),
  )

  pluginManager.addDisplayType(() => {
    const wiggleDisplay = pluginManager.getDisplayType('LinearWiggleDisplay')
    if (!wiggleDisplay) {
      throw new Error('ConditionPileupPlugin needs the core WigglePlugin')
    }
    const { BaseLinearDisplayComponent } = linearGenomeViewExports(pluginManager)
    const configSchema = ConfigurationSchema(
      'LinearConditionWiggleDisplay',
      {
        renderers: ConfigurationSchema('RenderersConfiguration', {
          ConditionWiggleRenderer: rendererConfigSchema,
        }),
        expanded: {
          type: 'boolean',
          description: 'open with one row per condition under the pile-up',
          defaultValue: false,
        },
        pileupHeight: {
          type: 'number',
          description: 'height of the combined pile-up, in px',
          defaultValue: 80,
        },
        rowHeight: {
          type: 'number',
          description: 'height of each condition row when expanded, in px',
          defaultValue: 24,
        },
        unit: {
          type: 'string',
          description: 'unit of the values, shown in captions and tooltips',
          defaultValue: '',
        },
      },
      { baseConfiguration: wiggleDisplay.configSchema, explicitlyTyped: true },
    )
    return new DisplayType({
      name: 'LinearConditionWiggleDisplay',
      displayName: 'Multi-condition wiggle pile-up',
      configSchema,
      stateModel: modelFactory(pluginManager, configSchema),
      trackType: 'QuantitativeTrack',
      viewType: 'LinearGenomeView',
      ReactComponent: makePileupDisplayComponent(BaseLinearDisplayComponent),
    })
  })
}

/**
 * LinearConditionWiggleDisplay: the stock LinearWiggleDisplay model (stats
 * autorun, autoscale types, min/max, resolution) plus the shared pile-up
 * layout, with the stock single-series assumptions overridden.
 *
 * Two scales are in play. The stock `domain`, computed from the adapter's
 * scoreMin/scoreMax, becomes the rows' shared scale. The adapter also
 * reports stackedMin/stackedMax, kept here as `stackedStats`, for the
 * combined pile-up. The rows' log option is applied when drawing, not in the
 * adapter (unlike StrandedBigWigPlugin), because the pile-up has to add
 * linear values: a sum of logs is not the log of a sum.
 */
function modelFactory(
  pluginManager: PluginManager,
  configSchema: AnyConfigurationSchemaType,
) {
  const { linearWiggleDisplayModelFactory } = wigglePluginExports(pluginManager)
  const base = types.compose(
    'LinearConditionWiggleDisplay',
    linearWiggleDisplayModelFactory(pluginManager, configSchema),
    types.model({ type: types.literal('LinearConditionWiggleDisplay') }),
  )
  return (
    withPileupLayout(base)
      .volatile(() => ({
        stackedStats: undefined as { fwd: number; rev: number } | undefined,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .actions((self: any) => {
        const superUpdateQuantitativeStats = self.updateQuantitativeStats
        return {
          updateQuantitativeStats(
            stats: { stackedMin?: number; stackedMax?: number },
            statsRegion: string,
          ) {
            superUpdateQuantitativeStats(stats, statsRegion)
            const next = {
              fwd: stats.stackedMax ?? 0,
              rev: -(stats.stackedMin ?? 0),
            }
            const prev = self.stackedStats
            if (!prev || prev.fwd !== next.fwd || prev.rev !== next.rev) {
              self.stackedStats = next
            }
          },
        }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => ({
        get rendererTypeName() {
          return 'ConditionWiggleRenderer'
        },
        get TooltipComponent() {
          return WiggleTooltip
        },
        /**
         * What the stock machinery (domain, nice rounding) sees: linear. The
         * user-facing setting is `rowScale`.
         */
        get scaleType() {
          return 'linear'
        },
        get rowScale(): RowScale {
          return (self.scale ?? getConf(self, 'scaleType')) === 'log'
            ? 'log2'
            : 'linear'
        },
        get summaryMode(): SummaryMode {
          return self.summaryScoreModeSetting === 'max' ? 'max' : 'mean'
        },
        get stranded(): boolean {
          const conf = self.adapterConfig as
            | { conditions?: ConditionConfig[] }
            | undefined
          return (conf?.conditions ?? []).some(c => c.reverseBigWigLocation)
        },
        get unit(): string {
          return getConf(self, 'unit') ?? ''
        },
        /** The rows' scale: one maximum for both strands of every row. */
        get rowMax(): number | undefined {
          const d = self.domain as [number, number] | undefined
          return d ? Math.max(Math.abs(d[0]), Math.abs(d[1])) : undefined
        },
        get pileupLegendItems() {
          return groupLegend(self.conditions)
        },
        get pileupCaption() {
          const s = self.stackedStats
          const unit = self.unit ? ` ${self.unit}` : ''
          const lines = ['Combined']
          if (s) {
            lines.push(
              self.stranded
                ? `stacked; + up to ${formatValue(s.fwd)}, − down to ${formatValue(s.rev)}${unit}`
                : `stacked, 0–${formatValue(s.fwd)}${unit}`,
            )
          }
          if (self.expanded && self.rowMax !== undefined) {
            lines.push(
              `rows: ${self.rowScale === 'log2' ? 'log' : 'linear'} scale, 0–${formatValue(self.rowMax)}${unit}`,
            )
          }
          return lines
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => {
        const superAdapterProps = self.adapterProps
        const superRenderProps = self.renderProps
        const superScoreTrackMenuItems = self.scoreTrackMenuItems
        return {
          /** Stats and render requests both pass these to the adapter. */
          adapterProps() {
            return { ...superAdapterProps(), summaryMode: self.summaryMode }
          },
          renderProps() {
            const props = superRenderProps()
            return {
              ...props,
              // The stock ticks carry a function; nothing here reads them.
              ticks: undefined,
              notReady:
                props.notReady ||
                !self.stackedStats ||
                self.rowMax === undefined,
              height: self.height,
              layout: self.pileupLayout,
              colors: self.conditions.map((c: { color: string }) => c.color),
              stranded: self.stranded,
              stackedMax: self.stackedStats,
              rowMax: self.rowMax,
              rowScale: self.rowScale,
              summaryMode: self.summaryMode,
            }
          },
          scoreTrackMenuItems() {
            return (superScoreTrackMenuItems() as MenuItem[]).map(item => {
              if (!('label' in item)) {
                return item
              }
              if (item.label === 'Scale type') {
                return {
                  label: 'Row scale',
                  subMenu: [
                    {
                      label: 'Linear',
                      type: 'radio' as const,
                      checked: self.rowScale === 'linear',
                      onClick: () => self.setScaleType('linear'),
                    },
                    {
                      label: 'Log, log2(x+1)',
                      type: 'radio' as const,
                      checked: self.rowScale === 'log2',
                      onClick: () => self.setScaleType('log'),
                    },
                  ],
                }
              }
              if (item.label === 'Summary score mode') {
                return {
                  label: 'Summary score mode',
                  subMenu: (
                    [
                      ['avg', 'Mean', 'mean'],
                      ['max', 'Max', 'max'],
                    ] as const
                  ).map(([value, label, mode]) => ({
                    label,
                    type: 'radio' as const,
                    checked: self.summaryMode === mode,
                    onClick: () => self.setSummaryScoreMode(value),
                  })),
                }
              }
              return item
            })
          },
          trackMenuItems(): MenuItem[] {
            return [
              // Base items plus the Score submenu (with the overrides above);
              // the stock renderer, color, fill and inversion items assume a
              // single series and are left out.
              ...self.wiggleBaseTrackMenuItems(),
              ...self.pileupMenuItems(),
              {
                label: 'Show tooltips',
                type: 'checkbox',
                checked: self.showTooltipsEnabled,
                onClick: () => self.setShowTooltips(!self.showTooltipsEnabled),
              },
            ]
          },
        }
      })
  )
}
