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
import { drawConditionWiggle, type DrawWiggleOptions } from './drawConditionWiggle'
import { rasterizeWiggle, type SummaryMode } from './rasterize'

type WiggleRenderArgs = RenderArgsDeserialized &
  Omit<DrawWiggleOptions, 'stacked'> & {
    bpPerPx: number
    height: number
    stackedMax: DrawWiggleOptions['stacked']
    summaryMode: SummaryMode
  }

/**
 * Draws a MultiConditionBigWigAdapter track: stacked pile-up plus optional
 * per-condition rows (see drawConditionWiggle). Like ChromatinStateRenderer,
 * it sends back its per-column raster, which is what the tooltip reads.
 */
export default class ConditionWiggleRenderer extends FeatureRendererType {
  supportsSVG = true

  async render(props: RenderProps) {
    const args = props as unknown as WiggleRenderArgs
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
    const raster = rasterizeWiggle(features, {
      region,
      bpPerPx,
      width,
      conditionCount: layout.rowCount,
      mode: args.summaryMode,
    })

    const rendered = await renderToAbstractCanvas(width, height, args, ctx => {
      drawConditionWiggle(ctx, raster, {
        layout,
        colors: args.colors,
        stranded: args.stranded,
        stacked: args.stackedMax,
        rowMax: args.rowMax,
        rowScale: args.rowScale,
      })
      return {}
    })
    return rpcResult(
      { ...rendered, height, width, values: raster.values },
      collectTransferables(rendered),
    )
  }
}
