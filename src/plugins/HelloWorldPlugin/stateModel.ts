import { types } from 'mobx-state-tree'
import type { IAnyModelType } from 'mobx-state-tree'

// Use a simple random id to avoid MST version incompatibility with
// @jbrowse/core's bundled mobx-state-tree (ElementId uses the nested version)
const HelloWorldWidgetModel = types.model('HelloWorldWidget', {
  id: types.optional(types.string, () => `helloWorldWidget-${Math.random().toString(36).slice(2, 9)}`),
  type: types.literal('HelloWorldWidget'),
})

// Cast to bridge the MST version gap between root and @jbrowse/core packages
export type HelloWorldWidgetModel = typeof HelloWorldWidgetModel
export default HelloWorldWidgetModel as unknown as IAnyModelType
