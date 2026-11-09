import { useEffect } from 'react'
import { observer } from 'mobx-react'
import PileupBlock, {
  type Describe,
  type PileupBlockProps,
} from '../shared/PileupBlock'

export interface ChromatinPayload {
  /** pile-up: conditions grouped by state; row: just the row's state */
  states: { name: string; color: string; conditions: number[] }[]
}

type Props = PileupBlockProps & {
  dominant: Int16Array
  stateNames: string[]
  stateColors: string[]
  displayModel?: PileupBlockProps['displayModel'] & {
    addDiscoveredStates?: (names: string[], colors: string[]) => void
  }
}

const describe: Describe<Props> = (props, col, zone) => {
  const { dominant, width, layout, stateNames, stateColors } = props
  const byState = new Map<number, number[]>()
  const conditions =
    zone.zone === 'row'
      ? [zone.row]
      : Array.from({ length: layout.rowCount }, (_, i) => i)
  for (const c of conditions) {
    const s = dominant[c * width + col]
    if (s !== undefined && s >= 0) {
      byState.set(s, [...(byState.get(s) ?? []), c])
    }
  }
  return {
    states: [...byState]
      .sort(([a], [b]) => a - b)
      .map(([s, cs]) => ({
        name: stateNames[s]!,
        color: stateColors[s]!,
        conditions: cs,
      })),
  } satisfies ChromatinPayload
}

/**
 * Block component for ChromatinStateRenderer. Besides hover, it reports the
 * states this block found to the display, so states missing from the
 * configured palette still reach the legend.
 */
const ChromatinStateRendering = observer(function ChromatinStateRendering(
  props: Props,
) {
  const { displayModel, stateNames, stateColors } = props
  useEffect(() => {
    displayModel?.addDiscoveredStates?.(stateNames, stateColors)
  }, [displayModel, stateNames, stateColors])
  return <PileupBlock {...props} describe={describe} />
})

export default ChromatinStateRendering
