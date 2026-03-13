import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import { AdapterType } from '@jbrowse/core/pluggableElementTypes'
import type { FileLocation } from '@jbrowse/core/util/types'
import { getFileName } from '@jbrowse/core/util/tracks'
import CoolerAdapterConfigSchema from './configSchema'

type AdapterGuesser = (file: FileLocation, index: unknown, adapterHint: string) => unknown
type TrackTypeGuesser = (adapterName: string) => string

export default class CoolerAdapterPlugin extends Plugin {
  name = 'CoolerAdapterPlugin'

  install(pluginManager: PluginManager) {
    pluginManager.addAdapterType(
      () =>
        new AdapterType({
          name: 'CoolerAdapter',
          displayName: 'Cooler adapter',
          configSchema: CoolerAdapterConfigSchema,
          getAdapterClass: () => import('./CoolerAdapter').then(r => r.default),
          adapterMetadata: {
            category: 'Hi-C',
            description: 'Cooler/mcool Hi-C contact matrix adapter',
          },
        }),
    )

    pluginManager.addToExtensionPoint('Core-guessAdapterForLocation', (adapterGuesser: AdapterGuesser) => {
      return (file: FileLocation, index: unknown, adapterHint: string) => {
        const fileName = getFileName(file)
        if ((/\.m?cool$/i.test(fileName) && !adapterHint) || adapterHint === 'CoolerAdapter') {
          return {
            type: 'CoolerAdapter',
            coolerLocation: file,
          }
        }
        return adapterGuesser(file, index, adapterHint)
      }
    })

    pluginManager.addToExtensionPoint('Core-guessTrackTypeForLocation', (trackTypeGuesser: TrackTypeGuesser) => {
      return (adapterName: string) =>
        adapterName === 'CoolerAdapter' ? 'HicTrack' : trackTypeGuesser(adapterName)
    })
  }
}
