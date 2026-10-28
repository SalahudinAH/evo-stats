import type { Visit, WorkoutSet } from './types'

const DAY = 24 * 3600 * 1000

export function countSince(visits: Visit[], days: number): number {
  const cutoff = Date.now() - days * DAY
  return visits.filter(v => new Date(v.visited_at).getTime() >= cutoff).length
}

/** Estimated one-rep max (Epley). Lets 5×100 and 8×90 be compared on one scale. */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0) return 0
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

/** Monday of the week containing `d`, at 00:00 local time. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const offset = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - offset)
  return x
}

export function weeklyCounts(visits: Visit[], weeks: number): { start: Date; count: number }[] {
  const thisWeek = startOfWeek(new Date())
  const buckets: { start: Date; count: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek)
    start.setDate(start.getDate() - i * 7)
    buckets.push({ start, count: 0 })
  }
  const first = buckets[0].start.getTime()
  for (const v of visits) {
    const t = new Date(v.visited_at).getTime()
    if (t < first) continue
    // Round, not floor: a week across a DST change is 167 or 169 hours long.
    const idx = Math.round((startOfWeek(new Date(t)).getTime() - first) / (7 * DAY))
    if (idx >= 0 && idx < buckets.length) buckets[idx].count++
  }
  return buckets
}

/** Longest run of consecutive weeks (ending this or last week) with at least one visit. */
export function weekStreak(visits: Visit[]): number {
  const counts = weeklyCounts(visits, 104)
  let i = counts.length - 1
  if (counts[i].count === 0) i-- // this week may not have started yet
  let streak = 0
  for (; i >= 0 && counts[i].count > 0; i--) streak++
  return streak
}

/** Best e1RM per day for one exercise, oldest first. */
export function e1rmSeries(sets: WorkoutSet[]): { date: Date; value: number; set: WorkoutSet }[] {
  const byDay = new Map<string, { date: Date; value: number; set: WorkoutSet }>()
  for (const s of sets) {
    const d = new Date(s.performed_at)
    const key = d.toDateString()
    const value = e1rm(s.weight_kg, s.reps)
    const cur = byDay.get(key)
    if (!cur || value > cur.value) byDay.set(key, { date: d, value, set: s })
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}

/** Visits per hour of day for one club → 0..1 relative to your busiest hour. */
export function hourlyPattern(visits: Visit[], clubName: string): number[] {
  const hours = new Array(24).fill(0)
  for (const v of visits) if (v.club_name === clubName) hours[new Date(v.visited_at).getHours()]++
  const max = Math.max(...hours)
  return max ? hours.map(h => h / max) : hours
}

export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export const fmtDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
