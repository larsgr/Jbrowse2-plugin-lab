import { observer } from 'mobx-react'
import PileupBlock, {
  type Describe,
  type PileupBlockProps,
} from '../shared/PileupBlock'
import { valueAt } from './rasterize'

export interface WigglePayload {
  /** conditions with signal at the hovered column (all of them for a row) */
  values: { condition: number; fwd: number; rev: number }[]
  bpPerPx: number
}

type Props = PileupBlockProps & { values: Float32Array }

const describe: Describe<Props> = (props, col, zone) => {
  const { values, width, layout, bpPerPx } = props
  const raster = { values, width, conditionCount: layout.rowCount }
  const pick = (condition: number) => ({
    condition,
    fwd: valueAt(raster, condition, 0, col),
    rev: valueAt(raster, condition, 1, col),
  })
  const rows =
    zone.zone === 'row'
      ? [pick(zone.row)]
      : Array.from({ length: layout.rowCount }, (_, c) => pick(c)).filter(
          v => v.fwd > 0 || v.rev > 0,
        )
  return { values: rows, bpPerPx } satisfies WigglePayload
}

/** Block component for ConditionWiggleRenderer. */
const ConditionWiggleRendering = observer(function ConditionWiggleRendering(
  props: Props,
) {
  return <PileupBlock {...props} describe={describe} />
})

export default ConditionWiggleRendering
