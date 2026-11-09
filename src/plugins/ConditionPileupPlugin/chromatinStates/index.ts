import { lazy } from 'react'
import {
  ConfigurationReference,
  ConfigurationSchema,
  getConf,
} from '@jbrowse/core/configuration'
import type { AnyConfigurationSchemaType } from '@jbrowse/core/configuration'
import AdapterType from '@jbrowse/core/pluggableElementTypes/AdapterType'
import DisplayType from '@jbrowse/core/pluggableElementTypes/DisplayType'
import type PluginManager from '@jbrowse/core/PluginManager'
import type { MenuItem } from '@jbrowse/core/ui'
import { types } from '@jbrowse/mobx-state-tree'
import { makePileupDisplayComponent } from '../shared/PileupDisplayComponent'
import { linearGenomeViewExports } from '../shared/linearGenomeViewExports'
import { withPileupLayout } from '../shared/pileupMixin'
import ChromatinStateRenderer from './ChromatinStateRenderer'
import type { StateDef } from './states'

const ChromatinTooltip = lazy(() => import('./ChromatinTooltip'))

const natural = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true })

/**
 * Registers the chromatin-state track: MultiBigBedAdapter (one BigBed per
 * condition), ChromatinStateRenderer, and LinearChromatinStateDisplay for
 * FeatureTracks.
 */
export default function registerChromatinStates(pluginManager: PluginManager) {
  pluginManager.addAdapterType(
    () =>
      new AdapterType({
        name: 'MultiBigBedAdapter',
        displayName: 'BigBed per condition (e.g. chromatin states)',
        configSchema: ConfigurationSchema(
          'MultiBigBedAdapter',
          {
            conditions: {
              type: 'frozen',
              description:
                'One entry per condition: { name, group?, color?, bigBedLocation }. ' +
                'Rows are drawn in this order.',
              defaultValue: [],
            },
          },
          { explicitlyTyped: true },
        ),
        getAdapterClass: () =>
          import('./MultiBigBedAdapter').then(m => m.default),
      }),
  )

  const rendererConfigSchema = ConfigurationSchema(
    'ChromatinStateRenderer',
    {},
    { explicitlyTyped: true },
  )
  pluginManager.addRendererType(
    () =>
      new ChromatinStateRenderer({
        name: 'ChromatinStateRenderer',
        ReactComponent: lazy(() => import('./ChromatinStateRendering')),
        configSchema: rendererConfigSchema,
        pluginManager,
      }),
  )

  pluginManager.addDisplayType(() => {
    const { BaseLinearDisplay, baseLinearDisplayConfigSchema, BaseLinearDisplayComponent } =
      linearGenomeViewExports(pluginManager)
    const configSchema = ConfigurationSchema(
      'LinearChromatinStateDisplay',
      {
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
          defaultValue: 16,
        },
        states: {
          type: 'frozen',
          description:
            'State palette: [{ name, color, match? }]. Sets legend order, ' +
            'colors and pile-up stacking (first at the bottom). States not ' +
            'listed use the itemRgb color from the file.',
          defaultValue: [],
        },
        backgroundStates: {
          type: 'stringArray',
          description:
            'States that are neither drawn nor counted in the pile-up',
          defaultValue: ['Quiescent'],
        },
        // The base default (0.3 features/px) suits one feature track; a
        // condition track multiplies feature density by its file count, and
        // the renderer reduces everything to one state per condition per
        // pixel, so it can afford far more before zoom-in is required.
        maxFeatureScreenDensity: {
          type: 'number',
          description:
            'features per px (summed over all conditions) above which the track asks to zoom in',
          defaultValue: 60,
        },
      },
      { baseConfiguration: baseLinearDisplayConfigSchema, explicitlyTyped: true },
    )
    return new DisplayType({
      name: 'LinearChromatinStateDisplay',
      displayName: 'Chromatin state pile-up',
      configSchema,
      stateModel: modelFactory(BaseLinearDisplay, configSchema),
      trackType: 'FeatureTrack',
      viewType: 'LinearGenomeView',
      ReactComponent: makePileupDisplayComponent(BaseLinearDisplayComponent),
    })
  })
}

function modelFactory(
  BaseLinearDisplay: Parameters<typeof types.compose>[0],
  configSchema: AnyConfigurationSchemaType,
) {
  const base = types.compose(
    'LinearChromatinStateDisplay',
    BaseLinearDisplay,
    types.model({
      type: types.literal('LinearChromatinStateDisplay'),
      configuration: ConfigurationReference(configSchema),
    }),
  )
  return (
    withPileupLayout(base)
      .volatile(() => ({
        /** states seen in rendered blocks, by name -> color */
        discoveredStates: new Map<string, string>(),
      }))
      .actions(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self: any) => ({
          addDiscoveredStates(names: string[], colors: string[]) {
            const known: Map<string, string> = self.discoveredStates
            if (names.every(n => known.has(n))) {
              return
            }
            const next = new Map(known)
            names.forEach((n, i) => next.set(n, colors[i]!))
            self.discoveredStates = next
          },
        }),
      )
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .views((self: any) => {
        const superRenderProps = self.renderProps
        const superTrackMenuItems = self.trackMenuItems
        return {
          get rendererTypeName() {
            return 'ChromatinStateRenderer'
          },
          get TooltipComponent() {
            return ChromatinTooltip
          },
          get stateDefs(): StateDef[] {
            return getConf(self, 'states') ?? []
          },
          get backgroundStates(): string[] {
            return getConf(self, 'backgroundStates') ?? []
          },
          /**
           * The configured palette, then any state the files contain that it
           * does not cover. Background states are left out: they are not
           * drawn, so a swatch for them would explain nothing on screen.
           */
          get pileupLegendItems() {
            const bg = new Set(self.backgroundStates as string[])
            const defs = (self.stateDefs as StateDef[]).filter(
              d => ![d.name, ...(d.match ?? [])].some(n => bg.has(n)),
            )
            const covered = new Set(
              (self.stateDefs as StateDef[]).flatMap(d => [
                d.name,
                ...(d.match ?? []),
              ]),
            )
            const extra = [...(self.discoveredStates as Map<string, string>)]
              .filter(([n]) => !covered.has(n) && !bg.has(n))
              .sort(([a], [b]) => natural(a, b))
            return [
              ...defs.map(d => ({ label: d.name, color: d.color })),
              ...extra.map(([label, color]) => ({ label, color })),
            ]
          },
          get pileupCaption() {
            return [
              'Combined',
              `conditions per state, 0–${self.conditions.length}`,
            ]
          },
          renderProps() {
            const props = superRenderProps()
            return {
              ...props,
              notReady: props.notReady || !self.conditions.length,
              config: {},
              height: self.height,
              layout: self.pileupLayout,
              states: self.stateDefs,
              backgroundStates: self.backgroundStates,
            }
          },
          trackMenuItems(): MenuItem[] {
            return [
              ...superTrackMenuItems(),
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
