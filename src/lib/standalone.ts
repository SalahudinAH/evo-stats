/**
 * Home-screen iPhone apps: WebKit can end the page above the bottom of the screen (above the
 * home-indicator area). Nothing we draw can reach below that line; only the page background
 * shows there. When that happens we add `ios-short` to <html>: the tab bar drops its own
 * home-indicator padding (the strip below already is that space) and the page background takes
 * the tab bar's colour, so the bar looks like it runs to the bottom edge.
 */
export function fitToScreen() {
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (!standalone || !/iPhone/.test(navigator.userAgent)) return
  const set = () => {
    const portrait = window.innerHeight >= window.innerWidth
    const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
    const gap = screenH - window.innerHeight
    // Only the short-page case; a keyboard makes the gap much bigger and is left alone.
    document.documentElement.classList.toggle('ios-short', gap > 0 && gap <= 140)
  }
  set()
  window.addEventListener('resize', set)
  window.addEventListener('orientationchange', () => setTimeout(set, 300))
}
