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
import { drawStranded, type DrawStrandedProps } from './drawStranded'

type StrandedRenderArgs = RenderArgsDeserialized &
  Omit<DrawStrandedProps, 'features' | 'regions' | 'config'> & {
    statusCallback?: (msg: string) => void
  }

/**
 * Renders a StrandedBigWigAdapter track: forward strand above the axis,
 * reverse strand below it, each drawn independently (see drawStranded).
 *
 * Structurally this mirrors the stock XYPlotRenderer - fetch the features,
 * draw to an abstract canvas (which is also what makes SVG export work), and
 * send back a reduced feature list for mouseover - so it drops into
 * LinearWiggleDisplay's machinery unchanged. The difference is what it draws
 * and which features it sends back: one per pixel column *per strand*.
 */
export default class StrandedXYPlotRenderer extends FeatureRendererType {
  supportsSVG = true

  async render(props: RenderProps) {
    const renderProps = props as unknown as StrandedRenderArgs
    const { sessionId, adapterConfig, regions, bpPerPx, height } = renderProps
    const region = regions[0]!
    const width = (region.end - region.start) / bpPerPx

    const { dataAdapter } = await getAdapter(
      this.pluginManager,
      sessionId,
      adapterConfig,
    )
    // The render props double as the adapter's options, which is how the
    // display's scale setting (`strandedScale`) reaches the adapter.
    const features = await firstValueFrom(
      (dataAdapter as BaseFeatureDataAdapter)
        .getFeatures(region, renderProps)
        .pipe(toArray()),
    )

    const { tooltipFeatures, ...rest } = await renderToAbstractCanvas(
      width,
      height,
      renderProps,
      ctx => drawStranded(ctx, { ...renderProps, features }),
    )
    return rpcResult(
      { ...rest, features: tooltipFeatures, height, width },
      collectTransferables(rest),
    )
  }
}
