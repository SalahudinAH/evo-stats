import { DEFAULT_GOALS } from './types'
import type {
  Api, Club, Exercise, Food, FoodEntry, Goals, Muscle, Routine, RoutineExercise, Visit, Weight, Workout, WorkoutSet,
} from './types'
import { nextWeight } from './training'

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

  // ---- Plan: push / pull / legs -----------------------------------------
  const exercises: Exercise[] = []
  const ex = (name: string, muscle: Muscle, image: string | null = null) => { const e = { id: id(), name, muscle, image }; exercises.push(e); return e }
  const bench = ex('Bench press', 'chest', 'Barbell_Bench_Press_-_Medium_Grip/0.jpg')
  const incline = ex('Incline DB press', 'chest')
  const ohp = ex('Overhead press', 'shoulders')
  const lateral = ex('Lateral raise', 'shoulders')
  const pushdown = ex('Triceps pushdown', 'triceps')
  const row = ex('Barbell row', 'back')
  const pulldown = ex('Lat pulldown', 'back')
  const curl = ex('Biceps curl', 'biceps')
  const squat = ex('Back squat', 'quads', 'Barbell_Squat/0.jpg')
  const legPress = ex('Leg press', 'quads', 'Leg_Press/0.jpg')
  const rdl = ex('Romanian deadlift', 'hamstrings', 'Romanian_Deadlift/0.jpg')

  const routines: Routine[] = [
    { id: id(), name: 'Push day', position: 0 },
    { id: id(), name: 'Pull day', position: 1 },
    { id: id(), name: 'Legs day', position: 2 },
  ]
  const routineExercises: RoutineExercise[] = []
  const plan: [Routine, Exercise, number, number, number][] = [
    [routines[0], bench, 4, 6, 8], [routines[0], incline, 3, 8, 10], [routines[0], ohp, 3, 6, 8],
    [routines[0], lateral, 4, 12, 15], [routines[0], pushdown, 3, 10, 12],
    [routines[1], row, 4, 6, 8], [routines[1], pulldown, 3, 8, 12], [routines[1], curl, 3, 10, 12],
    [routines[2], squat, 4, 5, 8], [routines[2], legPress, 3, 10, 12], [routines[2], rdl, 2, 8, 10],
  ]
  plan.forEach(([r, e, sets, lo, hi], i) => routineExercises.push({
    id: id(), routine_id: r.id, exercise_id: e.id, position: i, target_sets: sets, rep_min: lo, rep_max: hi,
  }))

  // ---- 8 weeks of history, progressing with double progression -----------
  const start: Record<string, number> = {
    [bench.id]: 55, [incline.id]: 20, [ohp.id]: 37.5, [lateral.id]: 8, [pushdown.id]: 22.5,
    [row.id]: 50, [pulldown.id]: 45, [curl.id]: 10, [squat.id]: 70, [legPress.id]: 120, [rdl.id]: 60,
  }
  const state = new Map<string, { w: number; reps: number[] }>()
  const workouts: Workout[] = []
  const sets: WorkoutSet[] = []
  let rotation = 0
  let ohpSessions = 0
  for (let d = 56; d >= 1; d--) {
    const date = new Date(now - d * day)
    if (![1, 2, 4, 6].includes(date.getDay())) continue
    const routine = routines[rotation++ % routines.length]
    date.setHours(17, 30 + (d % 4) * 5, 0, 0)
    const end = new Date(date.getTime() + (50 + (d % 9)) * 60000)
    const w: Workout = { id: id(), routine_id: routine.id, name: routine.name, started_at: date.toISOString(), finished_at: end.toISOString(), feel: ['Good', 'Hard', 'Good', 'Easy'][d % 4], notes: null }
    workouts.push(w)
    let pos = 0
    for (const re of routineExercises.filter(r => r.routine_id === routine.id)) {
      let st = state.get(re.exercise_id)
      if (!st) { st = { w: start[re.exercise_id], reps: Array(re.target_sets).fill(re.rep_min) }; state.set(re.exercise_id, st) }
      if (re.position === 0) sets.push(mkSet(re.exercise_id, w, Math.round(st.w * 0.6), 10, pos++, true))
      st.reps.forEach(r => sets.push(mkSet(re.exercise_id, w, st!.w, r, pos++, false)))
      // Progress: add a rep to the first two sets below the top of the range.
      const stalled = re.exercise_id === ohp.id && ++ohpSessions > 3
      if (stalled) continue
      if (st.reps.every(r => r >= re.rep_max)) {
        st.w = nextWeight(st.w)
        st.reps = st.reps.map(() => re.rep_min)
      } else {
        let bumps = 2
        st.reps = st.reps.map(r => (bumps > 0 && r < re.rep_max ? (bumps--, r + 1) : r))
      }
    }
  }

  function mkSet(exercise_id: string, w: Workout, weight: number, reps: number, position: number, warm: boolean): WorkoutSet {
    return { id: id(), exercise_id, performed_at: w.finished_at, weight_kg: weight, reps, workout_id: w.id, position, is_warmup: warm }
  }

  // ---- Visits: the workout days plus some older history -------------------
  const visits: Visit[] = []
  for (let d = 365; d >= 57; d--) {
    const t = new Date(now - d * day)
    if (![1, 3, 5].includes(t.getDay()) || d % 5 === 0) continue
    t.setHours(17 + (d % 3), (d * 7) % 60, 0, 0)
    visits.push({ id: id(), visited_at: t.toISOString(), source: (['arrival', 'arrival', 'manual'] as const)[d % 3], club_name: 'EVO Home club' })
  }
  for (const w of workouts) {
    visits.push({ id: id(), visited_at: new Date(new Date(w.started_at).getTime() - 5 * 60000).toISOString(), source: 'arrival', club_name: 'EVO Home club' })
  }
  visits.reverse()

  const weights: Weight[] = []
  for (let w = 26; w >= 0; w--) {
    weights.push({
      id: id(), measured_at: new Date(now - w * 7 * day).toISOString(),
      kg: Math.round((77.2 + (26 - w) * 0.11 + Math.sin(w) * 0.3) * 10) / 10,
      source: w % 2 ? 'health' : 'manual',
    })
  }

  // ---- Food ---------------------------------------------------------------
  const foods: Food[] = [
    { id: id(), name: 'Oatmeal with banana', serving: '80 g oats', kcal: 380, protein: 12, carbs: 66, fat: 8 },
    { id: id(), name: 'Skyr, natural', serving: '200 g', kcal: 140, protein: 22, carbs: 8, fat: 0 },
    { id: id(), name: 'Chicken & rice bowl', serving: '1 bowl', kcal: 640, protein: 48, carbs: 75, fat: 14 },
    { id: id(), name: 'Protein shake', serving: '1 scoop + milk', kcal: 180, protein: 25, carbs: 9, fat: 4 },
    { id: id(), name: 'Bread with cheese', serving: '2 slices', kcal: 300, protein: 21, carbs: 12, fat: 26 },
    { id: id(), name: 'Banana', serving: '1 medium', kcal: 105, protein: 1, carbs: 27, fat: 0 },
  ]
  const entries: FoodEntry[] = []
  const eat = (daysAgo: number, hour: number, meal: FoodEntry['meal'], f: Food) => {
    const t = new Date(now - daysAgo * day)
    t.setHours(hour, 0, 0, 0)
    if (t.getTime() > now) t.setTime(now - 60000)
    const { id: food_id, ...rest } = f
    entries.push({ ...rest, id: id(), food_id, eaten_at: t.toISOString(), meal })
  }
  for (let d = 6; d >= 1; d--) {
    eat(d, 8, 'breakfast', foods[0]); eat(d, 8, 'breakfast', foods[1]); eat(d, 12, 'lunch', foods[2])
    eat(d, 16, 'snack', foods[3]); eat(d, 19, 'dinner', foods[2]); if (d % 2) eat(d, 21, 'snack', foods[4])
  }
  eat(0, 8, 'breakfast', foods[0]); eat(0, 8, 'breakfast', foods[1]); eat(0, 12, 'lunch', foods[2]); eat(0, 15, 'snack', foods[3])

  let goals: Goals = {
    ...DEFAULT_GOALS, sex: 'male', birth_year: 2000, height_cm: 180, activity: 'moderate',
    goal_weight_kg: 83, plan: 'lean_bulk', onboarded: !new URLSearchParams(window.location.search).has('onboarding'),
  }
  let shortcutKey: string | null = null
  const wait = () => new Promise(r => setTimeout(r, 60))
  const remove = <T extends { id: string }>(list: T[], rid: string) => { const i = list.findIndex(x => x.id === rid); if (i >= 0) list.splice(i, 1) }
  const clone = <T,>(xs: T[]) => xs.map(x => ({ ...x }))

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
    async deleteVisit(vid) { remove(visits, vid) },

    async listClubs() { await wait(); return clone(clubs) },
    async addClub(name, lat, lng, favorite) {
      if (favorite) clubs.forEach(c => (c.is_favorite = false))
      clubs.push({ id: id(), name, lat, lng, is_favorite: favorite })
    },
    async setFavorite(cid) { clubs.forEach(c => (c.is_favorite = c.id === cid)) },
    async deleteClub(cid) { remove(clubs, cid) },

    async listWeights() { await wait(); return [...weights] },
    async addWeight(kg) { weights.push({ id: id(), measured_at: new Date().toISOString(), kg, source: 'manual' }) },
    async deleteWeight(wid) { remove(weights, wid) },

    async listExercises() { await wait(); return clone(exercises).sort((a, b) => a.name.localeCompare(b.name)) },
    async addExercise(name, muscle, image = null) {
      if (exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) throw new Error('duplicate key value')
      const e = { id: id(), name, muscle, image }
      exercises.push(e)
      return { ...e }
    },
    async updateExercise(eid, patch) { const e = exercises.find(x => x.id === eid); if (e) Object.assign(e, patch) },
    async deleteExercise(eid) {
      remove(exercises, eid)
      for (let j = sets.length - 1; j >= 0; j--) if (sets[j].exercise_id === eid) sets.splice(j, 1)
      for (let j = routineExercises.length - 1; j >= 0; j--) if (routineExercises[j].exercise_id === eid) routineExercises.splice(j, 1)
    },
    async listSets() { await wait(); return clone(sets) },
    async deleteSet(sid) { remove(sets, sid) },

    async listRoutines() { await wait(); return clone(routines).sort((a, b) => a.position - b.position) },
    async listRoutineExercises() { await wait(); return clone(routineExercises).sort((a, b) => a.position - b.position) },
    async addRoutine(name) {
      const r = { id: id(), name, position: Math.max(-1, ...routines.map(x => x.position)) + 1 }
      routines.push(r)
      return { ...r }
    },
    async renameRoutine(rid, name) { const r = routines.find(x => x.id === rid); if (r) r.name = name },
    async deleteRoutine(rid) {
      remove(routines, rid)
      for (let j = routineExercises.length - 1; j >= 0; j--) if (routineExercises[j].routine_id === rid) routineExercises.splice(j, 1)
      workouts.forEach(w => { if (w.routine_id === rid) w.routine_id = null })
    },
    async setRoutineExercises(rid, items) {
      for (let j = routineExercises.length - 1; j >= 0; j--) if (routineExercises[j].routine_id === rid) routineExercises.splice(j, 1)
      items.forEach((it, i) => routineExercises.push({ ...it, id: id(), routine_id: rid, position: i }))
    },

    async listWorkouts() { await wait(); return clone(workouts) },
    async saveWorkout(nw) {
      const { sets: newSets, ...rest } = nw
      const w: Workout = { ...rest, id: id() }
      workouts.push(w)
      for (const s of newSets) sets.push({ ...s, id: id(), workout_id: w.id, performed_at: w.finished_at })
      return w.id
    },
    async deleteWorkout(wid) {
      remove(workouts, wid)
      for (let j = sets.length - 1; j >= 0; j--) if (sets[j].workout_id === wid) sets.splice(j, 1)
    },

    async listFoods() { await wait(); return clone(foods) },
    async addFood(f) { const food = { ...f, id: id() }; foods.push(food); return { ...food } },
    async deleteFood(fid) { remove(foods, fid) },
    async listFoodEntries(from, to) {
      await wait()
      return clone(entries.filter(e => e.eaten_at >= from && e.eaten_at < to)).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at))
    },
    async addFoodEntry(e) { entries.push({ ...e, id: id(), eaten_at: e.eaten_at ?? new Date().toISOString() }) },
    async deleteFoodEntry(eid) { remove(entries, eid) },

    async getGoals() { return { ...goals } },
    async saveGoals(g) { goals = { ...g } },

    async getShortcutKey() { return shortcutKey },
    async rotateShortcutKey() { shortcutKey = crypto.randomUUID(); return shortcutKey },

    async signOut() { window.location.search = '' },
    async centreBusyness(visitsId) {
      await wait()
      // A believable evening at the gym, different per centre.
      const seed = [...visitsId].reduce((a, c) => a + c.charCodeAt(0), 0)
      const capacity = 30 + (seed % 5) * 10
      const h = new Date().getHours()
      const shape = [[6, 10, 35], [10, 12, 48], [12, 15, 42], [15, 17, 70], [17, 20, 82], [20, 24, 30]] as const
      const intervals = shape.map(([begin, end, base]) => ({
        begin, end, label: `${String(begin).padStart(2, '0')}-${end}`, percent: base + (seed % 9) - 4,
        status: h >= end ? 'historic' : h >= begin ? 'current' : 'future',
      }))
      const cur = intervals.find(i => i.status === 'current')?.percent ?? 12
      const current = Math.round((capacity * cur) / 100)
      return { current, capacity, percent: (current / capacity) * 100, intervals, fetchedAt: new Date().toISOString() }
    },
    async deleteAccount() { window.location.search = '' },
  }
}
