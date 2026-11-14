import type { Skip } from './training'

/** Skipped workouts are kept on this phone, per account. Only the last 4 weeks are kept. */
const key = (owner: string) => `evo-stats.skips.${owner}`

export function loadSkips(owner: string): Skip[] {
  try {
    const list = JSON.parse(localStorage.getItem(key(owner)) ?? '[]') as Skip[]
    const cutoff = Date.now() - 28 * 86_400_000
    return Array.isArray(list) ? list.filter(s => s && typeof s.routine_id === 'string' && new Date(s.at).getTime() > cutoff) : []
  } catch { return [] }
}

function save(owner: string, list: Skip[]) {
  try { localStorage.setItem(key(owner), JSON.stringify(list)) } catch { /* private mode: skips just aren't remembered */ }
}

export function addSkip(owner: string, routineId: string) {
  save(owner, [...loadSkips(owner), { routine_id: routineId, at: new Date().toISOString() }])
}

export function undoSkip(owner: string) {
  save(owner, loadSkips(owner).slice(0, -1))
}
