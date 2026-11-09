import { getConf } from '@jbrowse/core/configuration'
import type { MenuItem } from '@jbrowse/core/ui'
import { getContainingView, measureText } from '@jbrowse/core/util'
import { types } from '@jbrowse/mobx-state-tree'
import type { IAnyModelType } from '@jbrowse/mobx-state-tree'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import { resolveConditions, type ConditionConfig } from './conditions'
import {
  layoutHeight,
  placeLegend,
  type LegendItem,
  type PileupLayout,
} from './layout'

/**
 * What the mouse is over, set by the block rendering and read by the
 * display's tooltip. `payload` is display-specific: chromatin states hand
 * over state counts, the wiggle hands over per-condition values.
 */
export interface PileupHover {
  refName: string
  /** 0-based bp range covered by the pixel column under the mouse */
  start: number
  end: number
  zone: 'pileup' | 'row'
  row?: number
  payload: unknown
}

const ROW_GAP = 6
const MIN_ROW_HEIGHT = 4
const MAX_ROW_HEIGHT = 200
const MIN_PILEUP_HEIGHT = 20

/**
 * The part both condition-pile-up displays share: a combined pile-up that can
 * be expanded into one row per condition.
 *
 * It is applied to a base model rather than composed in, because it has to
 * win over the base's `height` and `setHeight`: the track's height is derived
 * from the layout (legend + pile-up + rows), and dragging the track's resize
 * handle changes the row height (expanded) or the pile-up height (collapsed)
 * instead of an independent number that the layout would ignore.
 *
 * Config slots it reads, which each display's schema defines: `expanded`,
 * `pileupHeight`, `rowHeight`. The base model reaches us untyped, so `self` is
 * `any` throughout, as in StrandedBigWigPlugin.
 */
export function withPileupLayout(base: IAnyModelType) {
  return (
    base
      .props({
        expandedSetting: types.maybe(types.boolean),
        pileupHeightSetting: types.maybe(types.number),
        rowHeightSetting: types.maybe(types.number),
        showPileupLegendSetting: types.maybe(types.boolean),
      })
      .volatile(() => ({
        pileupHover: undefined as PileupHover | undefined,
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => ({
        /** Conditions as listed in the adapter config, colors resolved. */
        get conditions() {
          const conf = self.adapterConfig as
            | { conditions?: ConditionConfig[] }
            | undefined
          return resolveConditions(conf?.conditions)
        },
        get expanded(): boolean {
          return self.expandedSetting ?? getConf(self, 'expanded')
        },
        get pileupHeight(): number {
          return self.pileupHeightSetting ?? getConf(self, 'pileupHeight')
        },
        get rowHeight(): number {
          return self.rowHeightSetting ?? getConf(self, 'rowHeight')
        },
        get showPileupLegend(): boolean {
          return self.showPileupLegendSetting ?? true
        },
        /** Overridden by each display: what the legend band lists. */
        get pileupLegendItems(): LegendItem[] {
          return []
        },
        /** Overridden by each display: the pile-up's caption lines. */
        get pileupCaption(): string[] {
          return []
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => ({
        get legendLayout() {
          const view = getContainingView(self) as { width: number }
          return placeLegend(
            self.showPileupLegend ? self.pileupLegendItems : [],
            view.width,
            4,
            measureText,
          )
        },
        /**
         * Puts the track name above the track rather than over its top-left
         * corner, where it would cover the legend and the pile-up caption.
         * JBrowse's own multi-row wiggle display does the same.
         */
        get prefersOffset() {
          return true
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => ({
        get pileupLayout(): PileupLayout {
          return {
            top: self.legendLayout.height,
            pileupHeight: self.pileupHeight,
            rowGap: ROW_GAP,
            rowHeight: self.rowHeight,
            expanded: self.expanded,
            rowCount: self.conditions.length,
          }
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => ({
        get height() {
          return layoutHeight(self.pileupLayout)
        },
        pileupMenuItems(): MenuItem[] {
          return [
            {
              label: `Expand ${self.conditions.length} conditions`,
              icon: UnfoldMoreIcon,
              type: 'checkbox',
              checked: self.expanded,
              onClick: () => self.setExpanded(!self.expanded),
            },
            {
              label: 'Row height',
              subMenu: (
                [
                  ['Compact', 10],
                  ['Normal', 20],
                  ['Tall', 40],
                ] as const
              ).map(([label, px]) => ({
                label: `${label} (${px}px)`,
                type: 'radio' as const,
                checked: self.rowHeight === px,
                onClick: () => {
                  self.setRowHeight(px)
                  self.setExpanded(true)
                },
              })),
            },
            {
              label: 'Show legend',
              type: 'checkbox',
              checked: self.showPileupLegend,
              onClick: () => self.setShowPileupLegend(!self.showPileupLegend),
            },
          ]
        },
      }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .actions((self: any) => ({
        setExpanded(expanded: boolean) {
          self.expandedSetting = expanded
        },
        setRowHeight(px: number) {
          self.rowHeightSetting = px
        },
        setShowPileupLegend(show: boolean) {
          self.showPileupLegendSetting = show
        },
        setPileupHover(hover?: PileupHover) {
          self.pileupHover = hover
        },
        setHeight(displayHeight: number) {
          const l: PileupLayout = self.pileupLayout
          if (l.expanded && l.rowCount) {
            const per = (displayHeight - l.top - l.pileupHeight - l.rowGap) /
              l.rowCount
            self.rowHeightSetting = Math.round(
              Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, per)),
            )
          } else {
            self.pileupHeightSetting = Math.round(
              Math.max(MIN_PILEUP_HEIGHT, displayHeight - l.top),
            )
          }
          return self.height
        },
        // Redefined alongside setHeight: the base version calls its own
        // setHeight through `this`, which would bypass the one above.
        resizeHeight(distance: number) {
          const before = self.height
          self.setHeight(before + distance)
          return self.height - before
        },
      }))
  )
}
