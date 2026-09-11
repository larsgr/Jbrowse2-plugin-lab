import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import { SimpleFeature } from '@jbrowse/core/util'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { merge } from 'rxjs'
import { map } from 'rxjs/operators'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter/BaseOptions'
import type { Feature } from '@jbrowse/core/util'
import type { Region } from '@jbrowse/core/util/types'

interface StrandedSubAdapter {
  dataAdapter: BaseFeatureDataAdapter
  source: string
  strand: 1 | -1
  /** multiplied into every score: -1 flips the reverse strand below the axis */
  scale: 1 | -1
}

/**
 * Reads a forward/reverse pair of BigWig files as a single quantitative track.
 *
 * The only real work here is negating the reverse strand. Everything that
 * makes the result look like a stranded coverage plot is already in JBrowse's
 * wiggle stack and comes along for free once the scores have the right sign:
 *
 *   - XYPlotRenderer draws negative scores downward from the origin, which is
 *     the "upside down" half of the request.
 *   - getColorCallback splits at `bicolorPivotValue` (0 by default), so the
 *     negated strand picks up `negColor` instead of `posColor`.
 *   - BaseFeatureDataAdapter derives quantitative stats by scanning
 *     getFeatures, so autoscale sees the negated values and produces a domain
 *     spanning both strands. That is why this class deliberately does NOT
 *     implement getRegionQuantitativeStats: doing so would mean re-deriving
 *     (and re-signing) numbers the base class already gets right.
 */
export default class StrandedBigWigAdapter extends BaseFeatureDataAdapter {
  // No 'hasGlobalStats': global autoscale would need getGlobalStats, which the
  // base class can't synthesise. Local autoscale (the default) works from the
  // feature scan above. Claiming the capability without implementing it would
  // make 'global' autoscale silently return nothing.
  static capabilities = ['hasResolution', 'hasLocalStats']

  private adaptersP?: Promise<StrandedSubAdapter[]>

  private async getAdapters() {
    // Cache the promise, not the result: getFeatures can be re-entered before
    // the first call resolves, and building the subadapters twice would defeat
    // JBrowse's adapter cache and double the BigWig header requests.
    this.adaptersP ??= this.getAdaptersImpl()
    return this.adaptersP
  }

  private async getAdaptersImpl(): Promise<StrandedSubAdapter[]> {
    const { getSubAdapter } = this
    if (!getSubAdapter) {
      throw new Error('StrandedBigWigAdapter: no getSubAdapter available')
    }
    const negate = this.getConf('negateReverse') as boolean
    const specs = [
      {
        location: this.getConf('forwardBigWigLocation'),
        source: 'forward',
        strand: 1 as const,
        scale: 1 as const,
      },
      {
        location: this.getConf('reverseBigWigLocation'),
        source: 'reverse',
        strand: -1 as const,
        scale: (negate ? -1 : 1) as 1 | -1,
      },
    ]

    return Promise.all(
      specs.map(async spec => {
        const { dataAdapter } = await getSubAdapter({
          type: 'BigWigAdapter',
          bigWigLocation: spec.location,
        })
        return {
          dataAdapter: dataAdapter as BaseFeatureDataAdapter,
          source: spec.source,
          strand: spec.strand,
          scale: spec.scale,
        }
      }),
    )
  }

  async getRefNames(opts?: BaseOptions) {
    const adapters = await this.getAdapters()
    const names = await Promise.all(
      adapters.map(a => a.dataAdapter.getRefNames(opts)),
    )
    return [...new Set(names.flat())]
  }

  getFeatures(region: Region, opts: BaseOptions = {}) {
    return ObservableCreate<Feature>(async observer => {
      const adapters = await this.getAdapters()
      merge(
        ...adapters.map(({ dataAdapter, source, strand, scale }) =>
          dataAdapter.getFeatures(region, opts).pipe(
            map(feature => {
              const data = feature.toJSON()
              return new SimpleFeature({
                ...data,
                // Both BigWigs number their features independently, so their
                // ids collide. Renderers key off uniqueId, and colliding ids
                // make one strand overwrite the other.
                uniqueId: `${source}-${feature.id()}`,
                source,
                strand,
                score: (data.score as number) * scale,
                // Zoomed out far enough, BigWigAdapter stops returning raw
                // values and returns summary bins carrying minScore/maxScore.
                // drawXY reads those two fields directly - in the default
                // 'whiskers' mode they are what it draws - so negating only
                // `score` leaves the reverse strand's whiskers positive and it
                // renders ABOVE the axis in posColor. The bug is invisible at
                // high zoom, where there is no summary and `score` is all the
                // renderer has.
                //
                // Negating an interval also reverses it: [min, max] becomes
                // [-max, -min]. Swapping is not cosmetic - without it minScore
                // would exceed maxScore and the whisker would be drawn upside
                // down.
                ...(data.summary && scale === -1
                  ? {
                      minScore: -(data.maxScore as number),
                      maxScore: -(data.minScore as number),
                    }
                  : {}),
              })
            }),
          ),
        ),
      ).subscribe(observer)
    }, opts.stopToken)
  }

  /**
   * Quantitative adapters report zero feature density, matching BigWigAdapter
   * and MultiWiggleAdapter.
   *
   * The base class estimates density by counting features in a sample region.
   * For a BigWig that count is enormous at low zoom, so the display trips its
   * "too many features" guard and shows "Zoom in to see features or force
   * load" instead of drawing. That guard exists to stop a track from rendering
   * a million glyphs; a wiggle draws fixed-width summary bins regardless of
   * how many underlying points there are, so it does not apply.
   */
  async getMultiRegionFeatureDensityStats() {
    return { featureDensity: 0 }
  }

  freeResources(): void {}
}
