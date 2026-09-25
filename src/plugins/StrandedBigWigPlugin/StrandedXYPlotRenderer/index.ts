import { lazy } from 'react'
import { ConfigurationSchema } from '@jbrowse/core/configuration'
import type { AnyConfigurationSchemaType } from '@jbrowse/core/configuration'
import type PluginManager from '@jbrowse/core/PluginManager'
import StrandedXYPlotRenderer from './StrandedXYPlotRenderer'

/**
 * Registers StrandedXYPlotRenderer.
 *
 * Its config extends the stock XYPlotRenderer's, so every key a wiggle track
 * already understands (filled, minSize, summaryScoreMode, clipColor, color,
 * posColor/negColor) means the same thing here - posColor is simply the
 * forward strand and negColor the reverse. Only the defaults differ.
 *
 * The base schema comes from WigglePlugin's `exports` rather than an import:
 * @jbrowse/plugin-wiggle is bundled inside @jbrowse/react-app2 and is not
 * resolvable from this project, but the running plugin instance hands out its
 * building blocks to other plugins this way.
 */
export default function registerStrandedXYPlotRenderer(
  pluginManager: PluginManager,
) {
  const { xyPlotRendererConfigSchema } = wigglePluginExports(pluginManager)
  const configSchema = ConfigurationSchema(
    'StrandedXYPlotRenderer',
    {
      posColor: {
        type: 'color',
        description: 'color of the forward (+) strand',
        defaultValue: '#1a7abf',
      },
      negColor: {
        type: 'color',
        description: 'color of the reverse (-) strand',
        defaultValue: '#d1495b',
      },
    },
    { baseConfiguration: xyPlotRendererConfigSchema, explicitlyTyped: true },
  )

  pluginManager.addRendererType(
    () =>
      new StrandedXYPlotRenderer({
        name: 'StrandedXYPlotRenderer',
        ReactComponent: lazy(() => import('./StrandedWiggleRendering')),
        configSchema,
        pluginManager,
      }),
  )
}

export function wigglePluginExports(pluginManager: PluginManager) {
  const wiggle = pluginManager.getPlugin('WigglePlugin') as
    | { exports?: unknown }
    | undefined
  if (!wiggle?.exports) {
    throw new Error('StrandedBigWigPlugin needs the core WigglePlugin')
  }
  return wiggle.exports as {
    xyPlotRendererConfigSchema: AnyConfigurationSchemaType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    linearWiggleDisplayModelFactory: (pm: PluginManager, schema: any) => any
    utils: {
      getScale: (opts: {
        scaleType: string
        domain: number[]
        range: number[]
        inverted?: boolean
      }) => {
        (value: number): number
        domain: () => number[]
        range: () => number[]
        ticks: (count: number) => number[]
      }
    }
  }
}
