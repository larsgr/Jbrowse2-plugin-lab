import { observer } from 'mobx-react'
import type { Condition } from '../shared/conditions'
import { formatValue, locString } from '../shared/format'
import type { PileupHover } from '../shared/pileupMixin'
import { Swatch, TooltipFrame } from '../shared/TooltipFrame'
import type { WigglePayload } from './ConditionWiggleRendering'

const MAX_ROWS = 12

/**
 * Over the pile-up: every condition with signal at that position, largest
 * first, with the stacked totals. Over a row: that condition's values.
 */
const WiggleTooltip = observer(function WiggleTooltip({
  model,
  height,
  clientMouseCoord,
  offsetMouseCoord,
}: {
  model: {
    pileupHover?: PileupHover
    conditions: Condition[]
    stranded: boolean
    unit: string
    summaryMode: 'mean' | 'max'
  }
  height: number
  clientMouseCoord: [number, number]
  offsetMouseCoord: [number, number]
}) {
  const hover = model.pileupHover
  if (!hover) {
    return null
  }
  const { values, bpPerPx } = hover.payload as WigglePayload
  const { conditions, stranded, unit } = model
  const sorted = [...values].sort((a, b) => b.fwd + b.rev - (a.fwd + a.rev))
  const shown = hover.zone === 'row' ? sorted : sorted.slice(0, MAX_ROWS)
  const total = values.reduce(
    (acc, v) => ({ fwd: acc.fwd + v.fwd, rev: acc.rev + v.rev }),
    { fwd: 0, rev: 0 },
  )
  const cell = { paddingLeft: 8, textAlign: 'right' as const }
  return (
    <TooltipFrame
      height={height}
      clientMouseCoord={clientMouseCoord}
      offsetMouseCoord={offsetMouseCoord}
    >
      <div>{locString(hover)}</div>
      {shown.length ? (
        <table style={{ borderCollapse: 'collapse', fontSize: 'inherit' }}>
          <thead>
            <tr style={{ opacity: 0.75 }}>
              <th />
              <th style={cell}>{stranded ? '+' : unit || 'value'}</th>
              {stranded ? <th style={cell}>−</th> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map(v => {
              const c = conditions[v.condition]
              return (
                <tr key={v.condition}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Swatch color={c?.color ?? '#888'} />
                    {c?.name}
                  </td>
                  <td style={cell}>{formatValue(v.fwd)}</td>
                  {stranded ? <td style={cell}>{formatValue(v.rev)}</td> : null}
                </tr>
              )
            })}
            {hover.zone === 'pileup' ? (
              <tr style={{ borderTop: '1px solid rgba(255,255,255,0.5)' }}>
                <td>
                  Combined
                  {sorted.length > shown.length
                    ? ` (${sorted.length - shown.length} more)`
                    : ''}
                </td>
                <td style={cell}>{formatValue(total.fwd)}</td>
                {stranded ? <td style={cell}>{formatValue(total.rev)}</td> : null}
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : (
        <div style={{ opacity: 0.75 }}>No signal in any condition here</div>
      )}
      {bpPerPx > 1 || unit ? (
        <div style={{ opacity: 0.7, marginTop: 2 }}>
          {[
            unit,
            bpPerPx > 1
              ? `${model.summaryMode} over ${formatValue(bpPerPx)} bp`
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      ) : null}
    </TooltipFrame>
  )
})

export default WiggleTooltip
