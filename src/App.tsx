import { useMemo } from 'react'
import {
  createViewState,
  JBrowseLinearGenomeView,
} from '@jbrowse/react-linear-genome-view'
import HelloWorldPlugin from './plugins/HelloWorldPlugin'
import FeatureCountPlugin from './plugins/FeatureCountPlugin'
import CustomViewPlugin from './plugins/CustomViewPlugin'
import './App.css'

// Volvox assembly — small example genome bundled with JBrowse2 test data
// served from the jbrowse-components GitHub test_data directory
const VOLVOX_DATA_URL =
  'https://raw.githubusercontent.com/GMOD/jbrowse-components/main/test_data/volvox'

const assembly = {
  name: 'volvox',
  aliases: ['vvx'],
  sequence: {
    type: 'ReferenceSequenceTrack',
    trackId: 'volvox_refseq',
    adapter: {
      type: 'TwoBitAdapter',
      twoBitLocation: {
        uri: `${VOLVOX_DATA_URL}/volvox.2bit`,
        locationType: 'UriLocation',
      },
    },
  },
  refNameAliases: {
    adapter: {
      type: 'FromConfigAdapter',
      features: [
        { refName: 'ctgA', uniqueId: 'alias1', aliases: ['A', 'contigA'] },
        { refName: 'ctgB', uniqueId: 'alias2', aliases: ['B', 'contigB'] },
      ],
    },
  },
}

const tracks = [
  {
    type: 'FeatureTrack',
    trackId: 'volvox_genes',
    name: 'Volvox Genes',
    assemblyNames: ['volvox'],
    category: ['Genes'],
    adapter: {
      type: 'Gff3TabixAdapter',
      gffGzLocation: {
        uri: `${VOLVOX_DATA_URL}/volvox.sort.gff3.gz`,
        locationType: 'UriLocation',
      },
      index: {
        location: {
          uri: `${VOLVOX_DATA_URL}/volvox.sort.gff3.gz.tbi`,
          locationType: 'UriLocation',
        },
      },
    },
  },
  {
    type: 'QuantitativeTrack',
    trackId: 'volvox_wig',
    name: 'Volvox Coverage',
    assemblyNames: ['volvox'],
    category: ['Quantitative'],
    adapter: {
      type: 'BigWigAdapter',
      bigWigLocation: {
        uri: `${VOLVOX_DATA_URL}/volvox-sorted.bam.coverage.bw`,
        locationType: 'UriLocation',
      },
    },
  },
]

function App() {
  const state = useMemo(
    () =>
      createViewState({
        assembly,
        tracks,
        plugins: [HelloWorldPlugin, FeatureCountPlugin, CustomViewPlugin],
        location: 'ctgA:1000..25000',
        defaultSession: {
          name: 'Plugin Lab Demo',
          view: {
            id: 'linearView',
            type: 'LinearGenomeView',
            tracks: [
              {
                id: 'genes-track',
                type: 'FeatureTrack',
                configuration: 'volvox_genes',
                displays: [
                  {
                    id: 'genes-display',
                    type: 'LinearBasicDisplay',
                    configuration: 'volvox_genes-LinearBasicDisplay',
                  },
                ],
              },
            ],
          },
        },
      }),
    [],
  )

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🧬 JBrowse2 Plugin Lab</h1>
        <p className="app-subtitle">
          A demo project showcasing different JBrowse2 plugin types
        </p>
      </header>

      <section className="plugin-info">
        <h2>Loaded Plugins</h2>
        <div className="plugin-cards">
          <div className="plugin-card">
            <div className="plugin-card-icon">🪟</div>
            <div>
              <h3>HelloWorldPlugin</h3>
              <code className="plugin-type">WidgetType</code>
              <p>
                Adds a custom drawer panel widget. Open it via{' '}
                <strong>Add → Open Hello World Widget</strong>.
              </p>
            </div>
          </div>
          <div className="plugin-card">
            <div className="plugin-card-icon">🔢</div>
            <div>
              <h3>FeatureCountPlugin</h3>
              <code className="plugin-type">configure() hook</code>
              <p>
                Adds a <strong>Tools</strong> menu with custom actions. Try{' '}
                <strong>Tools → Count Tracks in View</strong>.
              </p>
            </div>
          </div>
          <div className="plugin-card">
            <div className="plugin-card-icon">📊</div>
            <div>
              <h3>CustomViewPlugin</h3>
              <code className="plugin-type">ViewType</code>
              <p>
                Adds a custom visualization panel. Open it via{' '}
                <strong>Add → Open Sequence Stats View</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="viewer-section">
        <h2>JBrowse2 Linear Genome View</h2>
        <p className="viewer-hint">
          Use the <strong>Add</strong> menu in the toolbar to open the plugin
          widgets and views. Use <strong>Tools</strong> for plugin actions.
        </p>
        <div className="viewer-wrapper">
          <JBrowseLinearGenomeView viewState={state} />
        </div>
      </section>

      <footer className="app-footer">
        <p>
          Built with{' '}
          <a
            href="https://jbrowse.org/jb2/"
            target="_blank"
            rel="noreferrer"
          >
            JBrowse2
          </a>{' '}
          ·{' '}
          <a
            href="https://github.com/larsgr/Jbrowse2-plugin-lab"
            target="_blank"
            rel="noreferrer"
          >
            View source on GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
