import type { NewWorkout, Routine, RoutineExercise } from './types'
import { fmtKg, suggest, type Session, type Tip } from './training'

/**
 * The workout you're doing right now. It lives in localStorage, so closing
 * Safari or losing signal at the gym never loses a set. It's only sent to the
 * database when you press Save on the summary.
 */
export interface DraftSet {
  key: string
  weight: string
  reps: string
  done: boolean
  warmup: boolean
  prev: { w: number; r: number } | null
}

export interface DraftExercise {
  key: string
  exercise_id: string
  target: Pick<RoutineExercise, 'target_sets' | 'rep_min' | 'rep_max'> | null
  tip: Tip | null
  sets: DraftSet[]
}

export interface Draft {
  routine_id: string | null
  name: string
  started_at: string
  /** Set when you press Finish; the summary screen is showing. */
  finished_at: string | null
  exercises: DraftExercise[]
  restUntil: number | null
  restTotal: number
  feel: string | null
  notes: string
}

/** One saved workout per account, so a second account on the same phone never sees it. */
const key = (owner: string) => `evo-stats.draft.${owner}`

// Before drafts were per account they were all saved under this one name.
// Its owner is unknown, so it's dropped rather than shown to whoever signs in.
try { localStorage.removeItem('evo-stats.draft.supabase') } catch { /* storage blocked */ }

/** `owner` is the signed-in user's id, or "demo". */
export function loadDraft(owner: string): Draft | null {
  try {
    const raw = localStorage.getItem(key(owner))
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

export function storeDraft(owner: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(key(owner), JSON.stringify(d))
    else localStorage.removeItem(key(owner))
  } catch {
    // Private browsing can block storage; the workout still works until the page closes.
  }
}

let seq = 0
export const newKey = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`

export function draftSet(prev: DraftSet['prev'], weight = ''): DraftSet {
  return { key: newKey(), weight, reps: '', done: false, warmup: false, prev }
}

export function draftExercise(
  exercise_id: string,
  target: DraftExercise['target'],
  sessions: Session[],
): DraftExercise {
  const last = sessions[sessions.length - 1]
  const tip = suggest(target, sessions)
  const count = target?.target_sets ?? Math.max(last?.sets.length ?? 0, 3)
  // Start from exactly what you did last time; the tip's "Use" button applies a suggested weight.
  const lastWorking = last?.sets.filter(s => !s.is_warmup) ?? []
  const fallbackW = tip?.weight != null ? fmtKg(tip.weight) : ''
  const sets: DraftSet[] = []
  for (let i = 0; i < count; i++) {
    const p = lastWorking[i] ?? lastWorking[lastWorking.length - 1]
    const s = draftSet(p ? { w: p.weight_kg, r: p.reps } : null, p ? fmtKg(p.weight_kg) : fallbackW)
    sets.push({ ...s, reps: p ? String(p.reps) : target ? String(target.rep_max) : '' })
  }
  return { key: newKey(), exercise_id, target, tip, sets }
}

export function buildDraft(
  routine: Routine | null,
  items: RoutineExercise[],
  sessions: Map<string, Session[]>,
): Draft {
  return {
    routine_id: routine?.id ?? null,
    name: routine?.name ?? 'Workout',
    started_at: new Date().toISOString(),
    finished_at: null,
    exercises: items
      .filter(i => i.routine_id === routine?.id)
      .sort((a, b) => a.position - b.position)
      .map(i => draftExercise(i.exercise_id, i, sessions.get(i.exercise_id) ?? [])),
    restUntil: null,
    restTotal: 120,
    feel: null,
    notes: '',
  }
}

export const parseNum = (s: string) => parseFloat(s.replace(',', '.'))

export function validSet(s: DraftSet): boolean {
  const w = parseNum(s.weight)
  const r = parseInt(s.reps, 10)
  return s.done && Number.isFinite(w) && w >= 0 && Number.isInteger(r) && r >= 1 && r <= 100
}

/** Done working sets per exercise, as numbers. */
export function doneSets(d: Draft, includeWarmups = false): Map<string, { weight_kg: number; reps: number }[]> {
  const out = new Map<string, { weight_kg: number; reps: number }[]>()
  for (const ex of d.exercises) {
    const list = ex.sets
      .filter(s => validSet(s) && (includeWarmups || !s.warmup))
      .map(s => ({ weight_kg: parseNum(s.weight), reps: parseInt(s.reps, 10) }))
    if (list.length) out.set(ex.exercise_id, [...(out.get(ex.exercise_id) ?? []), ...list])
  }
  return out
}

export function draftToNew(d: Draft): NewWorkout {
  const sets: NewWorkout['sets'] = []
  let position = 0
  for (const ex of d.exercises) {
    for (const s of ex.sets) {
      if (!validSet(s)) continue
      sets.push({ exercise_id: ex.exercise_id, weight_kg: parseNum(s.weight), reps: parseInt(s.reps, 10), position: position++, is_warmup: s.warmup })
    }
  }
  return {
    routine_id: d.routine_id,
    name: d.name,
    started_at: d.started_at,
    finished_at: d.finished_at ?? new Date().toISOString(),
    feel: d.feel,
    notes: d.notes.trim() || null,
    sets,
  }
}
