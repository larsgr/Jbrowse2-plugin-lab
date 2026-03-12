import { useMemo } from 'react'
import { createViewState, JBrowseApp } from '@jbrowse/react-app2'
import HelloWorldPlugin from './plugins/HelloWorldPlugin'
import FeatureCountPlugin from './plugins/FeatureCountPlugin'
import CustomViewPlugin from './plugins/CustomViewPlugin'
import './App.css'

const VOLVOX_DATA_URL =
  'https://raw.githubusercontent.com/GMOD/jbrowse-components/main/test_data/volvox'

const config = {
  assemblies: [
    {
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
    },
  ],
  tracks: [
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
  ],
  defaultSession: {
    name: 'Plugin Lab Demo',
    views: [
      {
        id: 'linearView',
        type: 'LinearGenomeView',
        displayedRegions: [
          {
            refName: 'ctgA',
            start: 1000,
            end: 25000,
            assemblyName: 'volvox',
          },
        ],
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
    ],
  },
}

function App() {
  const state = useMemo(
    () =>
      createViewState({
        config,
        plugins: [HelloWorldPlugin, FeatureCountPlugin, CustomViewPlugin],
      }),
    [],
  )

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🧬 JBrowse2 Plugin Lab</h1>
        <p className="app-subtitle">
          Full JBrowse App shell for validating Add/Tools menu plugin behavior
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
                Open with <strong>Add → Open Hello World Widget</strong>.
              </p>
            </div>
          </div>
          <div className="plugin-card">
            <div className="plugin-card-icon">🔢</div>
            <div>
              <h3>FeatureCountPlugin</h3>
              <code className="plugin-type">configure() hook</code>
              <p>
                Try <strong>Tools → Count Tracks in View</strong>.
              </p>
            </div>
          </div>
          <div className="plugin-card">
            <div className="plugin-card-icon">📊</div>
            <div>
              <h3>CustomViewPlugin</h3>
              <code className="plugin-type">ViewType</code>
              <p>
                Open with <strong>Add → Open Sequence Stats View</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="viewer-section">
        <h2>JBrowse2 Full App</h2>
        <p className="viewer-hint">
          The embedded app now includes the main menu bar, so plugin menu items
          in <strong>Add</strong> and <strong>Tools</strong> are available.
        </p>
        <div className="viewer-wrapper">
          <JBrowseApp viewState={state} />
        </div>
      </section>
    </div>
  )
}

export default App
