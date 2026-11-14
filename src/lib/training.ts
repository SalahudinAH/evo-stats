import type { Exercise, Muscle, Routine, RoutineExercise, Workout, WorkoutSet } from './types'
import { e1rm } from './stats'

const DAY = 24 * 3600 * 1000

/** One exercise's working sets from one workout (or one day, for sets logged before workouts existed). */
export interface Session {
  key: string
  date: Date
  workoutId: string | null
  sets: WorkoutSet[]
}

export function fmtKg(n: number): string {
  return String(Math.round(n * 100) / 100)
}

export const workingSets = (sets: WorkoutSet[]) => sets.filter(s => !s.is_warmup)

/** Working sets grouped per exercise into sessions, oldest first. */
export function sessionsByExercise(sets: WorkoutSet[]): Map<string, Session[]> {
  const byKey = new Map<string, Session & { exercise: string }>()
  for (const s of sets) {
    if (s.is_warmup) continue
    const key = `${s.exercise_id}|${s.workout_id ?? new Date(s.performed_at).toDateString()}`
    let cur = byKey.get(key)
    if (!cur) {
      cur = { key, exercise: s.exercise_id, date: new Date(s.performed_at), workoutId: s.workout_id, sets: [] }
      byKey.set(key, cur)
    }
    cur.sets.push(s)
  }
  const out = new Map<string, Session[]>()
  for (const s of byKey.values()) {
    s.sets.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.performed_at.localeCompare(b.performed_at))
    const list = out.get(s.exercise) ?? []
    list.push(s)
    out.set(s.exercise, list)
  }
  for (const list of out.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime())
  return out
}

type SetLike = { weight_kg: number; reps: number }

export const bestE1rm = (sets: SetLike[]) => sets.reduce((m, s) => Math.max(m, e1rm(s.weight_kg, s.reps)), 0)
export const topWeight = (sets: SetLike[]) => sets.reduce((m, s) => Math.max(m, s.weight_kg), 0)
export const totalReps = (sets: SetLike[]) => sets.reduce((m, s) => m + s.reps, 0)
export const volume = (sets: SetLike[]) => sets.reduce((m, s) => m + s.weight_kg * s.reps, 0)

/** "62.5 kg × 8 · 8 · 7" when every set used one weight, else "60×8 · 62.5×6". */
export function setsText(sets: SetLike[]): string {
  if (!sets.length) return '–'
  const same = sets.every(s => s.weight_kg === sets[0].weight_kg)
  if (same) return `${fmtKg(sets[0].weight_kg)} kg × ${sets.map(s => s.reps).join(' · ')}`
  return sets.map(s => `${fmtKg(s.weight_kg)}×${s.reps}`).join(' · ')
}

/** The next weight up: 1 kg steps for light weights, 2 kg for dumbbell range, 2.5 kg for bars. */
export function nextWeight(w: number): number {
  if (w < 10) return w + 1
  if (w < 30) return w + 2
  return Math.round((w + 2.5) / 2.5) * 2.5
}

function roundPlate(w: number): number {
  return w >= 30 ? Math.round(w / 2.5) * 2.5 : Math.round(w)
}

/** Did `b` beat `a`? More weight, a better e1RM, or more reps at the same weight all count. */
function progressed(a: SetLike[], b: SetLike[]): boolean {
  const wa = topWeight(a), wb = topWeight(b)
  return wb > wa || bestE1rm(b) > bestE1rm(a) + 0.01 || (wb === wa && totalReps(b) > totalReps(a))
}

/** Neither of the last two sessions beat the one before them. */
export function isStalled(sessions: Session[]): boolean {
  if (sessions.length < 3) return false
  const [a, b, c] = sessions.slice(-3).map(s => s.sets)
  return !progressed(a, b) && !progressed(a, c)
}

export type TipKind = 'up' | 'warn' | 'info'
export interface Tip { text: string; kind: TipKind; weight: number | null }

type Target = Pick<RoutineExercise, 'target_sets' | 'rep_min' | 'rep_max'>

/**
 * Double progression: stay at a weight until every set reaches the top of the
 * rep range, then go up. If three sessions bring no progress, back off ~10%.
 */
export function suggest(target: Target | null, sessions: Session[]): Tip | null {
  const last = sessions[sessions.length - 1]
  if (!last) {
    return target
      ? { kind: 'info', weight: null, text: `First time: pick a weight you can lift for ${target.rep_min}–${target.rep_max} reps.` }
      : null
  }
  const w = topWeight(last.sets)
  if (!target) return { kind: 'info', weight: w, text: `Last time: ${setsText(last.sets)}` }
  const counted = last.sets.slice(0, target.target_sets)
  const hitAll = counted.length >= target.target_sets && counted.every(s => s.reps >= target.rep_max)
  if (hitAll) {
    const up = nextWeight(w)
    return { kind: 'up', weight: up, text: `↑ ${target.rep_max} reps on every set last time. Go up to ${fmtKg(up)} kg.` }
  }
  if (isStalled(sessions)) {
    const back = roundPlate(w * 0.9)
    return { kind: 'warn', weight: back, text: `No progress in 3 sessions. Try ${fmtKg(back)} kg × ${target.rep_max}, then build back up.` }
  }
  return { kind: 'info', weight: w, text: `Stay at ${fmtKg(w)} kg until you hit ${target.rep_max} reps on every set.` }
}

export type BadgeKind = 'up' | 'down' | 'mixed' | 'same' | 'new'
export interface Badge { text: string; kind: BadgeKind }

/** How today's sets of one exercise compare with the previous session. */
export function compareSets(today: SetLike[], last: SetLike[] | null): Badge {
  if (!last || !last.length) return { text: 'New', kind: 'new' }
  const dKg = Math.round((topWeight(today) - topWeight(last)) * 100) / 100
  const dReps = totalReps(today) - totalReps(last)
  const reps = (n: number) => `${Math.abs(n)} rep${Math.abs(n) === 1 ? '' : 's'}`
  if (dKg > 0 && dReps >= 0) return { text: `▲ +${fmtKg(dKg)} kg`, kind: 'up' }
  if (dKg > 0) return { text: `+${fmtKg(dKg)} kg · −${reps(dReps)}`, kind: 'mixed' }
  if (dKg < 0) {
    return volume(today) > volume(last)
      ? { text: `−${fmtKg(-dKg)} kg · more volume`, kind: 'mixed' }
      : { text: `▼ −${fmtKg(-dKg)} kg`, kind: 'down' }
  }
  if (dReps > 0) return { text: `▲ +${reps(dReps)}`, kind: 'up' }
  if (dReps < 0) return { text: `▼ −${reps(dReps)}`, kind: 'down' }
  return { text: '= Same', kind: 'same' }
}

/** The most recent finished workout of the same routine (or same name) before `before`. */
export function previousWorkout(
  w: { routine_id: string | null; name: string; started_at: string; id?: string },
  workouts: Workout[],
): Workout | null {
  const t = new Date(w.started_at).getTime()
  const match = workouts.filter(x =>
    x.id !== w.id && new Date(x.started_at).getTime() < t &&
    (w.routine_id ? x.routine_id === w.routine_id : x.name.toLowerCase() === w.name.toLowerCase()))
  return match[match.length - 1] ?? null
}

/** The routine after the one you did most recently (wrapping), or the first. */
export function nextRoutine(routines: Routine[], workouts: Workout[]): Routine | null {
  if (!routines.length) return null
  const sorted = [...routines].sort((a, b) => a.position - b.position)
  for (let i = workouts.length - 1; i >= 0; i--) {
    const idx = sorted.findIndex(r => r.id === workouts[i].routine_id)
    if (idx >= 0) return sorted[(idx + 1) % sorted.length]
  }
  return sorted[0]
}

export interface NextUp {
  routine: Routine
  /** Rest days in the plan between your last workout and this one. */
  restDays: number
  /** Your plan says rest today (you trained yesterday and a rest day comes next). */
  restToday: boolean
  /** You already trained today. */
  doneToday: boolean
  /** The rotation (routine ids, null = rest) and where the next workout sits in it; empty without a plan. */
  week: (string | null)[]
  index: number
  /** The last thing this week was a skip of this routine (for "Undo"). */
  skipped: Routine | null
}

/** A planned workout you chose to skip ("Skip" on Up next). */
export interface Skip { routine_id: string; at: string }

/** Monday 00:00 of the current week, local time. */
export function startOfWeek(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

/**
 * Where you are in a weekly rotation like Push, Pull, Legs, rest, Push, Pull, rest.
 * The rotation starts over every Monday: only this week's workouts (and skips) count, so a
 * missed workout late in the week is dropped instead of pushing next week out of line.
 * Within the week the longest run of what you did that fits the rotation wins, so the second
 * Push of the week is told apart from the first.
 */
export function planNext(routines: Routine[], workouts: Workout[], schedule: (string | null)[] | null, skips: Skip[] = []): NextUp | null {
  const byId = new Map(routines.map(r => [r.id, r]))
  const seq = (schedule ?? []).filter(x => x === null || byId.has(x))
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const today = new Date()
  if (!seq.some(x => x)) {
    const r = nextRoutine(routines, workouts)
    if (!r) return null
    const last = workouts[workouts.length - 1]
    return { routine: r, restDays: 0, restToday: false, doneToday: !!last && sameDay(new Date(last.started_at), today), week: [], index: -1, skipped: null }
  }
  const weekStart = startOfWeek(today).getTime()
  const done = workouts.filter(w => w.routine_id && seq.includes(w.routine_id))
  const events = [
    ...done.map(w => ({ id: w.routine_id as string, at: new Date(w.started_at).getTime(), skip: false })),
    ...skips.filter(s => seq.includes(s.routine_id)).map(s => ({ id: s.routine_id, at: new Date(s.at).getTime(), skip: true })),
  ].filter(e => e.at >= weekStart).sort((x, y) => x.at - y.at)
  const hist = events.map(e => e.id)
  let pos = -1
  if (hist.length) {
    let bestScore = -1
    seq.forEach((id, p) => {
      if (id !== hist[hist.length - 1]) return
      let score = 0, q = p, h = hist.length - 1, steps = 0
      while (h >= 0 && steps < seq.length * 2) {
        if (seq[q] === null) { /* rest day: skip */ } else if (seq[q] === hist[h]) { score++; h-- } else break
        q = (q - 1 + seq.length) % seq.length
        steps++
      }
      if (score > bestScore) { bestScore = score; pos = p }
    })
  }
  let restDays = 0
  let q = (pos + 1) % seq.length
  for (let i = 0; i < seq.length && seq[q] === null; i++) { restDays++; q = (q + 1) % seq.length }
  const routine = byId.get(seq[q] as string)!
  // Rest-day hints only come from real workouts this week, never from a skip.
  const lastEvent = events[events.length - 1]
  const lastWorkout = [...events].reverse().find(e => !e.skip)
  const doneToday = !!lastWorkout && sameDay(new Date(lastWorkout.at), today)
  let restToday = false
  if (lastEvent && !lastEvent.skip && !doneToday && restDays > 0) {
    const daysAgo = Math.round((new Date(today.toDateString()).getTime() - new Date(new Date(lastEvent.at).toDateString()).getTime()) / 86_400_000)
    restToday = daysAgo >= 1 && daysAgo <= restDays
  }
  const skipped = lastEvent?.skip ? byId.get(lastEvent.id) ?? null : null
  return { routine, restDays, restToday, doneToday, week: seq, index: q, skipped }
}

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes',
  biceps: 'Biceps', triceps: 'Triceps', calves: 'Calves', core: 'Core', other: 'Other',
}

/** Working sets per week to aim for. Roughly 6-12 is a common range for most people. */
export const MUSCLE_TARGETS: Partial<Record<Muscle, number>> = {
  chest: 10, back: 12, shoulders: 8, quads: 10, hamstrings: 8, glutes: 6, biceps: 6, triceps: 6,
}

const GUESSES: [RegExp, Muscle][] = [
  [/romanian|rdl|leg curl|hamstring|good ?morning|nordic/i, 'hamstrings'],
  [/hip thrust|glute|kickback/i, 'glutes'],
  [/squat|leg press|lunge|leg ext|split|hack|step.?up/i, 'quads'],
  [/calf/i, 'calves'],
  [/bench|chest|fly|flye|pec|push.?up|dip/i, 'chest'],
  [/overhead|shoulder|ohp|military|lateral|rear delt|face pull|arnold|raise/i, 'shoulders'],
  [/pushdown|tricep|skull|extension|close.?grip/i, 'triceps'],
  [/curl|bicep|hammer/i, 'biceps'],
  [/deadlift|row|pull.?up|chin|pulldown|lat |pullover|shrug|back/i, 'back'],
  [/plank|crunch|ab |abs|core|sit.?up|leg raise|wheel/i, 'core'],
]

export function guessMuscle(name: string): Muscle | null {
  for (const [re, m] of GUESSES) if (re.test(name)) return m
  return null
}

export interface MuscleLoad { muscle: Muscle; perWeek: number; target: number }

/** Average working sets per week per muscle over the last `days`. */
export function weeklySetsByMuscle(sets: WorkoutSet[], exercises: Exercise[], days = 28): MuscleLoad[] {
  const muscleOf = new Map(exercises.map(e => [e.id, e.muscle]))
  const cutoff = Date.now() - days * DAY
  const counts = new Map<Muscle, number>()
  for (const s of sets) {
    if (s.is_warmup || new Date(s.performed_at).getTime() < cutoff) continue
    const m = muscleOf.get(s.exercise_id)
    if (m) counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  const muscles = new Set<Muscle>([...Object.keys(MUSCLE_TARGETS) as Muscle[], ...counts.keys()])
  muscles.delete('other')
  return [...muscles].map(m => ({
    muscle: m,
    perWeek: Math.round(((counts.get(m) ?? 0) / (days / 7)) * 10) / 10,
    target: MUSCLE_TARGETS[m] ?? 0,
  }))
}

export interface Insight { title: string; body: string; exerciseId?: string }

/** The few most useful things to work on, from muscle balance and stalled lifts. */
export function insights(sets: WorkoutSet[], exercises: Exercise[], max = 3): Insight[] {
  const recent = sets.filter(s => !s.is_warmup && new Date(s.performed_at).getTime() > Date.now() - 28 * DAY)
  if (!recent.length) return []
  const out: Insight[] = []

  const unset = exercises.filter(e => !e.muscle && recent.some(s => s.exercise_id === e.id))
  if (unset.length) {
    out.push({
      title: `Set the muscle for ${unset[0].name}${unset.length > 1 ? ` and ${unset.length - 1} more` : ''}`,
      body: 'Open the exercise and pick its main muscle so it counts in your weekly sets.',
      exerciseId: unset[0].id,
    })
  }

  const behind = weeklySetsByMuscle(sets, exercises)
    .filter(l => l.target > 0 && l.perWeek < l.target * 0.6)
    .sort((a, b) => a.perWeek / a.target - b.perWeek / b.target)
  for (const l of behind.slice(0, 2)) {
    out.push({
      title: `${MUSCLE_LABEL[l.muscle]}: ${l.perWeek} of ${l.target} sets a week`,
      body: l.perWeek === 0
        ? `Nothing for ${MUSCLE_LABEL[l.muscle].toLowerCase()} in 4 weeks. Add an exercise for it to one of your routines.`
        : `Add a few sets for ${MUSCLE_LABEL[l.muscle].toLowerCase()} to one of your routines.`,
    })
  }

  const sessions = sessionsByExercise(sets)
  for (const ex of exercises) {
    const list = (sessions.get(ex.id) ?? []).filter(s => s.date.getTime() > Date.now() - 60 * DAY)
    if (isStalled(list)) {
      const w = topWeight(list[list.length - 1].sets)
      out.push({
        title: `${ex.name} has stalled for 3 sessions`,
        body: `Stuck around ${fmtKg(w)} kg. Drop about 10% for higher reps for a week, then build back up.`,
        exerciseId: ex.id,
      })
    }
  }
  return out.slice(0, max)
}

/** Personal records set in `today` compared with everything before it. */
export function findPRs(
  todayByExercise: Map<string, SetLike[]>,
  history: Map<string, Session[]>,
  before: Date,
): { exercise_id: string; text: string }[] {
  const out: { exercise_id: string; text: string }[] = []
  for (const [exId, today] of todayByExercise) {
    const prev = (history.get(exId) ?? []).filter(s => s.date < before)
    if (!prev.length || !today.length) continue
    const prevSets = prev.flatMap(s => s.sets)
    const bE = bestE1rm(today), pE = bestE1rm(prevSets)
    const bW = topWeight(today), pW = topWeight(prevSets)
    if (bE > pE + 0.05) out.push({ exercise_id: exId, text: `Best e1RM ${bE.toFixed(1)} kg (was ${pE.toFixed(1)})` })
    else if (bW > pW) out.push({ exercise_id: exId, text: `Heaviest weight ${fmtKg(bW)} kg` })
  }
  return out
}
