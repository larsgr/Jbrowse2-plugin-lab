import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import { SimpleFeature } from '@jbrowse/core/util'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { merge } from 'rxjs'
import { map } from 'rxjs/operators'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter/BaseOptions'
import type { Feature } from '@jbrowse/core/util'
import type { Region } from '@jbrowse/core/util/types'
import { transformScore, type StrandedScale } from './scale'

interface StrandedSubAdapter {
  dataAdapter: BaseFeatureDataAdapter
  source: string
  strand: 1 | -1
  /** multiplied into every score: -1 flips the reverse strand below the axis */
  sign: 1 | -1
}

/**
 * Render and stats requests carry the display's props as their options, which
 * is how the display's scale setting reaches the adapter. Transforming here
 * rather than in the renderer keeps autoscale honest: the stats are computed
 * from the same values that are drawn.
 */
type StrandedOptions = BaseOptions & { strandedScale?: StrandedScale }

/**
 * Reads a forward/reverse pair of BigWig files as a single quantitative track.
 *
 * The adapter owns the data side of a stranded plot: it negates the reverse
 * strand, applies the display's value transform (see `scale.ts`), and tags
 * every feature with its strand. Drawing is left to StrandedXYPlotRenderer.
 *
 * The stock XYPlotRenderer is not enough on its own. Its whiskers pass shares
 * one color cache across all features, and the two files' features arrive
 * interleaved, so reverse-strand colors bleed into forward-strand bars when
 * both strands have signal at the same position. It also keeps one feature
 * per pixel for the tooltip, so hovering reports whichever strand came first.
 *
 * BaseFeatureDataAdapter derives quantitative stats by scanning getFeatures,
 * so autoscale sees the negated, transformed values and produces a domain
 * spanning both strands. That is why this class deliberately does NOT
 * implement getRegionQuantitativeStats: doing so would mean re-deriving (and
 * re-signing) numbers the base class already gets right.
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
        sign: 1 as const,
      },
      {
        location: this.getConf('reverseBigWigLocation'),
        source: 'reverse',
        strand: -1 as const,
        sign: (negate ? -1 : 1) as 1 | -1,
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
          sign: spec.sign,
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

  getFeatures(region: Region, opts: StrandedOptions = {}) {
    const scale = opts.strandedScale ?? 'linear'
    return ObservableCreate<Feature>(async observer => {
      const adapters = await this.getAdapters()
      merge(
        ...adapters.map(({ dataAdapter, source, strand, sign }) =>
          dataAdapter.getFeatures(region, opts).pipe(
            map(feature => {
              const data = feature.toJSON()
              const score = data.score as number
              const plot = (v: number) => transformScore(v * sign, scale)
              return new SimpleFeature({
                ...data,
                // Both BigWigs number their features independently, so their
                // ids collide. Renderers key off uniqueId, and colliding ids
                // make one strand overwrite the other.
                uniqueId: `${source}-${feature.id()}`,
                source,
                // StrandedXYPlotRenderer draws each strand in its own pass and
                // the tooltip reports them side by side; both key off this.
                strand,
                score: plot(score),
                // The values as stored in the file, before the sign flip and
                // the log transform, so the tooltip can report real coverage.
                rawScore: score,
                // Zoomed out far enough, BigWigAdapter stops returning raw
                // values and returns summary bins carrying minScore/maxScore,
                // which the renderer draws as whiskers. Every field it reads
                // has to be transformed, not just `score`.
                //
                // Negating an interval also reverses it: [min, max] becomes
                // [-max, -min]. Swapping is not cosmetic - without it minScore
                // would exceed maxScore and the whisker would be drawn upside
                // down. The log transform is monotonic, so it keeps the order.
                ...(data.summary
                  ? {
                      rawMinScore: data.minScore,
                      rawMaxScore: data.maxScore,
                      minScore: plot(
                        (sign === 1 ? data.minScore : data.maxScore) as number,
                      ),
                      maxScore: plot(
                        (sign === 1 ? data.maxScore : data.minScore) as number,
                      ),
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
   * Stats are derived from getFeatures by the base class, so they already
   * come back in the scale that was requested. The scale is echoed back so
   * the display can tell stats computed for the old scale from the new ones
   * and hold off drawing until the domain matches the data.
   */
  async getMultiRegionQuantitativeStats(
    regions: Region[] = [],
    opts: StrandedOptions = {},
  ) {
    const stats = await super.getMultiRegionQuantitativeStats(regions, opts)
    return { ...stats, strandedScale: opts.strandedScale ?? 'linear' }
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
