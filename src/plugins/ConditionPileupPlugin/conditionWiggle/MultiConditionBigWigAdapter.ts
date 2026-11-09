import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import { SimpleFeature } from '@jbrowse/core/util'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { firstValueFrom, merge } from 'rxjs'
import { map, toArray } from 'rxjs/operators'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter/BaseOptions'
import type { Feature } from '@jbrowse/core/util'
import type { FileLocation, Region } from '@jbrowse/core/util/types'
import type { ConditionConfig } from '../shared/conditions'
import { rasterStats, rasterizeWiggle, type SummaryMode } from './rasterize'

interface SubAdapter {
  adapter: BaseFeatureDataAdapter
  condition: number
  /** 1 forward, -1 reverse, 0 unstranded */
  strand: 1 | -1 | 0
  scale: number
}

type Options = BaseOptions & { bpPerPx?: number; summaryMode?: SummaryMode }

/**
 * Reads BigWigs for many conditions as one quantitative track: a
 * forward/reverse pair per condition (stranded RNA-seq) or a single file
 * (ChIP-seq, ATAC-seq), or a mix of both.
 *
 * Each file is read by a stock BigWigAdapter built with getSubAdapter. Every
 * feature comes out tagged with its `condition` and `strand` and carrying a
 * non-negative magnitude: the renderer decides which side of the axis a
 * strand goes on, so reverse-strand files are accepted whether they store
 * their coverage as positive or negative numbers.
 */
export default class MultiConditionBigWigAdapter extends BaseFeatureDataAdapter {
  // No 'hasGlobalStats': there is no cheap way to get a whole-genome stacked
  // maximum, and claiming it would make 'global' autoscale silently fail.
  static capabilities = ['hasResolution', 'hasLocalStats']

  private subsP?: Promise<SubAdapter[]>

  private get conditions() {
    return (this.getConf('conditions') ?? []) as ConditionConfig[]
  }

  private getSubAdapters() {
    // Cache the promise, not the result: getFeatures can be re-entered before
    // the first build resolves.
    this.subsP ??= Promise.all(
      this.conditions.flatMap((c, condition) => {
        const files: [FileLocation | undefined, 1 | -1 | 0][] =
          c.forwardBigWigLocation || c.reverseBigWigLocation
            ? [
                [c.forwardBigWigLocation, 1],
                [c.reverseBigWigLocation, -1],
              ]
            : [[c.bigWigLocation, 0]]
        return files.map(async ([location, strand]) => {
          if (!location) {
            throw new Error(
              `MultiConditionBigWigAdapter: condition ${condition} (${c.name}) ` +
                'needs bigWigLocation, or both forwardBigWigLocation and reverseBigWigLocation',
            )
          }
          if (!this.getSubAdapter) {
            throw new Error('MultiConditionBigWigAdapter: no getSubAdapter')
          }
          const { dataAdapter } = await this.getSubAdapter({
            type: 'BigWigAdapter',
            bigWigLocation: location,
          })
          return {
            adapter: dataAdapter as BaseFeatureDataAdapter,
            condition,
            strand,
            scale: c.scaleFactor ?? 1,
          }
        })
      }),
    ).catch((e: unknown) => {
      this.subsP = undefined
      throw e
    })
    return this.subsP
  }

  async getRefNames(opts?: BaseOptions) {
    const subs = await this.getSubAdapters()
    const names = await Promise.all(subs.map(s => s.adapter.getRefNames(opts)))
    return [...new Set(names.flat())]
  }

  getFeatures(region: Region, opts: Options = {}) {
    return ObservableCreate<Feature>(async observer => {
      const subs = await this.getSubAdapters()
      merge(
        ...subs.map(({ adapter, condition, strand, scale }) => {
          const magnitude = (v: number) =>
            (strand === -1 ? Math.abs(v) : Math.max(0, v)) * scale
          return adapter.getFeatures(region, opts).pipe(
            map(f => {
              const score = f.get('score') as number
              const summary = Boolean(f.get('summary'))
              const lo = summary ? magnitude(f.get('minScore') as number) : 0
              const hi = summary ? magnitude(f.get('maxScore') as number) : 0
              // Built field by field rather than from toJSON(): a zoomed-out
              // view of 40 BigWigs is hundreds of thousands of features.
              return new SimpleFeature({
                // Every file numbers its features independently.
                uniqueId: `${condition}:${strand}:${f.id()}`,
                refName: f.get('refName') as string,
                start: f.get('start') as number,
                end: f.get('end') as number,
                score: magnitude(score),
                rawScore: score,
                condition,
                strand,
                ...(summary
                  ? {
                      summary: true,
                      // A negative-valued reverse file reverses the interval.
                      minScore: Math.min(lo, hi),
                      maxScore: Math.max(lo, hi),
                    }
                  : {}),
              })
            }),
          )
        }),
      ).subscribe(observer)
    }, opts.stopToken)
  }

  /**
   * Autoscale for both halves of the track at once, computed from the same
   * per-pixel resampling the renderer draws (at the view's bpPerPx):
   *
   *   - scoreMin/scoreMax: the largest single condition (reverse negated),
   *     which the stock wiggle machinery turns into the rows' domain, user
   *     min/max and "local ± 3σ" included.
   *   - stackedMin/stackedMax: the largest stacked total per strand, which the
   *     display keeps for the combined pile-up.
   *
   * The base class would scan raw features instead, which can neither stack
   * conditions nor match the renderer's per-column values.
   */
  async getMultiRegionQuantitativeStats(regions: Region[] = [], opts: Options = {}) {
    const mode = opts.summaryMode ?? 'mean'
    const total = { rowFwd: 0, rowRev: 0, stackFwd: 0, stackRev: 0, n: 0, sum: 0, sumSq: 0 }
    let featureCount = 0
    for (const region of regions) {
      const bpPerPx = opts.bpPerPx ?? Math.max(1, (region.end - region.start) / 1000)
      const width = Math.max(1, Math.ceil((region.end - region.start) / bpPerPx))
      const features = await firstValueFrom(
        this.getFeatures(region, opts).pipe(toArray()),
      )
      featureCount += features.length
      const s = rasterStats(
        rasterizeWiggle(features, {
          region,
          bpPerPx,
          width,
          conditionCount: this.conditions.length,
          mode,
        }),
      )
      total.rowFwd = Math.max(total.rowFwd, s.rowFwd)
      total.rowRev = Math.max(total.rowRev, s.rowRev)
      total.stackFwd = Math.max(total.stackFwd, s.stackFwd)
      total.stackRev = Math.max(total.stackRev, s.stackRev)
      total.n += s.n
      total.sum += s.sum
      total.sumSq += s.sumSq
    }
    const mean = total.n ? total.sum / total.n : 0
    const variance = total.n ? total.sumSq / total.n - mean * mean : 0
    return {
      scoreMin: -total.rowRev,
      scoreMax: total.rowFwd,
      scoreMean: mean,
      scoreStdDev: Math.sqrt(Math.max(0, variance)),
      scoreSum: total.sum,
      scoreSumSquares: total.sumSq,
      featureCount,
      featureDensity: 0,
      basesCovered: regions.reduce((acc, r) => acc + r.end - r.start, 0),
      stackedMin: -total.stackRev,
      stackedMax: total.stackFwd,
    }
  }

  /** Quantitative adapters report zero feature density; see BigWigAdapter. */
  async getMultiRegionFeatureDensityStats() {
    return { featureDensity: 0 }
  }

  freeResources(): void {}
}
