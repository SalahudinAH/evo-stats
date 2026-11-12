import { useState } from 'react'
import type { Nav } from '../App'
import type { Workout } from '../lib/types'
import { useTraining, type TrainingData } from '../lib/hooks'
import { draftToNew, parseNum, validSet, type Draft } from '../lib/draft'
import {
  compareSets, findPRs, previousWorkout, setsText, suggest, totalReps, volume, type Session,
} from '../lib/training'
import { Badge, fmtDay, fmtDuration, IconCheck, IconTrophy } from '../components/ui'

type RSet = { weight_kg: number; reps: number; warmup: boolean }
export interface Report {
  id?: string
  routine_id: string | null
  name: string
  started_at: string
  finished_at: string
  exercises: { exercise_id: string; sets: RSet[] }[]
}

export function reportFromWorkout(w: Workout, data: TrainingData): Report {
  const sets = data.sets.filter(s => s.workout_id === w.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const exercises: Report['exercises'] = []
  for (const s of sets) {
    let cur = exercises[exercises.length - 1]
    if (!cur || cur.exercise_id !== s.exercise_id) {
      cur = exercises.find(e => e.exercise_id === s.exercise_id) ?? { exercise_id: s.exercise_id, sets: [] }
      if (!exercises.includes(cur)) exercises.push(cur)
    }
    cur.sets.push({ weight_kg: s.weight_kg, reps: s.reps, warmup: s.is_warmup })
  }
  return { id: w.id, routine_id: w.routine_id, name: w.name, started_at: w.started_at, finished_at: w.finished_at, exercises }
}

function reportFromDraft(d: Draft): Report {
  return {
    routine_id: d.routine_id, name: d.name, started_at: d.started_at, finished_at: d.finished_at ?? new Date().toISOString(),
    exercises: d.exercises
      .map(e => ({ exercise_id: e.exercise_id, sets: e.sets.filter(validSet).map(s => ({ weight_kg: parseNum(s.weight), reps: parseInt(s.reps, 10), warmup: s.warmup })) }))
      .filter(e => e.sets.length),
  }
}

const working = (sets: RSet[]) => sets.filter(s => !s.warmup)

/** Comparison with last time, PRs, and what to do next. Used after Finish and for past workouts. */
export function WorkoutReport({ data, report, onExercise }: {
  data: TrainingData; report: Report; onExercise?: (id: string) => void
}) {
  const start = new Date(report.started_at)
  const prev = previousWorkout(report, data.workouts)
  const prevReport = prev ? reportFromWorkout(prev, data) : null
  const all = report.exercises.flatMap(e => working(e.sets))
  const prevAll = prevReport ? prevReport.exercises.flatMap(e => working(e.sets)) : []
  const dur = new Date(report.finished_at).getTime() - start.getTime()
  const prevDur = prev ? new Date(prev.finished_at).getTime() - new Date(prev.started_at).getTime() : null

  /** Sessions of this exercise strictly before this workout. */
  const before = (exId: string): Session[] =>
    (data.sessions.get(exId) ?? []).filter(s => s.workoutId !== report.id && s.date < start)

  const rows = report.exercises.map(e => {
    const today = working(e.sets)
    const earlier = before(e.exercise_id)
    const last = earlier[earlier.length - 1] ?? null
    return { e, today, last, badge: compareSets(today, last?.sets ?? null) }
  })
  const beat = rows.filter(r => r.badge.kind === 'up').length
  const compared = rows.filter(r => r.last).length

  const todayMap = new Map(report.exercises.map(e => [e.exercise_id, working(e.sets)]))
  const prs = findPRs(todayMap, data.sessions, start)

  const next = report.routine_id
    ? data.items.filter(i => i.routine_id === report.routine_id).map(i => {
      const today = todayMap.get(i.exercise_id)
      const sessions = [...before(i.exercise_id)]
      if (today?.length) sessions.push({ key: 'now', date: new Date(report.finished_at), workoutId: null, sets: today.map((s, k) => ({ ...s, id: `n${k}`, exercise_id: i.exercise_id, performed_at: report.finished_at, workout_id: null, position: k, is_warmup: false })) })
      return { i, tip: suggest(i, sessions) }
    }).filter(x => x.tip && x.tip.weight !== null).slice(0, 6)
    : []

  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0)
  const vol = volume(all), pVol = volume(prevAll)
  const reps = totalReps(all), pReps = totalReps(prevAll)

  return (
    <>
      <section className="card" aria-labelledby="cmp-h">
        <div className="card-head" style={{ alignItems: 'baseline' }}>
          <h2 id="cmp-h">{prev ? `vs last ${report.name}` : 'This workout'}</h2>
          {prev && <span className="small muted">{fmtDay(prev.started_at)}</span>}
        </div>
        <div className="stats3" style={{ gap: 8 }}>
          <div className="tile">
            <span className="label">Volume</span>
            <span className="value">{Math.round(vol).toLocaleString('en-GB')}</span>
            {prev && <span className={`tiny ${vol >= pVol ? 'text-up' : 'text-down'}`} style={{ fontWeight: 700 }}>{vol >= pVol ? '▲' : '▼'} {Math.abs(pct(vol, pVol)).toFixed(1)}%</span>}
          </div>
          <div className="tile">
            <span className="label">Reps</span>
            <span className="value">{reps}</span>
            {prev && <span className={`tiny ${reps >= pReps ? 'text-up' : 'text-down'}`} style={{ fontWeight: 700 }}>{reps - pReps >= 0 ? `▲ ${reps - pReps}` : `▼ ${pReps - reps}`} reps</span>}
          </div>
          <div className="tile">
            <span className="label">Time</span>
            <span className="value">{fmtDuration(dur)}</span>
            {prevDur !== null && <span className="tiny muted" style={{ fontWeight: 650 }}>{dur >= prevDur ? '+' : '−'}{fmtDuration(Math.abs(dur - prevDur))}</span>}
          </div>
        </div>
        {compared > 0 && <p className="small" style={{ color: 'var(--text-2)' }}>You beat last time on {beat} of {compared} exercise{compared === 1 ? '' : 's'}.</p>}
      </section>

      {prs.length > 0 && (
        <section className="card card-accent" aria-labelledby="pr-h">
          <h2 id="pr-h">{prs.length} new personal record{prs.length === 1 ? '' : 's'}</h2>
          {prs.map(p => (
            <div key={p.exercise_id} className="pr-row">
              <span className="pr-ic"><IconTrophy /></span>
              <div><h3>{data.exById.get(p.exercise_id)?.name ?? 'Exercise'}</h3><span className="small" style={{ color: '#e0c2cf' }}>{p.text}</span></div>
            </div>
          ))}
        </section>
      )}

      <div className="section-head"><h2>Exercise by exercise</h2></div>
      {!rows.length && <p className="muted">No sets were ticked off in this workout.</p>}
      <ul className="cards">
        {rows.map(({ e, today, last, badge }) => (
          <li key={e.exercise_id}>
            <button className="card card-btn" onClick={() => onExercise?.(e.exercise_id)} disabled={!onExercise}>
              <div className="card-head" style={{ alignItems: 'center' }}>
                <h3>{data.exById.get(e.exercise_id)?.name ?? 'Deleted exercise'}</h3>
                <Badge b={badge} />
              </div>
              <div className="cmp">
                <span className="l">Last</span><span className="l">{last ? setsText(last.sets) : '–'}</span>
                <span className="t">{report.id ? 'This' : 'Today'}</span><span className="t">{setsText(today)}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {next.length > 0 && (
        <section className="card" aria-labelledby="next-h">
          <h2 id="next-h">Next {report.name}</h2>
          {next.map(({ i, tip }) => (
            <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13, lineHeight: 1.4 }}>
              <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 4, background: tip!.kind === 'up' ? 'var(--up)' : tip!.kind === 'warn' ? 'var(--warn)' : 'var(--muted)' }} />
              <span><b>{data.exById.get(i.exercise_id)?.name}:</b> <span style={{ color: 'var(--text-2)' }}>{tip!.text.replace(/^↑ /, '')}</span></span>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

const FEELS = ['Easy', 'Good', 'Hard', 'Brutal', 'Max']

export function WorkoutSummary({ nav, draft, setDraft, onSaved, onDiscard }: {
  nav: Nav
  draft: Draft
  setDraft: (d: (cur: Draft) => Draft) => void
  onSaved: () => void
  onDiscard: () => void
}) {
  const t = useTraining(nav.api)
  const [saving, setSaving] = useState(false)
  const report = reportFromDraft(draft)
  const dur = new Date(report.finished_at).getTime() - new Date(report.started_at).getTime()

  async function save() {
    setSaving(true)
    try {
      await nav.api.saveWorkout(draftToNew(draft))
      onSaved()
    } catch (e) {
      nav.notify(e instanceof Error ? `Not saved: ${e.message}` : 'Not saved. Check your connection and try again.')
      setSaving(false)
    }
  }

  async function share() {
    const lines = [`${draft.name} · ${fmtDay(draft.started_at)} · ${fmtDuration(dur)}`]
    for (const e of report.exercises) {
      const ex = t.data?.exById.get(e.exercise_id)
      lines.push(`${ex?.name ?? 'Exercise'}: ${setsText(working(e.sets))}`)
    }
    const text = lines.join('\n')
    try {
      if (navigator.share) await navigator.share({ text })
      else { await navigator.clipboard.writeText(text); nav.notify('Copied to clipboard') }
    } catch {
      // Share sheet dismissed.
    }
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={() => setDraft(d => ({ ...d, finished_at: null }))}>‹ Back to workout</button>
      </header>
      <div className="done-head">
        <span className="done-ic"><IconCheck size={28} /></span>
        <div>
          <h1 style={{ fontSize: 28 }}>Workout complete</h1>
          <p className="small muted">{draft.name} · {fmtDay(draft.started_at)} · {fmtDuration(dur)}</p>
        </div>
      </div>

      {t.error && <p className="error">{t.error}</p>}
      {t.data && <WorkoutReport data={t.data} report={report} />}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-labelledby="feel-h">
        <h2 id="feel-h">How did it feel?</h2>
        <div className="feel">
          {FEELS.map(f => (
            <button key={f} aria-pressed={draft.feel === f} onClick={() => setDraft(d => ({ ...d, feel: d.feel === f ? null : f }))}>{f}</button>
          ))}
        </div>
        <label>Notes
          <input value={draft.notes} onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, notes: v })) }}
            placeholder="e.g. left shoulder felt tight on overhead press" />
        </label>
      </section>

      <div className="bottom-bar" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10px)' }}>
        <button className="btn btn-big" onClick={share}>Share</button>
        <button className="btn btn-primary btn-big" onClick={save} disabled={saving || !report.exercises.length}>
          {saving ? 'Saving…' : 'Save workout'}
        </button>
      </div>
      <button className="btn btn-danger-quiet" onClick={() => { if (confirm('Discard this workout? Nothing will be saved.')) onDiscard() }}>Discard workout</button>
    </div>
  )
}

