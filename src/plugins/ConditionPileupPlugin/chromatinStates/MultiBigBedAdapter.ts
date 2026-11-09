import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import { SimpleFeature } from '@jbrowse/core/util'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import { merge } from 'rxjs'
import { map } from 'rxjs/operators'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter/BaseOptions'
import type { Feature } from '@jbrowse/core/util'
import type { Region } from '@jbrowse/core/util/types'
import type { ConditionConfig } from '../shared/conditions'

/**
 * Reads one BigBed per condition - e.g. a ChromHMM segmentation per tissue -
 * as a single feature track.
 *
 * Each file is read by a stock BigBedAdapter built with getSubAdapter, so the
 * BED parsing (autoSql, itemRgb, ...) is JBrowse's own; this class only merges
 * the streams and tags every feature with the index and name of the condition
 * it came from. The renderer groups by `condition`.
 */
export default class MultiBigBedAdapter extends BaseFeatureDataAdapter {
  private adaptersP?: Promise<BaseFeatureDataAdapter[]>

  private get conditions() {
    return (this.getConf('conditions') ?? []) as ConditionConfig[]
  }

  private getAdapters() {
    // Cache the promise, not the result: getFeatures can be re-entered before
    // the first build resolves.
    this.adaptersP ??= Promise.all(
      this.conditions.map(async (condition, i) => {
        if (!condition.bigBedLocation) {
          throw new Error(
            `MultiBigBedAdapter: condition ${i} (${condition.name}) has no bigBedLocation`,
          )
        }
        if (!this.getSubAdapter) {
          throw new Error('MultiBigBedAdapter: no getSubAdapter available')
        }
        const { dataAdapter } = await this.getSubAdapter({
          type: 'BigBedAdapter',
          bigBedLocation: condition.bigBedLocation,
        })
        return dataAdapter as BaseFeatureDataAdapter
      }),
    ).catch((e: unknown) => {
      this.adaptersP = undefined
      throw e
    })
    return this.adaptersP
  }

  async getRefNames(opts?: BaseOptions) {
    const adapters = await this.getAdapters()
    const names = await Promise.all(adapters.map(a => a.getRefNames(opts)))
    return [...new Set(names.flat())]
  }

  getFeatures(region: Region, opts: BaseOptions = {}) {
    const names = this.conditions.map(c => c.name)
    return ObservableCreate<Feature>(async observer => {
      const adapters = await this.getAdapters()
      merge(
        ...adapters.map((adapter, condition) =>
          adapter.getFeatures(region, opts).pipe(
            map(
              feature =>
                new SimpleFeature({
                  ...feature.toJSON(),
                  // Every file numbers its features independently.
                  uniqueId: `${condition}-${feature.id()}`,
                  condition,
                  source: names[condition],
                }),
            ),
          ),
        ),
      ).subscribe(observer)
    }, opts.stopToken)
  }

  freeResources(): void {}
}
