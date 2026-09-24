import { useEffect, type RefObject } from 'react'

/**
 * Touch panning and pinch-to-zoom for every LinearGenomeView inside `hostRef`.
 *
 * JBrowse's LinearGenomeView only listens for mouse drags and wheel events, so
 * on a phone a swipe over the tracks does nothing and a pinch zooms the whole
 * page. This layers touch gestures on top from the outside, driving the same
 * view actions the mouse and wheel handlers use:
 *
 *   - one finger, sideways: `horizontalScroll`, with a fling on release.
 *     Vertical swipes are left to the browser (`touch-action: pan-y` in
 *     App.css), so the track list still scrolls natively.
 *   - two fingers: pinch zooms around the midpoint between the fingers, and
 *     moving both fingers pans at the same time.
 *
 * During a pinch only `scaleFactor` changes - the CSS `scaleX` preview that
 * ctrl+wheel zoom uses - so nothing is re-fetched or re-rendered until the
 * fingers lift and the zoom is committed with a single `zoomTo`.
 */

interface TouchableView {
  id: string
  type: string
  width: number
  bpPerPx: number
  minBpPerPx: number
  maxBpPerPx: number
  horizontalScroll: (distance: number) => number
  zoomTo: (bpPerPx: number, offset?: number) => number
  setScaleFactor: (factor: number) => void
}

interface SessionWithViews {
  views: Array<{ id: string; type: string }>
}

// Movement before a one-finger touch counts as a swipe, and the axis is picked.
const SLOP_PX = 8
// Fling: velocity is sampled over the last moments of the swipe, then decays.
const VELOCITY_WINDOW_MS = 100
const FRICTION_PER_MS = 0.995
const MIN_FLING_PX_PER_MS = 0.05

type Gesture =
  | { kind: 'idle' }
  | {
      kind: 'pan'
      view: TouchableView
      startX: number
      startY: number
      lastX: number
      locked: 'pending' | 'x' | 'y'
      samples: Array<{ t: number; x: number }>
    }
  | {
      kind: 'pinch'
      view: TouchableView
      container: Element
      startDist: number
      startMid: number
      scrolled: number
      scale: number
    }

function findView(
  target: EventTarget | null,
  session: SessionWithViews,
): { view: TouchableView; container: Element } | undefined {
  if (!(target instanceof Element)) {
    return undefined
  }
  // Same exclusions as JBrowse's own mouse drag: track drag handles and
  // resize handles keep their behaviour.
  if (
    (target instanceof HTMLElement && target.draggable) ||
    target.closest('[data-resizer]')
  ) {
    return undefined
  }
  const container = target.closest('[data-testid="tracksContainer"]')
  const viewEl = container?.closest('[data-testid^="view-container-"]')
  if (!container || !viewEl) {
    return undefined
  }
  const id = viewEl.getAttribute('data-testid')!.slice('view-container-'.length)
  const view = session.views.find(v => v.id === id)
  return view?.type === 'LinearGenomeView'
    ? { view: view as unknown as TouchableView, container }
    : undefined
}

export function useTouchNavigation(
  hostRef: RefObject<HTMLElement | null>,
  session: SessionWithViews,
) {
  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    let gesture: Gesture = { kind: 'idle' }
    let panDelta = 0
    let panFrame = 0
    let flingFrame = 0

    function schedulePan(view: TouchableView, distance: number) {
      panDelta += distance
      if (!panFrame) {
        panFrame = requestAnimationFrame(() => {
          panFrame = 0
          view.horizontalScroll(panDelta)
          panDelta = 0
        })
      }
    }

    function stopFling() {
      cancelAnimationFrame(flingFrame)
      flingFrame = 0
    }

    function fling(view: TouchableView, pxPerMs: number) {
      let velocity = pxPerMs
      let last = performance.now()
      const step = (now: number) => {
        const dt = now - last
        last = now
        velocity *= FRICTION_PER_MS ** dt
        // Stop early at either end of the displayed regions.
        if (
          Math.abs(velocity) < MIN_FLING_PX_PER_MS ||
          view.horizontalScroll(-velocity * dt) === 0
        ) {
          flingFrame = 0
          return
        }
        flingFrame = requestAnimationFrame(step)
      }
      flingFrame = requestAnimationFrame(step)
    }

    function startPan(view: TouchableView, touch: Touch, locked: 'pending' | 'x') {
      gesture = {
        kind: 'pan',
        view,
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        locked,
        samples: [{ t: performance.now(), x: touch.clientX }],
      }
    }

    function startPinch(view: TouchableView, container: Element, a: Touch, b: Touch) {
      const left = container.getBoundingClientRect().left
      gesture = {
        kind: 'pinch',
        view,
        container,
        startDist: Math.max(1, Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)),
        startMid: (a.clientX + b.clientX) / 2 - left,
        scrolled: 0,
        scale: 1,
      }
    }

    function commitPinch() {
      if (gesture.kind !== 'pinch') {
        return
      }
      const { view, scale } = gesture
      view.setScaleFactor(1)
      // The preview scales about the view's centre, so zooming about the
      // centre by the same factor lands every base exactly where it was drawn.
      if (scale !== 1) {
        view.zoomTo(view.bpPerPx / scale, view.width / 2)
      }
    }

    function onTouchStart(event: TouchEvent) {
      stopFling()
      if (event.touches.length === 1) {
        const hit = findView(event.target, session)
        gesture = { kind: 'idle' }
        if (hit) {
          startPan(hit.view, event.touches[0], 'pending')
        }
      } else if (event.touches.length === 2) {
        const hit = findView(event.touches[0].target, session)
        if (hit) {
          event.preventDefault()
          startPinch(hit.view, hit.container, event.touches[0], event.touches[1])
        } else {
          gesture = { kind: 'idle' }
        }
      } else {
        commitPinch()
        gesture = { kind: 'idle' }
      }
    }

    function onTouchMove(event: TouchEvent) {
      if (gesture.kind === 'pan' && event.touches.length === 1) {
        const touch = event.touches[0]
        if (gesture.locked === 'pending') {
          const dx = Math.abs(touch.clientX - gesture.startX)
          const dy = Math.abs(touch.clientY - gesture.startY)
          if (Math.max(dx, dy) < SLOP_PX) {
            return
          }
          gesture.locked = dx > dy ? 'x' : 'y'
        }
        if (gesture.locked === 'y') {
          return
        }
        if (event.cancelable) {
          event.preventDefault()
        }
        schedulePan(gesture.view, gesture.lastX - touch.clientX)
        gesture.lastX = touch.clientX
        const now = performance.now()
        gesture.samples.push({ t: now, x: touch.clientX })
        while (gesture.samples[0].t < now - VELOCITY_WINDOW_MS) {
          gesture.samples.shift()
        }
      } else if (gesture.kind === 'pinch' && event.touches.length === 2) {
        if (event.cancelable) {
          event.preventDefault()
        }
        const [a, b] = [event.touches[0], event.touches[1]]
        const { view } = gesture
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
        const mid =
          (a.clientX + b.clientX) / 2 - gesture.container.getBoundingClientRect().left
        // Clamp to the view's zoom limits so the preview matches the commit.
        const scale = Math.min(
          view.bpPerPx / view.minBpPerPx,
          Math.max(view.bpPerPx / view.maxBpPerPx, dist / gesture.startDist),
        )
        // Keep the base that was under the fingers' midpoint at the start
        // under the midpoint now. The preview is drawn as
        // centre + scale * (x - centre), so solve for the scroll offset.
        const centre = view.width / 2
        const target = gesture.startMid - centre - (mid - centre) / scale
        gesture.scrolled += view.horizontalScroll(target - gesture.scrolled)
        gesture.scale = scale
        view.setScaleFactor(scale)
      }
    }

    function onTouchEnd(event: TouchEvent) {
      if (gesture.kind === 'pinch') {
        if (event.touches.length < 2) {
          commitPinch()
          const rest = event.touches[0]
          const { view } = gesture
          gesture = { kind: 'idle' }
          // Carry on panning with the finger that stayed down.
          if (rest) {
            startPan(view, rest, 'x')
          }
        }
        return
      }
      if (gesture.kind === 'pan' && event.touches.length === 0) {
        const { view, locked, samples } = gesture
        gesture = { kind: 'idle' }
        const first = samples[0]
        const last = samples[samples.length - 1]
        const dt = last.t - first.t
        if (
          locked === 'x' &&
          dt > 0 &&
          performance.now() - last.t < VELOCITY_WINDOW_MS
        ) {
          const velocity = (last.x - first.x) / dt
          if (Math.abs(velocity) > MIN_FLING_PX_PER_MS) {
            fling(view, velocity)
          }
        }
      }
    }

    // iOS Safari fires its own pinch events and zooms the page on them.
    function onGestureStart(event: Event) {
      if (findView(event.target, session)) {
        event.preventDefault()
      }
    }

    const opts = { passive: false }
    host.addEventListener('touchstart', onTouchStart, opts)
    host.addEventListener('touchmove', onTouchMove, opts)
    host.addEventListener('touchend', onTouchEnd)
    host.addEventListener('touchcancel', onTouchEnd)
    host.addEventListener('gesturestart', onGestureStart, opts)
    return () => {
      commitPinch()
      stopFling()
      cancelAnimationFrame(panFrame)
      host.removeEventListener('touchstart', onTouchStart)
      host.removeEventListener('touchmove', onTouchMove)
      host.removeEventListener('touchend', onTouchEnd)
      host.removeEventListener('touchcancel', onTouchEnd)
      host.removeEventListener('gesturestart', onGestureStart)
    }
  }, [hostRef, session])
}
