import { useMemo, useRef, useState, type ReactNode } from 'react'
import { createViewState, JBrowseApp } from '@jbrowse/react-app2'
import HelloWorldPlugin from './plugins/HelloWorldPlugin'
import FeatureCountPlugin from './plugins/FeatureCountPlugin'
import CustomViewPlugin from './plugins/CustomViewPlugin'
import StrandedBigWigPlugin from './plugins/StrandedBigWigPlugin'
import ExtensionIcon from '@mui/icons-material/Extension'
import ViewTimelineIcon from '@mui/icons-material/ViewTimeline'
import FullscreenIcon from '@mui/icons-material/Fullscreen'
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit'
import PluginGuide, { type LabSession } from './PluginGuide'
import { useTouchNavigation } from './touchNavigation'
import { useFullScreen } from './fullScreen'
import './App.css'

const VOLVOX_DATA_URL =
  'https://raw.githubusercontent.com/GMOD/jbrowse-components/main/test_data/volvox'

const SALMON_BODYMAP_URL =
  'https://salmobase.org/datafiles/datasets/Aqua-Faang/trackhub/AtlanticSalmon/BodyMap/RNA/bigWig'

/**
 * Real stranded input for StrandedBigWigPlugin: Aqua-Faang BodyMap RNA-seq,
 * mature female, replicate 1.
 *
 * Every sample in that directory ships as a `.forward.bigWig`/`.reverse.bigWig`
 * pair over Ssal_v3.1, which is exactly the shape the adapter exists for. Two
 * things make this a better demo than the volvox stand-in pair below:
 *
 *   - Both files come from one library rather than being two unrelated tracks
 *     pressed into service, so the strands are on the same scale. Expression
 *     still differs per gene, so the plot is not mirror-symmetric - but the
 *     asymmetry is biology rather than an artefact of the stand-in.
 *   - The strand assignment is checkable against the gene track: over
 *     ENSSSAG00000028365 (+) the forward file peaks ~70000 against ~1800 on the
 *     reverse, and the neighbouring ENSSSAG00000027035 (-) inverts that ratio.
 *
 * The BigWigs name chromosomes the Ensembl way (`1`..`29`), matching this
 * assembly's .fai, so no refName translation is needed.
 */
const BODYMAP_TISSUES = ['Liver', 'Brain', 'Gill']

const bodyMapStrandedTracks = BODYMAP_TISSUES.map(tissue => {
  const sample = `AtlanticSalmon_RNA_${tissue}_Mature_Female_R1`
  const trackId = `Ssal_v3.1-bodymap-${tissue}-stranded`
  return {
    type: 'QuantitativeTrack',
    trackId,
    name: `${tissue} RNA-seq (+/-)`,
    assemblyNames: ['Ssal_v3.1'],
    category: ['BodyMap RNA-seq'],
    adapter: {
      type: 'StrandedBigWigAdapter',
      forwardBigWigLocation: {
        uri: `${SALMON_BODYMAP_URL}/${sample}.forward.bigWig`,
        locationType: 'UriLocation',
      },
      reverseBigWigLocation: {
        uri: `${SALMON_BODYMAP_URL}/${sample}.reverse.bigWig`,
        locationType: 'UriLocation',
      },
    },
    displays: [
      {
        type: 'LinearWiggleDisplay',
        displayId: `${trackId}-LinearWiggleDisplay`,
        defaultRendering: 'xyplot',
        renderers: {
          XYPlotRenderer: {
            type: 'XYPlotRenderer',
            posColor: '#1a7abf',
            negColor: '#d1495b',
          },
        },
      },
    ],
  }
})

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
    {
      name: 'Ssal_v3.1',
      sequence: {
        type: 'ReferenceSequenceTrack',
        trackId: 'Ssal_v3.1-refseqTrack',
        adapter: {
          type: 'BgzipFastaAdapter',
          fastaLocation: {
            uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/sequence_Ensembl/Salmo_salar.Ssal_v3.1.dna_sm.toplevel.fa.gz',
            locationType: 'UriLocation',
          },
          faiLocation: {
            uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/sequence_Ensembl/Salmo_salar.Ssal_v3.1.dna_sm.toplevel.fa.gz.fai',
            locationType: 'UriLocation',
          },
          gziLocation: {
            uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/sequence_Ensembl/Salmo_salar.Ssal_v3.1.dna_sm.toplevel.fa.gz.gzi',
            locationType: 'UriLocation',
          },
        },
      },
      refNameAliases: {
        adapter: {
          type: 'RefNameAliasAdapter',
          location: {
            uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/alias.txt',
            locationType: 'UriLocation',
          },
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
      type: 'FeatureTrack',
      trackId: 'Ssal_v3.1-Ensembl-FeatureTrack',
      name: 'Genes(Ensembl)',
      assemblyNames: ['Ssal_v3.1'],
      category: ['Annotation'],
      adapter: {
        type: 'Gff3TabixAdapter',
        gffGzLocation: {
          uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/annotations/Ensembl/Salmo_salar.Ssal_v3.1.106_filtered.gff.gz',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/annotations/Ensembl/Salmo_salar.Ssal_v3.1.106_filtered.gff.gz.tbi',
            locationType: 'UriLocation',
          },
        },
      },
    },
    {
      type: 'FeatureTrack',
      trackId: 'Ssal_v3.1-NCBI-FeatureTrack',
      name: 'Genes(NCBI)',
      assemblyNames: ['Ssal_v3.1'],
      category: ['Annotation'],
      adapter: {
        type: 'Gff3TabixAdapter',
        gffGzLocation: {
          uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/annotations/NCBI/GCF_905237065.1_Ssal_v3.1_genomic_filtered.gff.gz',
          locationType: 'UriLocation',
        },
        index: {
          location: {
            uri: 'https://salmobase.org/datafiles/genomes/AtlanticSalmon/Ssal_v3.1/annotations/NCBI/GCF_905237065.1_Ssal_v3.1_genomic_filtered.gff.gz.tbi',
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
    {
      // Demo for StrandedBigWigPlugin. volvox has no true stranded pair in the
      // test data, so two different BigWigs stand in for +/- strand. They must
      // be genuinely different files: volvox.bw and volvox_microarray.bw are
      // byte-identical, so pairing those would render a perfect mirror and
      // hide a bug that read the forward file for both strands.
      //
      // These two stand-ins have very different magnitudes (coverage peaks
      // near 40, the microarray near 800), so the demo looks lopsided: the
      // blue forward strand is a thin band above the axis and the red reverse
      // strand fills the space below it. That is the shared autoscale doing
      // its job on mismatched data, not a plugin bug. Real stranded pairs from
      // one sample have comparable ranges and render symmetrically.
      type: 'QuantitativeTrack',
      trackId: 'volvox_stranded',
      name: 'Volvox Stranded Coverage (+/-)',
      assemblyNames: ['volvox'],
      category: ['Quantitative'],
      adapter: {
        type: 'StrandedBigWigAdapter',
        forwardBigWigLocation: {
          uri: `${VOLVOX_DATA_URL}/volvox-sorted.bam.coverage.bw`,
          locationType: 'UriLocation',
        },
        reverseBigWigLocation: {
          uri: `${VOLVOX_DATA_URL}/volvox.bw`,
          locationType: 'UriLocation',
        },
      },
      displays: [
        {
          type: 'LinearWiggleDisplay',
          displayId: 'volvox_stranded-LinearWiggleDisplay',
          defaultRendering: 'xyplot',
          renderers: {
            XYPlotRenderer: {
              type: 'XYPlotRenderer',
              posColor: '#1a7abf',
              negColor: '#d1495b',
            },
          },
        },
      ],
    },
    ...bodyMapStrandedTracks,
  ],
  defaultSession: {
    name: 'Plugin Lab Demo',
    views: [
      {
        id: 'linearView',
        type: 'LinearGenomeView',
        // ENSSSAG00000027035 (-, 56.176M) and ENSSSAG00000028365 (+, 56.185M)
        // sit side by side here, both heavily covered in liver, so the stranded
        // track is self-checking: each gene's coverage should land on the side
        // of the axis matching its arrow in the gene track.
        //
        // The region starts *inside* the reverse-strand gene on purpose. The
        // view opens at 1bp/px on the left edge of its region no matter how
        // wide the region is, so starting at the intergenic gap would open on
        // an empty track. Here it opens on ~12000x reverse coverage against
        // ~90 forward, i.e. the plugin's whole point - a strand drawn below the
        // axis - is on screen before the user touches anything. Zoom out to
        // reach the forward gene.
        //
        // bpPerPx is left unset on purpose: framing both genes at once works,
        // but the forward gene (~70000) then dominates the shared autoscale
        // and flattens the reverse-strand signal this demo is about.
        //
        // refName must be the assembly's *canonical* name - the one in the
        // FASTA .fai (`1`), not an alias from alias.txt (`ssa01`). JBrowse
        // translates canonical names to each track's own names, keyed by the
        // canonical name only, so an alias here reaches every adapter
        // untranslated: the BigWigs are asked for a chromosome called `ssa01`,
        // return nothing, and every track renders empty. Navigating from the
        // search box canonicalises the name, which is why the tracks appeared
        // to "wake up" after the view was moved.
        displayedRegions: [
          {
            refName: '1',
            start: 56_175_800,
            end: 56_188_000,
            assemblyName: 'Ssal_v3.1',
          },
        ],
        // Left empty deliberately: naming tracks here makes TrackContainer
        // instantiate them before the assembly's refNames have resolved, and
        // it throws on the not-yet-created display ("reading 'resizeHeight'"),
        // which blanks the whole app. Turn tracks on from the track selector.
        tracks: [],
      },
    ],
  },
}

type Tab = 'browser' | 'plugins'

// Keep in step with the phone breakpoint in App.css. A phone on its side is
// wider than 899px (a large iPhone is ~930px) but only ~400px tall, and the
// 340px guide sidebar would leave the genome view less than half the screen.
const NARROW_SCREEN =
  '(max-width: 899px), (max-height: 499px) and (pointer: coarse)'

function App() {
  const state = useMemo(() => {
    const state = createViewState({
      config,
      plugins: [
        HelloWorldPlugin,
        FeatureCountPlugin,
        CustomViewPlugin,
        StrandedBigWigPlugin,
      ],
    })
    // On a phone-width view the default overlapping track label covers about
    // a third of the plot, so put labels above each track instead. Wide
    // screens keep the default layout.
    if (window.matchMedia(NARROW_SCREEN).matches) {
      for (const view of (state.session as unknown as LabSession).views) {
        view.setTrackLabels?.('offset')
      }
    }
    return state
  }, [])
  // Only matters on narrow screens, where the browser and the plugin guide
  // are two tabs. Wide screens show both side by side and ignore it.
  const [tab, setTab] = useState<Tab>('browser')
  // JBrowse's genome view only knows mouse drags and the wheel; add swipe to
  // pan and pinch to zoom on top of it.
  const hostRef = useRef<HTMLDivElement>(null)
  useTouchNavigation(hostRef, state.session as unknown as LabSession)
  // Tracks only, edge to edge: on a phone the menu bars and tab bar otherwise
  // take most of a landscape screen.
  const fullScreen = useFullScreen(state.session as unknown as LabSession)

  return (
    <div
      className="shell"
      data-tab={tab}
      data-fullscreen={fullScreen.active || undefined}
    >
      <aside className="shell-guide">
        <PluginGuide
          session={state.session as unknown as LabSession}
          onLaunch={() => setTab('browser')}
        />
      </aside>

      <main className="shell-browser">
        {/* JBrowseApp sizes itself to 100vh; App.css pins it to this box. */}
        <div className="jb-host" ref={hostRef}>
          <JBrowseApp viewState={state} />
        </div>
        {fullScreen.active && (
          <button
            type="button"
            className="fullscreen-exit"
            aria-label="Exit full screen"
            title="Exit full screen"
            onClick={fullScreen.exit}
          >
            <FullscreenExitIcon />
          </button>
        )}
      </main>

      <nav className="tabbar" aria-label="Sections">
        <TabButton
          label="Browser"
          active={tab === 'browser'}
          onClick={() => setTab('browser')}
          icon={<ViewTimelineIcon />}
        />
        <TabButton
          label="Plugins"
          active={tab === 'plugins'}
          onClick={() => setTab('plugins')}
          icon={<ExtensionIcon />}
        />
        <TabButton
          label="Full screen"
          onClick={() => {
            setTab('browser')
            fullScreen.enter()
          }}
          icon={<FullscreenIcon />}
        />
      </nav>
    </div>
  )
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="tabbar-item"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export default App
