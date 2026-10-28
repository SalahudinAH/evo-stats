import type { Api, Club, Exercise, Visit, Weight, WorkoutSet } from './types'

/** In-memory data so you can try the app before setting up Supabase (?demo). */
export function createDemoApi(): Api {
  const day = 24 * 3600 * 1000
  const now = Date.now()
  let seq = 0
  const id = () => `demo-${++seq}`

  const clubs: Club[] = [
    { id: id(), name: 'EVO Home club', lat: 59.9139, lng: 10.7522, is_favorite: true },
    { id: id(), name: 'EVO Second club', lat: 59.9290, lng: 10.7150, is_favorite: false },
  ]

  // ~3-4 visits a week over the last year, mostly evenings.
  const visits: Visit[] = []
  for (let d = 365; d >= 0; d--) {
    const dow = new Date(now - d * day).getDay()
    const train = [1, 3, 5].includes(dow) || (dow === 6 && d % 2 === 0)
    if (!train || (d > 200 && d % 5 === 0)) continue
    const t = new Date(now - d * day)
    t.setHours(dow === 6 ? 11 : 17 + (d % 3), (d * 7) % 60, 0, 0)
    if (t.getTime() > now) continue
    visits.push({
      id: id(), visited_at: t.toISOString(),
      source: (['arrival', 'nfc', 'manual'] as const)[d % 3],
      club_name: d % 6 === 0 ? 'EVO Second club' : 'EVO Home club',
    })
  }
  visits.reverse()

  const exercises: Exercise[] = [
    { id: id(), name: 'Back squat' },
    { id: id(), name: 'Bench press' },
    { id: id(), name: 'Deadlift' },
  ]
  const sets: WorkoutSet[] = []
  const base = [80, 60, 100]
  exercises.forEach((ex, i) => {
    for (let w = 16; w >= 0; w--) {
      const reps = [5, 8, 6][(w + i) % 3]
      const weight = base[i] + (16 - w) * [2.5, 1.25, 2.5][i] - (reps === 8 ? 10 : 0)
      sets.push({ id: id(), exercise_id: ex.id, performed_at: new Date(now - w * 7 * day).toISOString(), weight_kg: weight, reps })
    }
  })

  const weights: Weight[] = []
  for (let w = 26; w >= 0; w--) {
    weights.push({
      id: id(), measured_at: new Date(now - w * 7 * day).toISOString(),
      kg: Math.round((78.5 - (26 - w) * 0.12 + Math.sin(w) * 0.4) * 10) / 10,
      source: w % 2 ? 'health' : 'manual',
    })
  }

  let shortcutKey: string | null = null
  const wait = () => new Promise(r => setTimeout(r, 80))

  return {
    mode: 'demo',
    async listVisits() { await wait(); return [...visits] },
    async checkIn(club) {
      await wait()
      const last = visits[0] ? new Date(visits[0].visited_at).getTime() : 0
      const month = () => visits.filter(v => new Date(v.visited_at).getTime() > Date.now() - 30 * day).length
      if (Date.now() - last < 3 * 3600 * 1000) {
        return { logged: false, message: `Already logged this session. ${month()} visits in the last 30 days.` }
      }
      visits.unshift({ id: id(), visited_at: new Date().toISOString(), source: 'manual', club_name: club })
      return { logged: true, message: `Visit logged. ${month()} visits in the last 30 days.` }
    },
    async deleteVisit(vid) { const i = visits.findIndex(v => v.id === vid); if (i >= 0) visits.splice(i, 1) },

    async listClubs() { await wait(); return clubs.map(c => ({ ...c })) },
    async addClub(name, lat, lng, favorite) {
      if (favorite) clubs.forEach(c => (c.is_favorite = false))
      clubs.push({ id: id(), name, lat, lng, is_favorite: favorite })
    },
    async setFavorite(cid) { clubs.forEach(c => (c.is_favorite = c.id === cid)) },
    async deleteClub(cid) { const i = clubs.findIndex(c => c.id === cid); if (i >= 0) clubs.splice(i, 1) },

    async listWeights() { await wait(); return [...weights] },
    async addWeight(kg) { weights.push({ id: id(), measured_at: new Date().toISOString(), kg, source: 'manual' }) },
    async deleteWeight(wid) { const i = weights.findIndex(w => w.id === wid); if (i >= 0) weights.splice(i, 1) },

    async listExercises() { await wait(); return [...exercises].sort((a, b) => a.name.localeCompare(b.name)) },
    async addExercise(name) { exercises.push({ id: id(), name }) },
    async deleteExercise(eid) {
      const i = exercises.findIndex(e => e.id === eid); if (i >= 0) exercises.splice(i, 1)
      for (let j = sets.length - 1; j >= 0; j--) if (sets[j].exercise_id === eid) sets.splice(j, 1)
    },
    async listSets() { await wait(); return [...sets] },
    async addSet(exerciseId, weightKg, reps) {
      sets.push({ id: id(), exercise_id: exerciseId, performed_at: new Date().toISOString(), weight_kg: weightKg, reps })
    },
    async deleteSet(sid) { const i = sets.findIndex(s => s.id === sid); if (i >= 0) sets.splice(i, 1) },

    async getShortcutKey() { return shortcutKey },
    async rotateShortcutKey() { shortcutKey = crypto.randomUUID(); return shortcutKey },

    async signOut() { window.location.search = '' },
  }
}
