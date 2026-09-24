/**
 * The "Plugins" screen: one card per demo plugin, each with a button that
 * launches it. On a phone this is a tab of its own; on a wide screen it is the
 * sidebar next to the browser.
 *
 * Launch buttons do not reimplement the plugins. They look up the very menu
 * item the plugin registered in configure() and call its onClick, so a card
 * exercises exactly the same code path as the JBrowse menu bar does - which is
 * the part a phone user can't comfortably reach.
 */

interface MenuItem {
  label?: string
  onClick?: (session: unknown) => void
  subMenu?: MenuItem[]
}

interface Menu {
  label: string
  menuItems: MenuItem[] | (() => MenuItem[])
}

export interface LabSession {
  menus: () => Menu[]
  views: Array<{
    type: string
    showTrack?: (trackId: string) => void
    setTrackLabels?: (setting: string) => void
  }>
  notify: (message: string, level?: string) => void
  minimizeWidgetDrawer: () => void
}

function runMenuItem(session: LabSession, menuLabel: string, itemLabel: string) {
  const menu = session.menus().find(m => m.label === menuLabel)
  const items =
    typeof menu?.menuItems === 'function' ? menu.menuItems() : menu?.menuItems
  const item = items?.find(i => i.label === itemLabel)
  if (!item?.onClick) {
    session.notify(`"${menuLabel} → ${itemLabel}" is not registered`, 'error')
    return
  }
  item.onClick(session)
}

const LIVER_TRACK = 'Ssal_v3.1-bodymap-Liver-stranded'

interface PluginCard {
  name: string
  icon: string
  extensionPoint: string
  description: string
  path: string
  actionLabel: string
  run: (session: LabSession) => void
}

const PLUGINS: PluginCard[] = [
  {
    name: 'HelloWorldPlugin',
    icon: '🪟',
    extensionPoint: 'WidgetType',
    description: 'A panel in the widget drawer, backed by its own MST model.',
    path: 'Add → Open Hello World Widget',
    actionLabel: 'Open widget',
    run: s => runMenuItem(s, 'Add', 'Open Hello World Widget'),
  },
  {
    name: 'CustomViewPlugin',
    icon: '📊',
    extensionPoint: 'ViewType',
    description: 'A whole new view: live GC content and base composition.',
    path: 'Add → Open Sequence Stats View',
    actionLabel: 'Open view',
    run: s => runMenuItem(s, 'Add', 'Open Sequence Stats View'),
  },
  {
    name: 'FeatureCountPlugin',
    icon: '🔢',
    extensionPoint: 'configure() hook',
    description: 'Adds menu items only, reading live session state.',
    path: 'Tools → Count Tracks in View',
    actionLabel: 'Count tracks',
    run: s => runMenuItem(s, 'Tools', 'Count Tracks in View'),
  },
  {
    name: 'StrandedBigWigPlugin',
    icon: '🧬',
    extensionPoint: 'AdapterType',
    description:
      'Real stranded RNA-seq from a forward/reverse BigWig pair. The reverse ' +
      'strand draws below the axis in a second color. The view opens inside ' +
      'a reverse-strand gene on Ssal_v3.1; zoom out to reach the ' +
      'forward-strand gene next door.',
    path: 'Track selector → BodyMap RNA-seq → Liver RNA-seq (+/-)',
    actionLabel: 'Show Liver track',
    run: s => {
      const view = s.views.find(v => v.type === 'LinearGenomeView')
      try {
        if (!view?.showTrack) {
          throw new Error('no linear genome view is open')
        }
        view.showTrack(LIVER_TRACK)
      } catch (e) {
        s.notify(`Could not show the Liver track: ${String(e)}`, 'warning')
      }
    },
  },
]

export default function PluginGuide({
  session,
  onLaunch,
}: {
  session: LabSession
  onLaunch: () => void
}) {
  return (
    <div className="guide">
      <header className="guide-header">
        <h1>🧬 JBrowse2 Plugin Lab</h1>
        <p>
          Four example plugins, each on a different JBrowse2 extension point.
          Launch one below, or find it in the browser's menus.
        </p>
      </header>

      <ul className="plugin-list">
        {PLUGINS.map(p => (
          <li key={p.name} className="plugin-card">
            <div className="plugin-card-head">
              <span className="plugin-card-icon" aria-hidden="true">
                {p.icon}
              </span>
              <div>
                <h2>{p.name}</h2>
                <code className="plugin-type">{p.extensionPoint}</code>
              </div>
            </div>
            <p>{p.description}</p>
            <p className="plugin-path">{p.path}</p>
            <button
              type="button"
              className="plugin-action"
              onClick={() => {
                onLaunch()
                // On a phone an open widget covers the whole browser, so get it
                // out of the way; opening a widget brings the drawer back.
                session.minimizeWidgetDrawer()
                p.run(session)
              }}
            >
              {p.actionLabel}
            </button>
          </li>
        ))}
      </ul>

      <footer className="guide-footer">
        <a href="https://github.com/larsgr/Jbrowse2-plugin-lab">
          Source on GitHub
        </a>
      </footer>
    </div>
  )
}
