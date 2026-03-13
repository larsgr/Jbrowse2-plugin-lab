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
