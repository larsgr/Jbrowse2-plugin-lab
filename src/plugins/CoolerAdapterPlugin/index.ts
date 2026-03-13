import Plugin from '@jbrowse/core/Plugin'
import type PluginManager from '@jbrowse/core/PluginManager'
import { AdapterType } from '@jbrowse/core/pluggableElementTypes'
import { getFileName } from '@jbrowse/core/util/tracks'
import CoolerAdapterConfigSchema from './configSchema'

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
            supportedFileExtensions: ['mcool', 'cool'],
            category: 'Hi-C',
            description: 'Cooler/mcool Hi-C contact matrix adapter',
          },
        }),
    )

    pluginManager.addToExtensionPoint(
      'Core-guessAdapterForLocation',
      (adapterGuesser: Function) => {
        return (
          file: { uri: string; locationType: string },
          index: unknown,
          adapterHint: string,
        ) => {
          const fileName = getFileName(file)
          if (
            (/\.m?cool$/i.test(fileName) && !adapterHint) ||
            adapterHint === 'CoolerAdapter'
          ) {
            return {
              type: 'CoolerAdapter',
              coolerLocation: file,
            }
          }
          return adapterGuesser(file, index, adapterHint)
        }
      },
    )

    pluginManager.addToExtensionPoint(
      'Core-guessTrackTypeForLocation',
      (trackTypeGuesser: Function) => {
        return (adapterName: string) =>
          adapterName === 'CoolerAdapter'
            ? 'HicTrack'
            : trackTypeGuesser(adapterName)
      },
    )
  }
}
