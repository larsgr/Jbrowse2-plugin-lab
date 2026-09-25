import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Full-screen tracks for phones, where the app chrome leaves the genome view
 * only a sliver of a landscape screen.
 *
 * Entering does three things, each undone on exit:
 *   - App.css (keyed off `data-fullscreen` on the shell) hides the tab bar
 *     and JBrowse's menu bar.
 *   - Every LinearGenomeView gets `setHideHeader(true)`, JBrowse's own switch
 *     for the overview/navigation header. The view then shows its compact
 *     floating controls (view menu, zoom out/in) in their place, and the view
 *     title bar keeps its menu too, so nothing becomes unreachable;
 *     panning and zooming are also on touch.
 *   - The document asks for real full screen where the browser allows it
 *     (Android), which also hides the address bar. iPhone Safari has no
 *     element full screen, so there it is the CSS alone.
 *
 * Leaving the browser's full screen by its own means (back gesture, Esc)
 * leaves this mode too, so the two never disagree.
 */

interface HeaderView {
  id: string
  hideHeader?: boolean
  setHideHeader?: (hide: boolean) => void
}

interface SessionWithViews {
  views: HeaderView[]
}

export function useFullScreen(session: SessionWithViews) {
  const [active, setActive] = useState(false)
  // Mirrors `active` synchronously: leaving the browser's full screen from
  // `exit` fires `fullscreenchange`, which must not run `exit` a second time.
  const activeRef = useRef(false)
  // Each view's own setting before entering, restored on exit so a header the
  // user had already hidden stays hidden.
  const savedHeaders = useRef(new Map<string, boolean>())

  const enter = useCallback(() => {
    if (activeRef.current) {
      return
    }
    activeRef.current = true
    savedHeaders.current.clear()
    for (const view of session.views) {
      if (view.setHideHeader) {
        savedHeaders.current.set(view.id, !!view.hideHeader)
        view.setHideHeader(true)
      }
    }
    setActive(true)
    const root = document.documentElement
    if (root.requestFullscreen && !document.fullscreenElement) {
      root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // Refused (no user gesture, or not allowed here): the CSS mode alone
        // still gives the tracks the whole viewport.
      })
    }
  }, [session])

  const exit = useCallback(() => {
    if (!activeRef.current) {
      return
    }
    activeRef.current = false
    for (const view of session.views) {
      // Views opened while in full screen were never saved: show their header.
      view.setHideHeader?.(savedHeaders.current.get(view.id) ?? false)
    }
    savedHeaders.current.clear()
    setActive(false)
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    }
  }, [session])

  useEffect(() => {
    if (!active) {
      return
    }
    const onChange = () => {
      if (!document.fullscreenElement) {
        exit()
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [active, exit])

  return { active, enter, exit }
}
