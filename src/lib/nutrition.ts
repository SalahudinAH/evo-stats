import type { Activity, Macros, PlanId, Sex } from './types'

export const ACTIVITY: Record<Activity, { label: string; detail: string; factor: number }> = {
  sedentary: { label: 'Mostly sitting', detail: 'Desk job, little exercise', factor: 1.2 },
  light: { label: 'Lightly active', detail: '1–3 workouts a week', factor: 1.375 },
  moderate: { label: 'Active', detail: '3–5 workouts a week', factor: 1.55 },
  active: { label: 'Very active', detail: '6–7 workouts a week or a physical job', factor: 1.725 },
}

/** Calories burned at rest (Mifflin–St Jeor). */
export function restingBurn(sex: Sex, kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
}

/** Estimated calories a day to keep the same weight. Rounded to 10. */
export function maintenance(sex: Sex, kg: number, cm: number, age: number, activity: Activity): number {
  return Math.round((restingBurn(sex, kg, cm, age) * ACTIVITY[activity].factor) / 10) * 10
}

/** About 7,700 kcal is one kilo of body weight. */
const KCAL_PER_KG = 7700

export interface PlanOption {
  id: PlanId
  label: string
  kcal: number
  /** Expected change per week, negative when losing. */
  kgPerWeek: number
  /** Weeks to the goal weight, when there is one in this direction. */
  weeks: number | null
  note: string | null
}

const PLANS: Record<PlanId, { label: string; delta: number }> = {
  aggressive_cut: { label: 'Aggressive cut', delta: -750 },
  cut: { label: 'Cut', delta: -500 },
  mild_cut: { label: 'Mild cut', delta: -250 },
  maintain: { label: 'Maintain', delta: 0 },
  lean_bulk: { label: 'Lean bulk', delta: 250 },
  bulk: { label: 'Bulk', delta: 500 },
}

export const planLabel = (id: PlanId) => PLANS[id].label

/**
 * The options that make sense for the goal: cuts when the goal is lower,
 * bulks when it's higher, and always "maintain". Never below what the body
 * burns at rest, or a sensible minimum.
 */
export function planOptions(sex: Sex, maint: number, rest: number, current: number, goal: number): PlanOption[] {
  const diff = goal - current
  const ids: PlanId[] = diff < -0.5 ? ['mild_cut', 'cut', 'aggressive_cut', 'maintain']
    : diff > 0.5 ? ['lean_bulk', 'bulk', 'maintain']
    : ['maintain']
  const floor = Math.max(Math.round(rest / 10) * 10, sex === 'male' ? 1500 : 1200)
  return ids.map(id => {
    const wanted = maint + PLANS[id].delta
    const kcal = Math.max(wanted, floor)
    const kgPerWeek = ((kcal - maint) * 7) / KCAL_PER_KG
    const weeks = kgPerWeek !== 0 && Math.sign(kgPerWeek) === Math.sign(diff)
      ? Math.ceil(Math.abs(diff / kgPerWeek)) : null
    return {
      id, label: PLANS[id].label, kcal, kgPerWeek, weeks,
      note: kcal > wanted ? `Kept at ${kcal.toLocaleString('en-GB')} so it doesn't drop below what your body burns at rest.` : null,
    }
  })
}

/**
 * Protein from body weight (more when cutting, to keep muscle), fat at a
 * quarter of calories (at least 0.6 g/kg), carbs fill the rest.
 */
export function macrosFor(kcal: number, kg: number, plan: PlanId): Macros {
  const perKg = plan.endsWith('cut') ? 2.2 : 1.8
  const protein = Math.min(Math.round(kg * perKg), Math.round((kcal * 0.4) / 4))
  const fat = Math.max(Math.round((kcal * 0.25) / 9), Math.round(kg * 0.6))
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
  return { kcal, protein, carbs, fat }
}

export const kcalFromMacros = (m: Pick<Macros, 'protein' | 'carbs' | 'fat'>) => m.protein * 4 + m.carbs * 4 + m.fat * 9

/** Keep the same split between protein, carbs and fat for a new calorie total. */
export function scaleMacros(m: Macros, kcal: number): Macros {
  const from = kcalFromMacros(m)
  if (from <= 0) return { kcal, protein: Math.round((kcal * 0.3) / 4), carbs: Math.round((kcal * 0.45) / 4), fat: Math.round((kcal * 0.25) / 9) }
  const f = kcal / from
  return { kcal, protein: Math.round(m.protein * f), carbs: Math.round(m.carbs * f), fat: Math.round(m.fat * f) }
}

export const ageFrom = (birthYear: number) => new Date().getFullYear() - birthYear
