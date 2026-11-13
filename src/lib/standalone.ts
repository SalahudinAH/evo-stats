/**
 * Home-screen iPhone apps draw edge to edge (see-through status bar), but WebKit can report a
 * page height shorter than the screen, which leaves a strip under the tab bar. On an iPhone in
 * home-screen mode we size the app to the real screen height instead, via --app-h.
 * Normal browser tabs, iPads and other phones are left alone.
 */
export function fitToScreen() {
  const nav = navigator as Navigator & { standalone?: boolean }
  const standalone = nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
  if (!standalone || !/iPhone/.test(navigator.userAgent)) return
  const set = () => {
    const portrait = window.innerHeight >= window.innerWidth
    const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height)
    const gap = screenH - window.innerHeight
    // Only correct the known short-page case; anything else (e.g. the keyboard) is left as it is.
    if (gap > 0 && gap <= 140) document.documentElement.style.setProperty('--app-h', `${screenH}px`)
    else document.documentElement.style.removeProperty('--app-h')
  }
  set()
  window.addEventListener('resize', set)
  window.addEventListener('orientationchange', () => setTimeout(set, 300))
}
