import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import { updateStatus } from '@jbrowse/core/util'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import type { Observable } from 'rxjs'
import type { Feature } from '@jbrowse/core/util/simpleFeature'
import type { AugmentedRegion as Region } from '@jbrowse/core/util/types'
import { FS, File, ready } from 'h5wasm'

type Chromosome = { id: number; name: string; length: number }
type Bin = { chromId: number; start: number; end: number }
type Pixel = { bin1: number; bin2: number; counts: number }

type CoolerData = {
  chromosomes: Chromosome[]
  resolutions: number[]
  binsByResolution: Map<number, Bin[]>
  pixelsByResolution: Map<number, Pixel[]>
}

type H5DatasetLike = { value?: unknown }
type H5GroupLike = { get: (name: string) => H5DatasetLike | H5GroupLike | null; keys?: () => string[] }

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : Array.from((value as ArrayLike<T>) || [])
}

function asGroup(entity: unknown): H5GroupLike | undefined {
  return entity && typeof entity === 'object' && 'get' in entity
    ? (entity as H5GroupLike)
    : undefined
}

function datasetValue(group: H5GroupLike, name: string) {
  const value = group.get(name)
  return value && typeof value === 'object' && 'value' in value
    ? (value as H5DatasetLike).value
    : undefined
}

export default class CoolerAdapter extends BaseFeatureDataAdapter {
  private dataP?: Promise<CoolerData>

  private async getData(opts?: BaseOptions) {
    if (!this.dataP) {
      this.dataP = this.loadData(opts)
    }
    return this.dataP
  }

  private async loadData(opts?: BaseOptions) {
    const { statusCallback = () => {} } = opts || {}

    return updateStatus('Downloading .mcool file', statusCallback, async () => {
      const location = this.getConf('coolerLocation') as { uri?: string } | undefined
      const uri = location?.uri
      if (!uri) {
        throw new Error('No coolerLocation.uri configured for CoolerAdapter')
      }

      const response = await fetch(uri)
      if (!response.ok) {
        throw new Error(`Failed to fetch ${uri}: ${response.status} ${response.statusText}`)
      }

      await ready
      const buffer = new Uint8Array(await response.arrayBuffer())
      const filename = `/tmp_${Date.now()}_${Math.random().toString(16).slice(2)}.mcool`
      FS!.writeFile(filename, buffer)

      const file = new File(filename, 'r')
      try {
        const chromsGroup =
          asGroup(file.get('/chroms')) ||
          asGroup(file.get('chroms'))
        if (!chromsGroup) {
          throw new Error('Invalid .mcool file: missing /chroms group')
        }

        const chrNames = asArray<string>(datasetValue(chromsGroup, 'name'))
        const chrLengths = asArray<number>(datasetValue(chromsGroup, 'length'))
        if (!chrNames.length || !chrLengths.length) {
          throw new Error('Invalid .mcool file: missing chroms name/length datasets')
        }

        const chromosomes = chrNames.map((name, id) => ({
          id,
          name: String(name),
          length: Number(chrLengths[id]),
        }))

        const resolutionsGroup =
          asGroup(file.get('/resolutions')) ||
          asGroup(file.get('resolutions'))
        const resolutionNames: string[] = resolutionsGroup?.keys
          ? resolutionsGroup.keys().filter((k: string) => /^\d+$/.test(k))
          : []

        const resolutions = (resolutionNames.length
          ? resolutionNames.map(Number).sort((a: number, b: number) => a - b)
          : [0]) as number[]

        const binsByResolution = new Map<number, Bin[]>()
        const pixelsByResolution = new Map<number, Pixel[]>()

        for (const resolution of resolutions) {
          const basePath = resolution === 0 ? '' : `/resolutions/${resolution}`
          const binsGroup =
            asGroup(file.get(`${basePath}/bins`)) ||
            asGroup(file.get('/bins'))
          const pixelsGroup =
            asGroup(file.get(`${basePath}/pixels`)) ||
            asGroup(file.get('/pixels'))
          if (!binsGroup || !pixelsGroup) {
            continue
          }

          const chromIds = asArray<number>(datasetValue(binsGroup, 'chrom'))
          const starts = asArray<number>(datasetValue(binsGroup, 'start'))
          const endsRaw = asArray<number>(datasetValue(binsGroup, 'end'))

          const bins = starts.map((start, i) => ({
            chromId: Number(chromIds[i]),
            start: Number(start),
            end: Number(endsRaw[i] ?? start + (resolution || 1)),
          }))

          const bin1Ids = asArray<number>(datasetValue(pixelsGroup, 'bin1_id'))
          const bin2Ids = asArray<number>(datasetValue(pixelsGroup, 'bin2_id'))
          const counts = asArray<number>(
            datasetValue(pixelsGroup, 'count') ?? datasetValue(pixelsGroup, 'counts'),
          )

          const pixels = counts.map((count, i) => ({
            bin1: Number(bin1Ids[i]),
            bin2: Number(bin2Ids[i]),
            counts: Number(count),
          }))

          binsByResolution.set(resolution, bins)
          pixelsByResolution.set(resolution, pixels)
        }

        return { chromosomes, resolutions, binsByResolution, pixelsByResolution }
      } finally {
        file.close()
        FS!.unlink(filename)
      }
    })
  }

  async getRefNames(opts?: BaseOptions) {
    const { chromosomes } = await this.getData(opts)
    return chromosomes.map(c => c.name)
  }

  async getHeader(opts?: BaseOptions) {
    const { chromosomes, resolutions } = await this.getData(opts)
    return { chromosomes, resolutions, norms: ['NONE'], hasInterChromosomalData: true }
  }

  private async chooseResolution(requestedBpPerPx: number, opts?: BaseOptions) {
    const { resolutions } = await this.getData(opts)
    const resolutionMultiplier = Number(this.getConf('resolutionMultiplier') || 1)
    let chosen = resolutions.at(-1) || 0
    for (let i = resolutions.length - 1; i >= 0; i -= 1) {
      const r = resolutions[i]!
      if (r <= 2 * requestedBpPerPx * resolutionMultiplier) {
        chosen = r
      }
    }
    return chosen
  }

  getFeatures(region: Region, opts: BaseOptions = {}): Observable<Feature> {
    return ObservableCreate(async observer => {
      const { bpPerPx = 1, statusCallback = () => {} } = opts
      const chosenResolution = await this.chooseResolution(bpPerPx / 1000, opts)
      const { chromosomes, binsByResolution, pixelsByResolution } = await this.getData(opts)
      const chr = chromosomes.find(c => c.name === region.refName)
      if (!chr) {
        observer.complete()
        return
      }

      const bins = binsByResolution.get(chosenResolution) || []
      const pixels = pixelsByResolution.get(chosenResolution) || []
      const visibleBins = new Set<number>()
      bins.forEach((bin, idx) => {
        if (bin.chromId === chr.id && bin.end > region.start && bin.start < region.end) {
          visibleBins.add(idx)
        }
      })

      await updateStatus('Reading .mcool data', statusCallback, async () => {
        for (const pixel of pixels) {
          if (visibleBins.has(pixel.bin1) && visibleBins.has(pixel.bin2)) {
            observer.next(pixel as unknown as Feature)
          }
        }
      })
      observer.complete()
    }, opts.stopToken) as unknown as Observable<Feature>
  }

  async getMultiRegionContactRecords(regions: Region[], opts: BaseOptions = {}) {
    const { bpPerPx = 1 } = opts
    const chosenResolution = await this.chooseResolution(bpPerPx / 1000, opts)
    const { chromosomes, binsByResolution, pixelsByResolution } = await this.getData(opts)
    const bins = binsByResolution.get(chosenResolution) || []
    const pixels = pixelsByResolution.get(chosenResolution) || []

    const binsPerRegion = regions.map(region => {
      const chr = chromosomes.find(c => c.name === region.refName)
      const set = new Set<number>()
      if (!chr) {
        return set
      }
      bins.forEach((bin, idx) => {
        if (bin.chromId === chr.id && bin.end > region.start && bin.start < region.end) {
          set.add(idx)
        }
      })
      return set
    })

    const records: Array<{ bin1: number; bin2: number; counts: number; region1Idx: number; region2Idx: number }> = []
    for (const pixel of pixels) {
      for (let i = 0; i < binsPerRegion.length; i += 1) {
        if (!binsPerRegion[i]!.has(pixel.bin1)) {
          continue
        }
        for (let j = i; j < binsPerRegion.length; j += 1) {
          if (binsPerRegion[j]!.has(pixel.bin2)) {
            records.push({ ...pixel, region1Idx: i, region2Idx: j })
          }
        }
      }
    }

    return records
  }

  async getMultiRegionFeatureDensityStats() {
    return { featureDensity: 0 }
  }
}
