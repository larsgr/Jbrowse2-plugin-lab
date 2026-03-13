import { ConfigurationSchema } from '@jbrowse/core/configuration'

const CoolerAdapterConfigSchema = ConfigurationSchema(
  'CoolerAdapter',
  {
    coolerLocation: {
      type: 'fileLocation',
      defaultValue: {
        uri: '/path/to/my.mcool',
        locationType: 'UriLocation',
      },
    },
    resolutionMultiplier: {
      type: 'number',
      defaultValue: 1,
      description: 'Initial resolution multiplier',
    },

    maxPixelsToFetch: {
      type: 'number',
      defaultValue: 2_000_000,
      description:
        'Maximum number of pixel records to decode from a single query; adapter will switch to coarser resolution if exceeded',
    },
  },
  {
    explicitlyTyped: true,
    preProcessSnapshot: snap => {
      return snap.uri
        ? {
            ...snap,
            coolerLocation: {
              uri: snap.uri,
              baseUri: snap.baseUri,
            },
          }
        : snap
    },
  },
)

export default CoolerAdapterConfigSchema
