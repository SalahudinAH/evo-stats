import { useEffect, type RefObject } from 'react'
import type { Tab } from '../App'

export const TAB_ORDER: Tab[] = ['today', 'train', 'food', 'progress', 'more']

/** Things that already use a sideways swipe of their own, or where a swipe means something else. */
const OWN_GESTURE = 'input, textarea, select, [data-no-tab-swipe], .chips.scroll'

function scrollsSideways(el: Element | null, stop: Element): boolean {
  for (let n = el; n && n !== stop; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const o = getComputedStyle(n).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
  }
  return false
}

/**
 * Swipe left or right on a top-level screen to move to the next or previous tab. The page follows
 * your finger and either slides over or springs back. Not on sub-screens (they have a back button),
 * and not when the swipe starts on something that has its own sideways gesture.
 */
export function useTabSwipe(
  mainRef: RefObject<HTMLElement>,
  pageRef: RefObject<HTMLElement>,
  enabled: boolean,
  tab: Tab,
  go: (t: Tab) => void,
) {
  useEffect(() => {
    const main = mainRef.current
    const page = pageRef.current
    if (!enabled || !main || !page) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const index = TAB_ORDER.indexOf(tab)

    let g: { sx: number; sy: number; t: number; axis: 'x' | 'y' | null; dx: number; row: Element | null } | null = null
    const set = (x: number, ms = 0) => {
      page.style.transition = ms ? `transform ${ms}ms cubic-bezier(.2,.8,.2,1)` : 'none'
      page.style.transform = x ? `translateX(${x}px)` : ''
    }

    const start = (e: TouchEvent) => {
      g = null
      if (e.touches.length !== 1) return
      const target = e.target as Element
      if (target.closest(OWN_GESTURE) || scrollsSideways(target, main)) return
      if (main.querySelector('.nav-back')) return // a sub-screen: use its back button
      const t = e.touches[0]
      g = { sx: t.clientX, sy: t.clientY, t: performance.now(), axis: null, dx: 0, row: target.closest('.swipe') }
    }

    const move = (e: TouchEvent) => {
      if (!g || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - g.sx, dy = t.clientY - g.sy
      if (!g.axis) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          // A food row swipes left to delete; let it. Swiping right on a closed row still changes tab.
          const rowOpen = !!g.row?.querySelector('.swipe-under')
          if (g.row && (dx < 0 || rowOpen)) { g = null; return }
          if (document.querySelector('.drag-ghost')) { g = null; return } // dragging food to a meal
          g.axis = 'x'
        } else if (Math.abs(dy) > 10) { g = null; return }
        else return
      }
      e.preventDefault()
      const next = index + (dx < 0 ? 1 : -1)
      const edge = next < 0 || next >= TAB_ORDER.length
      g.dx = edge ? dx * 0.25 : dx
      set(g.dx)
    }

    const end = () => {
      const cur = g
      g = null
      if (!cur || cur.axis !== 'x') return
      const w = main.clientWidth
      const dir = cur.dx < 0 ? 1 : -1
      const next = index + dir
      const speed = Math.abs(cur.dx) / Math.max(1, performance.now() - cur.t)
      const far = Math.abs(cur.dx) > w * 0.28 || (speed > 0.45 && Math.abs(cur.dx) > 40)
      if (next < 0 || next >= TAB_ORDER.length || !far) { set(0, 220); return }
      if (reduce) { set(0); go(TAB_ORDER[next]); return }
      set(-dir * w, 160)
      window.setTimeout(() => {
        go(TAB_ORDER[next])
        // The new screen comes in from the other side.
        set(dir * w * 0.3)
        void page.offsetWidth
        set(0, 220)
      }, 150)
    }

    main.addEventListener('touchstart', start, { passive: true })
    main.addEventListener('touchmove', move, { passive: false })
    main.addEventListener('touchend', end)
    main.addEventListener('touchcancel', end)
    return () => {
      main.removeEventListener('touchstart', start)
      main.removeEventListener('touchmove', move)
      main.removeEventListener('touchend', end)
      main.removeEventListener('touchcancel', end)
    }
  }, [mainRef, pageRef, enabled, tab, go])
}
