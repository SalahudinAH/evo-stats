import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Api, CheckInResult, Club, Exercise, Visit, Weight, WorkoutSet } from './types'

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
export const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || ''
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)

let client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
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
      return check(await db.from('exercises').select('id, name').order('name')) as Exercise[]
    },
    async addExercise(name) { check(await db.from('exercises').insert({ name })) },
    async deleteExercise(id) { check(await db.from('exercises').delete().eq('id', id)) },
    async listSets() {
      const rows = check(await db.from('sets').select('id, exercise_id, performed_at, weight_kg, reps')
        .order('performed_at', { ascending: true })) as WorkoutSet[]
      return rows.map(r => ({ ...r, weight_kg: Number(r.weight_kg) }))
    },
    async addSet(exerciseId, weightKg, reps) {
      check(await db.from('sets').insert({ exercise_id: exerciseId, weight_kg: weightKg, reps }))
    },
    async deleteSet(id) { check(await db.from('sets').delete().eq('id', id)) },

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
  }
}
