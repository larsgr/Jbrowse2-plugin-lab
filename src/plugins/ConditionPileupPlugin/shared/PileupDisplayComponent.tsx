import type { ComponentType } from 'react'
import { observer } from 'mobx-react'
import PileupOverlay, { type OverlayModel } from './PileupOverlay'

/**
 * The display component for both pile-up displays: JBrowse's own
 * BaseLinearDisplayComponent (blocks, tooltip, context menu, "zoom in" and
 * error messages) with the label overlay passed in as its children, which it
 * renders inside its positioned container.
 */
export function makePileupDisplayComponent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BaseLinearDisplayComponent: ComponentType<any>,
) {
  return observer(function PileupDisplay(props: { model: OverlayModel }) {
    return (
      <BaseLinearDisplayComponent {...props}>
        <PileupOverlay model={props.model} />
      </BaseLinearDisplayComponent>
    )
  })
}
