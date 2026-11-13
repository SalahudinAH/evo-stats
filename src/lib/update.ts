/**
 * Picks up new deploys without closing the app.
 * GitHub Pages lets phones reuse index.html for up to 10 minutes, so we ask for a tiny
 * version.json with caching off, and reload through a fresh URL when the id has changed.
 */
declare const __BUILD_ID__: string
export const BUILD_ID = __BUILD_ID__

const URL_PARAM = 'v'
let lastCheck = 0

async function latestId(): Promise<string | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    return typeof j?.id === 'string' ? j.id : null
  } catch {
    return null
  }
}

/** Load the new version. A new query string skips the cached index.html. */
export function applyUpdate(id: string) {
  const { pathname, search, hash } = window.location
  window.location.replace(`${pathname}${search}${search ? '&' : '?'}${URL_PARAM}=${encodeURIComponent(id)}${hash}`)
}

/** Reloading now would lose something: a sign-in link being processed, an open sheet, or typing. */
function busy() {
  const h = window.location.hash
  if (/access_token|refresh_token|error_description|type=recovery/.test(h) || new URLSearchParams(window.location.search).has('code')) return true
  if (document.querySelector('.sheet')) return true
  const a = document.activeElement
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')
}

async function check(mode: 'open' | 'background', onReady: (id: string) => void) {
  if (Date.now() - lastCheck < 15_000) return
  lastCheck = Date.now()
  const id = await latestId()
  if (!id || id === BUILD_ID) return
  if (mode === 'open' && !busy()) applyUpdate(id)
  else onReady(id)
}

/** Check when the app opens or comes back to the front, and every 5 minutes while it's open. */
export function startUpdateChecks(onReady: (id: string) => void) {
  // Tidy the address after an update reload.
  const { pathname, search, hash } = window.location
  const cleaned = search.replace(new RegExp(`[?&]${URL_PARAM}=[^&]*`), '').replace(/^&/, '?')
  if (cleaned !== search) history.replaceState(history.state, '', pathname + cleaned + hash)
  if (import.meta.env.DEV) return () => undefined
  check('open', onReady)
  const onVisible = () => { if (document.visibilityState === 'visible') check('open', onReady) }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', onVisible)
  const timer = window.setInterval(() => { if (document.visibilityState === 'visible') check('background', onReady) }, 5 * 60_000)
  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', onVisible)
    window.clearInterval(timer)
  }
}
