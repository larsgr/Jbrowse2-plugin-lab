import { useRef, type ComponentProps } from 'react'
import { PrerenderedCanvas } from '@jbrowse/core/ui'
import { observer } from 'mobx-react'
import type { Region } from '@jbrowse/core/util/types'
import { zoneAt, type PileupLayout } from './layout'
import type { PileupHover } from './pileupMixin'

export interface PileupBlockProps
  extends ComponentProps<typeof PrerenderedCanvas> {
  regions: Region[]
  bpPerPx: number
  width: number
  height: number
  layout: PileupLayout
  displayModel?: { setPileupHover: (hover?: PileupHover) => void }
}

/**
 * Turns a pixel column + zone into the tooltip payload. Columns are in screen
 * order: the renderers rasterize a reversed region mirrored, so column 0 is
 * always the left edge.
 */
export type Describe<P> = (
  props: P,
  col: number,
  zone: { zone: 'pileup' } | { zone: 'row'; row: number },
) => unknown

/**
 * The block component both pile-up renderers share: the prerendered canvas,
 * plus mouse handling that reports which pixel column and which part of the
 * track (pile-up or a condition row) is under the cursor.
 *
 * The data behind the tooltip is the renderer's own per-column raster, sent
 * back with the image, so hovering never refetches or re-scans features.
 */
function PileupBlockImpl<P extends PileupBlockProps>(
  props: P & { describe: Describe<P> },
) {
  const { regions, bpPerPx, width, layout, displayModel, describe } = props
  const region = regions[0]!
  const ref = useRef<HTMLDivElement>(null)

  function hoverAt(clientX: number, clientY: number): PileupHover | undefined {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) {
      return undefined
    }
    const col = Math.floor(clientX - rect.left)
    const zone = zoneAt(layout, clientY - rect.top)
    if (!zone || col < 0 || col >= width) {
      return undefined
    }
    const payload = describe(props, col, zone)
    if (payload === undefined) {
      return undefined
    }
    const start = region.reversed
      ? region.end - (col + 1) * bpPerPx
      : region.start + col * bpPerPx
    return {
      refName: region.refName,
      start: Math.max(region.start, Math.floor(start)),
      end: Math.min(region.end, Math.ceil(start + bpPerPx)),
      zone: zone.zone,
      row: zone.zone === 'row' ? zone.row : undefined,
      payload,
    }
  }

  return (
    <div
      ref={ref}
      data-testid="pileup-block"
      onMouseMove={e => displayModel?.setPileupHover(hoverAt(e.clientX, e.clientY))}
      onMouseLeave={() => displayModel?.setPileupHover(undefined)}
      style={{ position: 'relative', height: props.height }}
    >
      <PrerenderedCanvas {...props} />
    </div>
  )
}

const PileupBlock = observer(PileupBlockImpl) as typeof PileupBlockImpl

export default PileupBlock
