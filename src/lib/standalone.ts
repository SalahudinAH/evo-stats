/**
 * Fallback for home-screen iPhone apps that still run with the old see-through status bar
 * (iOS keeps the status-bar style from when the icon was added). There WebKit ends the page a
 * status bar's height above the bottom of the screen and nothing can be drawn below that line.
 * We then add `ios-short` to <html>: the tab bar drops its home-indicator padding and the page
 * background takes the tab bar's colour. Re-adding the icon gives the solid status bar, where the
 * page reaches the bottom and none of this applies.
 */
export function fitToScreen() {
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (!standalone || !/iPhone/.test(navigator.userAgent)) return
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)'
  document.body.appendChild(probe)
  const set = () => {
    const topInset = parseFloat(getComputedStyle(probe).paddingTop) || 0
    const portrait = window.innerHeight >= window.innerWidth
    const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
    const gap = screenH - window.innerHeight
    // Content runs under the status bar (see-through) and the page still ends early: the WebKit bug.
    document.documentElement.classList.toggle('ios-short', topInset > 0 && gap > 0 && gap <= 140)
  }
  set()
  window.addEventListener('resize', set)
  window.addEventListener('orientationchange', () => setTimeout(set, 300))
}
