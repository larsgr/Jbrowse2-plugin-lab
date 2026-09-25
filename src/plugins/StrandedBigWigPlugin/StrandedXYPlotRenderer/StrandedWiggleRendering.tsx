import { useRef } from 'react'
import { PrerenderedCanvas } from '@jbrowse/core/ui'
import { getSession } from '@jbrowse/core/util'
import { observer } from 'mobx-react'
import type { Feature } from '@jbrowse/core/util'
import type { Region } from '@jbrowse/core/util/types'
import type { StrandedHover } from '../LinearStrandedWiggleDisplay/model'

interface HoverTarget {
  setStrandedHover: (hover?: StrandedHover) => void
  setFeatureIdUnderMouse: (id?: string) => void
  selectFeatureById: (id: string) => Promise<void>
}

/**
 * The block component for StrandedXYPlotRenderer. It draws the prerendered
 * canvas exactly as the stock WiggleRendering does; what differs is the
 * mouseover. The stock one reports the first feature under the cursor, which
 * on a stranded track is whichever strand happened to come first. This one
 * looks up both strands and hands the pair to the display for its tooltip.
 */
const StrandedWiggleRendering = observer(function StrandedWiggleRendering(
  props: {
    regions: Region[]
    features: Map<string, Feature>
    bpPerPx: number
    width: number
    height: number
    displayModel?: HoverTarget
  } & React.ComponentProps<typeof PrerenderedCanvas>,
) {
  const { regions, features, bpPerPx, width, height, displayModel } = props
  const region = regions[0]!
  const ref = useRef<HTMLDivElement>(null)

  function featuresAt(clientX: number) {
    const left = ref.current?.getBoundingClientRect().left ?? 0
    const px = region.reversed ? width - (clientX - left) : clientX - left
    const bp = region.start + bpPerPx * px
    // Per strand, the feature closest to the cursor, allowing a pixel of
    // slack so a feature narrower than a pixel still owns the pixel it is
    // drawn in. Taking the first match instead would report a neighbouring
    // bin up to a pixel's worth of bp away when zoomed out.
    const best: Record<'1' | '-1', { f?: Feature; d: number }> = {
      '1': { d: Infinity },
      '-1': { d: Infinity },
    }
    for (const f of features.values()) {
      const start = f.get('start') as number
      const end = f.get('end') as number
      const d = bp < start ? start - bp : bp > end ? bp - end : 0
      const slot = best[f.get('strand') === -1 ? '-1' : '1']
      if (d <= bpPerPx && d < slot.d) {
        slot.f = f
        slot.d = d
      }
    }
    const forward = best['1'].f
    const reverse = best['-1'].f
    return { bp, forward, reverse, id: (forward ?? reverse)?.id() }
  }

  return (
    <div
      ref={ref}
      data-testid="stranded-wiggle-rendering"
      onMouseMove={e => {
        const { bp, forward, reverse, id } = featuresAt(e.clientX)
        displayModel?.setStrandedHover({
          refName: region.refName,
          position: Math.floor(bp),
          forward: forward?.toJSON(),
          reverse: reverse?.toJSON(),
        })
        displayModel?.setFeatureIdUnderMouse(id)
      }}
      onMouseLeave={() => {
        displayModel?.setStrandedHover(undefined)
        displayModel?.setFeatureIdUnderMouse(undefined)
      }}
      onClick={e => {
        const { id } = featuresAt(e.clientX)
        if (id && displayModel) {
          displayModel.selectFeatureById(id).catch((err: unknown) => {
            console.error(err)
            getSession(displayModel).notifyError(`${err}`, err)
          })
        }
      }}
      style={{ overflow: 'visible', position: 'relative', height }}
    >
      <PrerenderedCanvas {...props} />
    </div>
  )
})

export default StrandedWiggleRendering
