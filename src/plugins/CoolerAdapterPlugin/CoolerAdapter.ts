import { BaseFeatureDataAdapter } from '@jbrowse/core/data_adapters/BaseAdapter'
import type { BaseOptions } from '@jbrowse/core/data_adapters/BaseAdapter'
import { updateStatus } from '@jbrowse/core/util'
import { ObservableCreate } from '@jbrowse/core/util/rxjs'
import type { Feature } from '@jbrowse/core/util/simpleFeature'
import type { AugmentedRegion as Region } from '@jbrowse/core/util/types'
import type { Observable } from 'rxjs'
import { openH5File } from 'hdf5-indexed-reader/dist/hdf5-indexed-reader.esm.js'

type H5Group = { keys: string[]; get: (name: string) => Promise<H5Node> }
type H5Dataset = { value: Promise<unknown> }
type H5Node = H5Group | H5Dataset

type CoolerMeta = {
  groupPath: string
  resolutions: number[]
  chromNames: string[]
  chromLengths: number[]
}

type ResolutionIndexes = {
  chromOffsets: number[]
  bin1Offsets: number[]
}

type Pixel = { bin1: number; bin2: number; counts: number }

type BinRange = { start: number; end: number }

function isGroup(node: H5Node): node is H5Group {
  return 'keys' in node
}

function toNumberArray(value: unknown): number[] {
  if (!value || typeof value !== 'object' || !('length' in value)) {
    return []
  }
  return Array.from({ length: Number((value as { length: number }).length) }, (_, i) =>
    Number((value as { [k: number]: unknown })[i]),
  )
}

function toStringArray(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !('length' in value)) {
    return []
  }
  return Array.from({ length: Number((value as { length: number }).length) }, (_, i) =>
    String((value as { [k: number]: unknown })[i]),
  )
}

function parseCoolerUri(uri: string) {
  const [fileUri, groupPathRaw] = uri.split('::')
  const groupPath = groupPathRaw ? (groupPathRaw.startsWith('/') ? groupPathRaw : `/${groupPathRaw}`) : ''
  return { fileUri, groupPath }
}

export default class CoolerAdapter extends BaseFeatureDataAdapter {
  private fileP?: Promise<H5Group>
  private metaP?: Promise<CoolerMeta>
  private indexesByResolution = new Map<number, Promise<ResolutionIndexes>>()

  private async openFile() {
    if (!this.fileP) {
      const location = this.getConf('coolerLocation') as { uri?: string } | undefined
      const uri = location?.uri
      if (!uri) {
        throw new Error('No coolerLocation.uri configured for CoolerAdapter')
      }
      const { fileUri } = parseCoolerUri(uri)
      this.fileP = openH5File({
        url: fileUri,
        fetchSize: 1_000_000,
        maxSize: 20_000_000,
      }) as Promise<H5Group>
    }
    return this.fileP
  }

  private async getMeta(opts?: BaseOptions) {
    if (!this.metaP) {
      this.metaP = this.loadMeta(opts)
    }
    return this.metaP
  }

  private async getGroup(path: string) {
    const file = await this.openFile()
    return file.get(path) as Promise<H5Node>
  }

  private async loadMeta(opts?: BaseOptions): Promise<CoolerMeta> {
    const { statusCallback = () => {} } = opts || {}
    return updateStatus('Loading .mcool metadata', statusCallback, async () => {
      const location = this.getConf('coolerLocation') as { uri?: string } | undefined
      const uri = location?.uri || ''
      const { groupPath } = parseCoolerUri(uri)

      const rootResNode = (await this.getGroup(
        groupPath ? `${groupPath}/resolutions` : '/resolutions',
      ).catch(() => undefined)) as H5Group | undefined

      const resolutions =
        rootResNode && isGroup(rootResNode)
          ? rootResNode.keys
              .filter(k => /^\d+$/.test(k))
              .map(Number)
              .sort((a, b) => a - b)
          : [Number(this.getConf('baseResolution') || 1)]

      const baseResolution = resolutions[0]!
      const collectionPath = rootResNode ? `${groupPath}/resolutions/${baseResolution}` : groupPath

      const chromsGroup = (await this.getGroup(
        collectionPath ? `${collectionPath}/chroms` : '/chroms',
      )) as H5Group

      const chromNames = toStringArray(await (await chromsGroup.get('name') as H5Dataset).value)
      const chromLengths = toNumberArray(await (await chromsGroup.get('length') as H5Dataset).value)

      return { groupPath, resolutions, chromNames, chromLengths }
    })
  }

  private async chooseResolution(bpPerPx: number, opts?: BaseOptions) {
    const { resolutions } = await this.getMeta(opts)
    const resolutionMultiplier = Number(this.getConf('resolutionMultiplier') || 1)
    let chosen = resolutions.at(-1) || 1
    for (let i = resolutions.length - 1; i >= 0; i -= 1) {
      const r = resolutions[i]!
      if (r <= 2 * bpPerPx * resolutionMultiplier) {
        chosen = r
      }
    }
    return chosen
  }

  private async getCollectionPath(resolution: number, opts?: BaseOptions) {
    const { groupPath, resolutions } = await this.getMeta(opts)
    return resolutions.length > 1 ? `${groupPath}/resolutions/${resolution}` : groupPath
  }

  private async getIndexesForResolution(resolution: number, opts?: BaseOptions) {
    const cached = this.indexesByResolution.get(resolution)
    if (cached) {
      return cached
    }

    const promise = (async () => {
      const collectionPath = await this.getCollectionPath(resolution, opts)
      const indexesGroup = (await this.getGroup(
        collectionPath ? `${collectionPath}/indexes` : '/indexes',
      )) as H5Group
      const chromOffsets = toNumberArray(await (await indexesGroup.get('chrom_offset') as H5Dataset).value)
      const bin1Offsets = toNumberArray(await (await indexesGroup.get('bin1_offset') as H5Dataset).value)
      return { chromOffsets, bin1Offsets }
    })()

    this.indexesByResolution.set(resolution, promise)
    return promise
  }

  private getBinRangeForRegion(
    region: Region,
    chromNames: string[],
    chromLengths: number[],
    chromOffsets: number[],
    resolution: number,
  ): BinRange {
    const chrIdx = chromNames.indexOf(region.refName)
    if (chrIdx === -1) {
      return { start: -1, end: -1 }
    }

    const chrBinStart = chromOffsets[chrIdx]!
    const chrBinEnd = chromOffsets[chrIdx + 1]!
    const chrLength = chromLengths[chrIdx]!

    const startBp = Math.max(0, Math.min(region.start, chrLength))
    const endBp = Math.max(startBp, Math.min(region.end, chrLength))

    const localStartBin = Math.floor(startBp / resolution)
    const localEndBin = Math.ceil(endBp / resolution)

    const start = Math.min(chrBinEnd, chrBinStart + localStartBin)
    const end = Math.min(chrBinEnd, chrBinStart + localEndBin)
    return { start, end }
  }

  private async chooseResolutionForRanges(regions: Region[], bpPerPx: number, opts?: BaseOptions) {
    const meta = await this.getMeta(opts)
    const maxPixelsToFetch = Number(this.getConf('maxPixelsToFetch') || 2_000_000)
    let resolution = await this.chooseResolution(bpPerPx, opts)

    while (true) {
      const idx = meta.resolutions.indexOf(resolution)
      const { chromOffsets, bin1Offsets } = await this.getIndexesForResolution(resolution, opts)
      const ranges = regions.map(region =>
        this.getBinRangeForRegion(region, meta.chromNames, meta.chromLengths, chromOffsets, resolution),
      )
      const valid = ranges.filter(r => r.start >= 0 && r.end > r.start)
      if (!valid.length) {
        return { resolution, ranges, bin1Offsets }
      }

      const overallStartBin = Math.min(...valid.map(r => r.start))
      const overallEndBin = Math.max(...valid.map(r => r.end))
      const nnzStart = bin1Offsets[overallStartBin]!
      const nnzEnd = bin1Offsets[overallEndBin]!
      if (nnzEnd - nnzStart <= maxPixelsToFetch || idx === meta.resolutions.length - 1) {
        return { resolution, ranges, bin1Offsets }
      }

      resolution = meta.resolutions[idx + 1]!
    }
  }

  private async readPixelsForRange(
    collectionPath: string,
    startNnz: number,
    endNnzExclusive: number,
  ): Promise<Pixel[]> {
    const pixelsGroup = (await this.getGroup(
      collectionPath ? `${collectionPath}/pixels` : '/pixels',
    )) as H5Group

    const bin1Ids = toNumberArray(await (await pixelsGroup.get('bin1_id') as H5Dataset).value)
    const bin2Ids = toNumberArray(await (await pixelsGroup.get('bin2_id') as H5Dataset).value)
    const countDs = (await pixelsGroup.get('count').catch(async () => pixelsGroup.get('counts'))) as H5Dataset
    const counts = toNumberArray(await countDs.value)

    const out: Pixel[] = []
    for (let i = startNnz; i < endNnzExclusive; i += 1) {
      out.push({ bin1: bin1Ids[i]!, bin2: bin2Ids[i]!, counts: counts[i]! })
    }
    return out
  }

  async getRefNames(opts?: BaseOptions) {
    const { chromNames } = await this.getMeta(opts)
    return chromNames
  }

  async getHeader(opts?: BaseOptions) {
    const { chromNames, chromLengths, resolutions } = await this.getMeta(opts)
    return {
      chromosomes: chromNames.map((name, i) => ({ name, id: i, length: chromLengths[i] })),
      resolutions,
      norms: ['NONE'],
      hasInterChromosomalData: true,
    }
  }

  getFeatures(region: Region, opts: BaseOptions = {}): Observable<Feature> {
    return ObservableCreate(async observer => {
      const { bpPerPx = 1 } = opts
      const { resolution, ranges, bin1Offsets } = await this.chooseResolutionForRanges([region], bpPerPx, opts)
      const [range] = ranges
      if (!range || range.start < 0 || range.end <= range.start) {
        observer.complete()
        return
      }

      const collectionPath = await this.getCollectionPath(resolution, opts)
      const nnzStart = bin1Offsets[range.start]!
      const nnzEnd = bin1Offsets[range.end]!
      const pixels = await this.readPixelsForRange(collectionPath, nnzStart, nnzEnd)
      for (const pixel of pixels) {
        if (pixel.bin2 >= range.start && pixel.bin2 < range.end) {
          observer.next(pixel as unknown as Feature)
        }
      }
      observer.complete()
    }, opts.stopToken) as unknown as Observable<Feature>
  }

  async getMultiRegionContactRecords(regions: Region[], opts: BaseOptions = {}) {
    const { bpPerPx = 1 } = opts
    const { resolution, ranges, bin1Offsets } = await this.chooseResolutionForRanges(regions, bpPerPx, opts)
    const collectionPath = await this.getCollectionPath(resolution, opts)

    const valid = ranges.filter(r => r.start >= 0 && r.end > r.start)
    if (!valid.length) {
      return []
    }

    const overallStartBin = Math.min(...valid.map(r => r.start))
    const overallEndBin = Math.max(...valid.map(r => r.end))

    const nnzStart = bin1Offsets[overallStartBin]!
    const nnzEnd = bin1Offsets[overallEndBin]!
    const pixels = await this.readPixelsForRange(collectionPath, nnzStart, nnzEnd)

    const out: Array<{ bin1: number; bin2: number; counts: number; region1Idx: number; region2Idx: number }> = []
    for (const pixel of pixels) {
      for (let i = 0; i < ranges.length; i += 1) {
        const r1 = ranges[i]!
        if (pixel.bin1 < r1.start || pixel.bin1 >= r1.end) {
          continue
        }
        for (let j = i; j < ranges.length; j += 1) {
          const r2 = ranges[j]!
          if (pixel.bin2 >= r2.start && pixel.bin2 < r2.end) {
            out.push({ ...pixel, region1Idx: i, region2Idx: j })
          }
        }
      }
    }
    return out
  }

  async getMultiRegionFeatureDensityStats() {
    return { featureDensity: 0 }
  }
}
