import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { BusynessNotSetUp, DEFAULT_GOALS } from './types'
import type {
  Busyness,
  DailyActivity,
  Schedule,
  Api, CheckInResult, Club, Exercise, Food, FoodEntry, Goals, Routine, RoutineExercise, Visit, Weight, Workout, WorkoutSet,
} from './types'

/** Postgres numeric columns arrive as strings. */
function numMacros<T extends { kcal: number; protein: number; carbs: number; fat: number }>(r: T): T {
  return { ...r, kcal: Number(r.kcal), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat) }
}

/**
 * Keep only "https://<project>.supabase.co". People often paste the API URL
 * with "/rest/v1/" or a trailing slash, which makes Supabase answer
 * "Invalid path specified in request url".
 */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  const s = (raw ?? '').trim().replace(/^["']|["']$/g, '')
  if (!s) return ''
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).origin
  } catch {
    return s.replace(/\/+$/, '')
  }
}

export const SUPABASE_URL = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined)
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || ''
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

const REMEMBER_KEY = 'evo-stats.keep-signed-in'

/** "Keep me signed in": on by default. Off = signed out when the app is closed. */
export function keepSignedIn(): boolean {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0' } catch { return true }
}

export function setKeepSignedIn(on: boolean) {
  try { localStorage.setItem(REMEMBER_KEY, on ? '1' : '0') } catch { /* storage blocked */ }
  if (on) askToKeepStorage()
}

/**
 * Ask the browser not to clear this app's storage when the phone is low on
 * space. Without it, iOS may wipe the saved login and you have to sign in again.
 */
export function askToKeepStorage() {
  navigator.storage?.persist?.().catch(() => undefined)
}

/** Saved login lives in localStorage (survives closing the app) or sessionStorage (doesn't). */
const authStorage = {
  getItem(key: string) {
    try { return localStorage.getItem(key) ?? sessionStorage.getItem(key) } catch { return null }
  },
  setItem(key: string, value: string) {
    try {
      const [keep, drop] = keepSignedIn() ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
      keep.setItem(key, value)
      drop.removeItem(key)
    } catch { /* storage blocked: stays signed in until the page closes */ }
  },
  removeItem(key: string) {
    try { localStorage.removeItem(key); sessionStorage.removeItem(key) } catch { /* ignore */ }
  },
}

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage: authStorage },
    })
  }
  return client
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/** Supabase returns at most 1000 rows per request, so page through big tables. */
async function all<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const rows = check(await page(from, from + size - 1)) ?? []
    out.push(...rows)
    if (rows.length < size) return out
  }
}

const YEAR_MS = 366 * 24 * 3600 * 1000

export function createSupabaseApi(): Api {
  const db = supabase()
  return {
    mode: 'supabase',

    async listVisits() {
      const since = new Date(Date.now() - YEAR_MS).toISOString()
      return check(await db.from('visits').select('id, visited_at, source, club_name')
        .gte('visited_at', since).order('visited_at', { ascending: false })) as Visit[]
    },
    async checkIn(club) {
      return check(await db.rpc('check_in', { p_source: 'manual', p_club: club })) as CheckInResult
    },
    async deleteVisit(id) { check(await db.from('visits').delete().eq('id', id)) },

    async listClubs() {
      return check(await db.from('clubs').select('id, name, lat, lng, is_favorite').order('name')) as Club[]
    },
    async addClub(name, lat, lng, favorite) {
      if (favorite) check(await db.from('clubs').update({ is_favorite: false }).eq('is_favorite', true))
      check(await db.from('clubs').insert({ name, lat, lng, is_favorite: favorite }))
    },
    async setFavorite(id) {
      check(await db.from('clubs').update({ is_favorite: false }).neq('id', id))
      check(await db.from('clubs').update({ is_favorite: true }).eq('id', id))
    },
    async deleteClub(id) { check(await db.from('clubs').delete().eq('id', id)) },

    async listWeights() {
      const rows = check(await db.from('weights').select('id, measured_at, kg, source')
        .order('measured_at', { ascending: true })) as Weight[]
      return rows.map(r => ({ ...r, kg: Number(r.kg) }))
    },
    async addWeight(kg) { check(await db.from('weights').insert({ kg })) },
    async deleteWeight(id) { check(await db.from('weights').delete().eq('id', id)) },

    async listExercises() {
      const res = await db.from('exercises').select('id, name, muscle, image').order('name')
      if (res.error?.code === '42703') {
        // Database not updated yet: no image column.
        const old = check(await db.from('exercises').select('id, name, muscle').order('name')) as Exercise[]
        return old.map(e => ({ ...e, image: null }))
      }
      return check(res) as Exercise[]
    },
    async addExercise(name, muscle, image = null) {
      const row = image ? { name, muscle, image } : { name, muscle }
      const e = check(await db.from('exercises').insert(row).select('*').single()) as Exercise
      return { ...e, image: e.image ?? null }
    },
    async updateExercise(id, patch) { check(await db.from('exercises').update(patch).eq('id', id)) },
    async deleteExercise(id) { check(await db.from('exercises').delete().eq('id', id)) },
    async listSets() {
      const rows = await all<WorkoutSet>((from, to) => db.from('sets')
        .select('id, exercise_id, performed_at, weight_kg, reps, workout_id, position, is_warmup')
        .order('performed_at', { ascending: true })
        .order('position', { ascending: true })
        .order('id').range(from, to))
      return rows.map(r => ({ ...r, weight_kg: Number(r.weight_kg) }))
    },
    async deleteSet(id) { check(await db.from('sets').delete().eq('id', id)) },

    async listRoutines() {
      return check(await db.from('routines').select('id, name, position').order('position').order('name')) as Routine[]
    },
    async listRoutineExercises() {
      return check(await db.from('routine_exercises')
        .select('id, routine_id, exercise_id, position, target_sets, rep_min, rep_max')
        .order('position')) as RoutineExercise[]
    },
    async addRoutine(name) {
      const existing = check(await db.from('routines').select('position').order('position', { ascending: false }).limit(1)) as { position: number }[]
      const position = (existing[0]?.position ?? -1) + 1
      return check(await db.from('routines').insert({ name, position }).select('id, name, position').single()) as Routine
    },
    async renameRoutine(id, name) { check(await db.from('routines').update({ name }).eq('id', id)) },
    async deleteRoutine(id) { check(await db.from('routines').delete().eq('id', id)) },
    async setRoutineExercises(routineId, items) {
      check(await db.from('routine_exercises').delete().eq('routine_id', routineId))
      if (items.length) {
        check(await db.from('routine_exercises').insert(items.map((it, i) => ({ ...it, routine_id: routineId, position: i }))))
      }
    },

    async getActivity(day) {
      const res = await db.from('daily_activity').select('day, steps, active_kcal, updated_at').eq('day', day).limit(1)
      if (res.error && ['42P01', 'PGRST205'].includes(res.error.code)) return null // table not created yet
      const rows = check(res) as DailyActivity[]
      const r = rows[0]
      return r ? { ...r, active_kcal: r.active_kcal === null ? null : Number(r.active_kcal) } : null
    },
    async getAddBurned() {
      const res = await db.from('user_settings').select('add_burned').limit(1)
      if (res.error?.code === '42703') return false
      const rows = check(res) as { add_burned: boolean }[]
      return rows[0]?.add_burned ?? false
    },
    async setAddBurned(on) {
      const { data } = await db.auth.getSession()
      if (!data.session) throw new Error('Not signed in')
      const res = await db.from('user_settings').upsert({ user_id: data.session.user.id, add_burned: on })
      if (res.error && ['42703', 'PGRST204'].includes(res.error.code)) throw new Error('Run the latest supabase/schema.sql first (adds the add_burned setting).')
      check(res)
    },

    async getSchedule() {
      const res = await db.from('user_settings').select('schedule').limit(1)
      if (res.error?.code === '42703') return null // database not updated yet
      const rows = check(res) as { schedule: Schedule | null }[]
      return rows[0]?.schedule ?? null
    },
    async setSchedule(schedule) {
      const { data } = await db.auth.getSession()
      if (!data.session) throw new Error('Not signed in')
      check(await db.from('user_settings').upsert({ user_id: data.session.user.id, schedule }))
    },

    async listWorkouts() {
      return all<Workout>((from, to) => db.from('workouts').select('id, routine_id, name, started_at, finished_at, feel, notes')
        .order('started_at', { ascending: true }).order('id').range(from, to))
    },
    async saveWorkout(w) { return check(await db.rpc('save_workout', { p: w })) as string },
    async deleteWorkout(id) { check(await db.from('workouts').delete().eq('id', id)) },

    async listFoods() {
      const res = await db.from('foods').select('*').order('name')
      const rows = check(res) as Food[]
      return rows.map(numMacros)
    },
    async addFood(f) {
      return numMacros(check(await db.from('foods').insert(f.barcode ? f : { ...f, barcode: undefined }).select('*').single()) as Food)
    },
    async deleteFood(id) { check(await db.from('foods').delete().eq('id', id)) },
    async listFoodEntries(fromIso, toIso) {
      const rows = check(await db.from('food_entries')
        .select('id, eaten_at, meal, food_id, name, serving, kcal, protein, carbs, fat')
        .gte('eaten_at', fromIso).lt('eaten_at', toIso).order('eaten_at')) as FoodEntry[]
      return rows.map(numMacros)
    },
    async addFoodEntry(e) { check(await db.from('food_entries').insert(e)) },
    async deleteFoodEntry(id) { check(await db.from('food_entries').delete().eq('id', id)) },
    async moveFoodEntry(id, meal) { check(await db.from('food_entries').update({ meal }).eq('id', id)) },

    async getGoals() {
      const res = await db.from('user_settings')
        .select('kcal, protein, carbs, fat, workouts_per_week, sex, birth_year, height_cm, activity, goal_weight_kg, plan, onboarded')
        .limit(1)
      if (res.error?.code === '42703') {
        // Database not updated yet (no body-stat columns): keep working with the old goals, skip the setup.
        const old = check(await db.from('user_settings').select('kcal, protein, carbs, fat, workouts_per_week').limit(1)) as Goals[]
        return { ...DEFAULT_GOALS, ...old[0], onboarded: true }
      }
      const rows = check(res) as Goals[]
      const g = rows[0]
      return g ? { ...g, goal_weight_kg: g.goal_weight_kg === null ? null : Number(g.goal_weight_kg) } : DEFAULT_GOALS
    },
    async saveGoals(g) {
      const { data } = await db.auth.getSession()
      if (!data.session) throw new Error('Not signed in')
      check(await db.from('user_settings').upsert({ ...g, user_id: data.session.user.id }))
    },

    async getShortcutKey() {
      const rows = check(await db.from('shortcut_tokens').select('token').limit(1)) as { token: string }[]
      return rows[0]?.token ?? null
    },
    async rotateShortcutKey() {
      const { data: userData } = await db.auth.getUser()
      if (!userData.user) throw new Error('Not signed in')
      check(await db.from('shortcut_tokens').delete().eq('user_id', userData.user.id))
      const row = check(await db.from('shortcut_tokens').insert({}).select('token').single()) as { token: string }
      return row.token
    },

    async signOut() { await db.auth.signOut() },
    async centreBusyness(visitsId) {
      const { data, error } = await db.functions.invoke('evo-visits', { body: { id: visitsId } })
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status
        if (status === 404 || error.name === 'FunctionsFetchError') throw new BusynessNotSetUp('Live busyness is not set up yet.')
        throw new Error('Could not get live numbers from EVO right now.')
      }
      return data as Busyness
    },
    async deleteAccount() {
      check(await db.rpc('delete_my_account'))
      // The login no longer exists on the server; just forget it here.
      await db.auth.signOut({ scope: 'local' })
    },
  }
}
