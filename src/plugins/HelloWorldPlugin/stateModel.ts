import { types } from 'mobx-state-tree'
import type { IAnyModelType } from 'mobx-state-tree'

// Use crypto.randomUUID() for collision-free IDs in the browser
const HelloWorldWidgetModel = types.model('HelloWorldWidget', {
  id: types.optional(types.string, () => crypto.randomUUID()),
  type: types.literal('HelloWorldWidget'),
})

// Cast to bridge the MST version gap between root and @jbrowse/core packages
export type HelloWorldWidgetModel = typeof HelloWorldWidgetModel
export default HelloWorldWidgetModel as unknown as IAnyModelType
