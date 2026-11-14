import { useEffect, useState } from 'react'
import type { Api, DailyActivity, Goals, Workout } from './types'
import { maintenance } from './nutrition'

/**
 * Calories burned by moving, on top of what your body burns at rest.
 * - Walking: about 0.5 kcal per kg of body weight per km, at roughly 0.75 m a step.
 * - Strength training: about 5 METs; minus the 1 MET you'd burn sitting, that's 4 kcal per kg per hour.
 * - With an Apple Watch, Apple Health's own "Active Energy" is used instead, since it already
 *   includes walking and workouts and is measured, not estimated.
 */
export const KCAL_PER_STEP_PER_KG = 0.5 * 0.75 / 1000
const STRENGTH_NET_KCAL_PER_KG_HOUR = 4

export interface Burned {
  total: number
  steps: number
  fromSteps: number
  workoutMinutes: number
  fromWorkouts: number
  /** Apple Watch active energy, when the Shortcut sent it. */
  fromHealth: number | null
}

export function burned(activity: DailyActivity | null, workouts: Workout[], kg: number): Burned {
  const steps = activity?.steps ?? 0
  const fromSteps = Math.round(steps * kg * KCAL_PER_STEP_PER_KG)
  const minutes = workouts.reduce((sum, w) => {
    if (!w.finished_at) return sum
    const m = (new Date(w.finished_at).getTime() - new Date(w.started_at).getTime()) / 60000
    return sum + Math.min(Math.max(m, 0), 180)
  }, 0)
  const fromWorkouts = Math.round((minutes / 60) * kg * STRENGTH_NET_KCAL_PER_KG_HOUR)
  const fromHealth = activity?.active_kcal && activity.active_kcal > 0 ? Math.round(activity.active_kcal) : null
  return { total: fromHealth ?? fromSteps + fromWorkouts, steps, fromSteps, workoutMinutes: Math.round(minutes), fromWorkouts, fromHealth }
}

/**
 * Your goal already includes an activity level (e.g. "Moderate" ≈ 1.55 × resting burn). That much
 * movement is already paid for, so only what you burn beyond it is added to the day.
 */
export function activityAllowance(g: Goals, kg: number): number {
  if (!g.sex || !g.birth_year || !g.height_cm || !g.activity || g.activity === 'sedentary') return 0
  const age = new Date().getFullYear() - g.birth_year
  return Math.max(0, maintenance(g.sex, kg, g.height_cm, age, g.activity) - maintenance(g.sex, kg, g.height_cm, age, 'sedentary'))
}

export interface Budget {
  /** The goal to show for this day (kcal and macros), burned calories included when switched on. */
  goal: Goals | null
  on: boolean
  base: number | null
  /** Movement already counted in your goal by its activity level. */
  allowance: number
  /** Burned calories beyond that, added to today's goal. */
  extra: number
  burn: Burned | null
  activity: DailyActivity | null
  reload: () => void
}

/** The iOS Shortcut that sends today's steps. The Sync button runs it by this name. */
export const STEPS_SHORTCUT = 'EVO steps'
let syncStarted = 0

/** Opens Shortcuts and runs the steps shortcut. When you come back, the hook below fetches the new numbers. */
export function syncSteps() {
  syncStarted = Date.now()
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(STEPS_SHORTCUT)}`
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The day's calorie budget: your goal, plus (when switched on) what you burned beyond your activity level. */
export function useBudget(api: Api, goals: Goals | null, from: Date, to: Date): Budget {
  const [state, setState] = useState<{ on: boolean; activity: DailyActivity | null; workouts: Workout[]; kg: number | null }>({ on: false, activity: null, workouts: [], kg: null })
  const [version, setVersion] = useState(0)
  const day = isoDay(from)
  useEffect(() => {
    let live = true
    Promise.all([
      api.getAddBurned().catch(() => false),
      api.getActivity(day).catch(() => null),
      api.listWorkouts().catch(() => []),
      api.listWeights().catch(() => []),
    ]).then(([on, activity, workouts, weights]) => {
      if (!live) return
      const dayWorkouts = workouts.filter(w => { const t = new Date(w.started_at).getTime(); return t >= from.getTime() && t < to.getTime() })
      const kg = weights.length ? weights[weights.length - 1].kg : null
      setState({ on, activity, workouts: dayWorkouts, kg })
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, day, version])

  // Coming back to the app (e.g. from the Sync shortcut, or after an automation ran): fetch again.
  // Right after a sync, check once more a few seconds later in case the shortcut was still sending.
  useEffect(() => {
    let timer: number | undefined
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      setVersion(v => v + 1)
      if (Date.now() - syncStarted < 120_000) {
        syncStarted = 0
        window.clearTimeout(timer)
        timer = window.setTimeout(() => setVersion(v => v + 1), 3000)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { document.removeEventListener('visibilitychange', onVisible); window.clearTimeout(timer) }
  }, [])

  const kg = state.kg ?? 75
  const burn = state.activity || state.workouts.length ? burned(state.activity, state.workouts, kg) : null
  if (!goals) return { goal: null, on: state.on, base: null, allowance: 0, extra: 0, burn, activity: state.activity, reload: () => setVersion(v => v + 1) }
  if (!state.on) return { goal: goals, on: false, base: goals.kcal, allowance: 0, extra: 0, burn, activity: state.activity, reload: () => setVersion(v => v + 1) }
  // Your goal already counts the movement your activity level assumes (`allowance`). Only what you
  // burn beyond that is added, so the goal never drops below what you set, and nothing counts twice.
  const allowance = activityAllowance(goals, kg)
  const base = goals.kcal
  const extra = Math.max(0, Math.round((burn?.total ?? 0) - allowance))
  const kcal = goals.kcal + extra
  // Protein and fat stay as set; the extra calories go to carbs, the fuel for training.
  const carbs = Math.round(goals.carbs + extra / 4)
  return { goal: { ...goals, carbs, kcal }, on: true, base, allowance, extra, burn, activity: state.activity, reload: () => setVersion(v => v + 1) }
}

