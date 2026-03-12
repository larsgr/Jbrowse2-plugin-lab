import { types } from 'mobx-state-tree'
import type { IAnyModelType } from 'mobx-state-tree'

const COMPLEMENT_MAP: Record<string, string> = {
  A: 'T',
  T: 'A',
  G: 'C',
  C: 'G',
  N: 'N',
}

const SequenceStatsViewModelDefinition = types
  .model('SequenceStatsView', {
    id: types.identifier,
    type: types.literal('SequenceStatsView'),
    displayName: types.optional(types.string, 'Sequence Stats'),
    sequence: types.optional(types.string, 'ATGCGATCGATCGTAGCTAGCATCGATCG'),
  })
  .actions(self => ({
    setSequence(seq: string) {
      self.sequence = seq.replace(/[^ATGCN]/g, '')
    },
    setWidth(_newWidth: number) {
      // Required by JBrowse2 ViewType interface
    },
  }))
  .views(self => ({
    menuItems() {
      return []
    },
    get stats() {
      const seq = self.sequence
      const counts: Record<string, number> = { A: 0, T: 0, G: 0, C: 0, N: 0 }
      for (const base of seq) {
        if (base in counts) counts[base]++
      }
      const gcContent = seq.length > 0 ? ((counts.G + counts.C) / seq.length) * 100 : 0
      const complement = seq
        .split('')
        .map((b: string) => COMPLEMENT_MAP[b] ?? b)
        .join('')
      return { length: seq.length, counts, gcContent, complement }
    },
  }))

export type SequenceStatsViewModel = typeof SequenceStatsViewModelDefinition
export default SequenceStatsViewModelDefinition as unknown as IAnyModelType
