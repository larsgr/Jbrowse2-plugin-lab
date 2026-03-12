import { types } from 'mobx-state-tree'
import type { IAnyModelType } from 'mobx-state-tree'

const HelloWorldWidgetModel = types.model('HelloWorldWidget', {
  id: types.identifier,
  type: types.literal('HelloWorldWidget'),
})

export type HelloWorldWidgetModel = typeof HelloWorldWidgetModel
export default HelloWorldWidgetModel as unknown as IAnyModelType
