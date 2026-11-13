/** The app scrolls inside <main>, not the window. */
export function scrollToTop() {
  document.querySelector('main')?.scrollTo({ top: 0 })
}
