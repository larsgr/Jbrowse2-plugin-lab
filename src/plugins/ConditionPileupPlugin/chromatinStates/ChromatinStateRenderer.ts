import FeatureRendererType from '@jbrowse/core/pluggableElementTypes/renderers/FeatureRendererType'
import { getAdapter } from '@jbrowse/core/data_adapters/dataAdapterCache'
import { renderToAbstractCanvas } from '@jbrowse/core/util/offscreenCanvasUtils'
import { rpcResult } from '@jbrowse/core/util/librpc'
import { collectTransferables } from '@jbrowse/core/util/offscreenCanvasPonyfill'
import { firstValueFrom } from 'rxjs'
import { toArray } from 'rxjs/operators'
import type { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { RenderArgsDeserialized } from '@jbrowse/core/pluggableElementTypes/renderers/FeatureRendererType'
import type { RenderProps } from '@jbrowse/core/pluggableElementTypes/renderers/RendererType'
import type { PileupLayout } from '../shared/layout'
import { drawChromatinStates } from './drawChromatinStates'
import { rasterizeStates } from './rasterize'
import { buildStateTable, type StateDef } from './states'

export type ChromatinRenderArgs = RenderArgsDeserialized & {
  bpPerPx: number
  height: number
  layout: PileupLayout
  states: StateDef[]
  backgroundStates: string[]
}

/**
 * Draws a MultiBigBedAdapter track as a chromatin-state pile-up.
 *
 * Besides the image it sends back the per-column raster (one state per
 * condition per pixel) and the state table it was drawn with, which is all
 * the block component needs to answer hovers locally.
 */
export default class ChromatinStateRenderer extends FeatureRendererType {
  supportsSVG = true

  async render(props: RenderProps) {
    const args = props as unknown as ChromatinRenderArgs
    const { sessionId, adapterConfig, regions, bpPerPx, height, layout } = args
    const region = regions[0]!
    const width = Math.max(1, Math.ceil((region.end - region.start) / bpPerPx))

    const { dataAdapter } = await getAdapter(
      this.pluginManager,
      sessionId,
      adapterConfig,
    )
    const features = await firstValueFrom(
      (dataAdapter as BaseFeatureDataAdapter)
        .getFeatures(region, args)
        .pipe(toArray()),
    )
    const table = buildStateTable(args.states, args.backgroundStates, features)
    const raster = rasterizeStates(features, {
      region,
      bpPerPx,
      width,
      conditionCount: layout.rowCount,
      stateCount: table.names.length,
      stateOf: f => table.index.get(String(f.get('name') ?? '')) ?? -1,
    })

    const rendered = await renderToAbstractCanvas(width, height, args, ctx => {
      drawChromatinStates(ctx, raster, table.colors, layout)
      return {}
    })
    return rpcResult(
      {
        ...rendered,
        height,
        width,
        dominant: raster.dominant,
        stateNames: table.names,
        stateColors: table.colors,
      },
      collectTransferables(rendered),
    )
  }
}
