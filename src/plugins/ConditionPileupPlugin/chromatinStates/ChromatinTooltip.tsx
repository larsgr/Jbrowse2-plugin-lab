import { observer } from 'mobx-react'
import type { Condition } from '../shared/conditions'
import type { PileupHover } from '../shared/pileupMixin'
import { locString } from '../shared/format'
import { Swatch, TooltipFrame } from '../shared/TooltipFrame'
import type { ChromatinPayload } from './ChromatinStateRendering'

const MAX_NAMES = 6

function names(conditions: Condition[], indices: number[]) {
  const shown = indices.slice(0, MAX_NAMES).map(i => conditions[i]?.name)
  const rest = indices.length - shown.length
  return shown.join(', ') + (rest > 0 ? `, +${rest} more` : '')
}

/**
 * Over the pile-up: every state at that position with how many conditions
 * are in it, and which. Over a row: that condition's state.
 */
const ChromatinTooltip = observer(function ChromatinTooltip({
  model,
  height,
  clientMouseCoord,
  offsetMouseCoord,
}: {
  model: { pileupHover?: PileupHover; conditions: Condition[] }
  height: number
  clientMouseCoord: [number, number]
  offsetMouseCoord: [number, number]
}) {
  const hover = model.pileupHover
  if (!hover) {
    return null
  }
  const { states } = hover.payload as ChromatinPayload
  const { conditions } = model
  const row = hover.row !== undefined ? conditions[hover.row] : undefined
  return (
    <TooltipFrame
      height={height}
      clientMouseCoord={clientMouseCoord}
      offsetMouseCoord={offsetMouseCoord}
    >
      <div>{locString(hover)}</div>
      {row ? (
        <>
          <div>
            <Swatch color={row.color} />
            <strong>{row.name}</strong>
          </div>
          <div>
            {states[0] ? (
              <>
                <Swatch color={states[0].color} />
                {states[0].name}
              </>
            ) : (
              <span style={{ opacity: 0.75 }}>background state</span>
            )}
          </div>
        </>
      ) : states.length ? (
        <table style={{ borderCollapse: 'collapse', fontSize: 'inherit' }}>
          <tbody>
            {states.map(s => (
              <tr key={s.name} style={{ verticalAlign: 'top' }}>
                <td style={{ whiteSpace: 'nowrap', paddingRight: 6 }}>
                  <Swatch color={s.color} />
                  {s.name}
                </td>
                <td style={{ paddingRight: 6, textAlign: 'right' }}>
                  {s.conditions.length}/{conditions.length}
                </td>
                <td style={{ opacity: 0.8 }}>{names(conditions, s.conditions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ opacity: 0.75 }}>
          No condition has a non-background state here
        </div>
      )}
    </TooltipFrame>
  )
})

export default ChromatinTooltip
