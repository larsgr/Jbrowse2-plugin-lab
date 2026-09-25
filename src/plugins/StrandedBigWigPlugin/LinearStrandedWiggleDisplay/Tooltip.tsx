import BaseTooltip from '@jbrowse/core/ui/BaseTooltip'
import { toLocale } from '@jbrowse/core/util'
import { observer } from 'mobx-react'
import type { StrandedHover } from './model'
import type { StrandedTooltipFeature } from '../StrandedXYPlotRenderer/drawStranded'

const YSCALEBAR_LABEL_OFFSET = 5

interface TooltipModel {
  strandedHover?: StrandedHover
  strandedScale: 'linear' | 'log2'
  rendererConfig: { posColor: string; negColor: string; color: string }
}

function fmt(n: number) {
  return toLocale(+n.toPrecision(4))
}

function StrandRow({
  label,
  color,
  feature,
}: {
  label: string
  color: string
  feature?: StrandedTooltipFeature
}) {
  return (
    <tr>
      <td style={{ paddingRight: 6, whiteSpace: 'nowrap' }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            marginRight: 4,
            background: color,
            border: '1px solid rgba(255,255,255,0.7)',
          }}
        />
        {label}
      </td>
      {!feature ? (
        <td style={{ opacity: 0.7 }}>no data</td>
      ) : feature.summary ? (
        // Zoomed out, a pixel covers many bases: report the spread, not just
        // the mean, since the whiskers draw all three.
        <td style={{ whiteSpace: 'nowrap' }}>
          {fmt(feature.score)}{' '}
          <span style={{ opacity: 0.75 }}>
            avg ({fmt(feature.minScore)}–{fmt(feature.maxScore)})
          </span>
        </td>
      ) : (
        <td>{fmt(feature.score)}</td>
      )}
    </tr>
  )
}

/**
 * Shows both strands at the position under the mouse. The stock wiggle
 * tooltip takes a single feature, which on a stranded track means whichever
 * strand the renderer happened to keep for that pixel.
 */
const StrandedTooltip = observer(function StrandedTooltip({
  model,
  height,
  clientMouseCoord,
  offsetMouseCoord,
}: {
  model: TooltipModel
  height: number
  clientMouseCoord: [number, number]
  offsetMouseCoord: [number, number]
}) {
  const hover = model.strandedHover
  if (!hover || (!hover.forward && !hover.reverse)) {
    return null
  }
  const { posColor, negColor, color } = model.rendererConfig
  const custom = color !== '#f0f'
  return (
    <>
      <BaseTooltip
        clientPoint={{ x: clientMouseCoord[0] + 5, y: clientMouseCoord[1] }}
      >
        <div data-testid="stranded-tooltip">
          <div>
            {hover.refName}:{toLocale(hover.position + 1)}
          </div>
          <table style={{ borderCollapse: 'collapse', fontSize: 'inherit' }}>
            <tbody>
              <StrandRow
                label="+ strand"
                color={custom ? color : posColor}
                feature={hover.forward as StrandedTooltipFeature | undefined}
              />
              <StrandRow
                label="− strand"
                color={custom ? color : negColor}
                feature={hover.reverse as StrandedTooltipFeature | undefined}
              />
            </tbody>
          </table>
          {model.strandedScale === 'log2' ? (
            <div style={{ opacity: 0.7, marginTop: 2 }}>
              plotted as log2(x+1)
            </div>
          ) : null}
        </div>
      </BaseTooltip>
      <div
        style={{
          position: 'absolute',
          left: offsetMouseCoord[0],
          top: YSCALEBAR_LABEL_OFFSET,
          height: height - YSCALEBAR_LABEL_OFFSET * 2,
          width: 1,
          background: 'currentColor',
          pointerEvents: 'none',
        }}
      />
    </>
  )
})

export default StrandedTooltip
