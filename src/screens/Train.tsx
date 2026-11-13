import { useMemo, useState } from 'react'
import { scrollToTop } from '../lib/scroll'
import type { Nav } from '../App'
import type { Api, Exercise, Muscle, Routine, RoutineItem, Workout } from '../lib/types'
import { useLoad, useNow, useTraining, type TrainingData } from '../lib/hooks'
import { buildDraft } from '../lib/draft'
import { e1rm, startOfWeek } from '../lib/stats'
import {
  bestE1rm, fmtKg, insights, MUSCLE_LABEL, nextRoutine, setsText, suggest, volume, workingSets,
} from '../lib/training'
import { LineChart } from '../components/Charts'
import { Calendar, Check, Clock, Dumbbell, History, ListChecks, Play, Plus, Target, TrendingUp, TriangleAlert } from 'lucide-react'
import {
  ExercisePicker, ExerciseThumb, fmtClock, fmtDay, fmtDuration, IconDots, IconDown, IconPlay, IconUp, LargeTitle, MuscleSelect, Row, Section, Sheet,
} from '../components/ui'
import { WorkoutReport, reportFromWorkout } from './WorkoutSummary'

type View =
  | { kind: 'home' }
  | { kind: 'routine'; id: string }
  | { kind: 'exercise'; id: string; from?: View }
  | { kind: 'workout'; id: string; from?: View }
  | { kind: 'history' }
  | { kind: 'exercises' }

export function Train({ nav }: { nav: Nav }) {
  const t = useTraining(nav.api)
  const goals = useLoad(() => nav.api.getGoals(), [nav.api])
  const [view, setView] = useState<View>({ kind: 'home' })
  const open = (v: View) => { setView(v); scrollToTop() }

  if (t.error) return <div className="screen"><header className="screen-head"><h1>Train</h1></header><p className="error">{t.error}</p></div>
  if (!t.data) return <div className="screen"><header className="screen-head"><h1>Train</h1></header><p className="muted">Loading…</p></div>
  const data = t.data

  switch (view.kind) {
    case 'routine': {
      const r = data.routines.find(x => x.id === view.id)
      if (!r) return <TrainHome nav={nav} data={data} goal={goals.data?.workouts_per_week ?? 4} open={open} reload={t.reload} />
      return <RoutineDetail nav={nav} data={data} routine={r} back={() => open({ kind: 'home' })} open={open} reload={t.reload} />
    }
    case 'exercise': {
      const ex = data.exById.get(view.id)
      const back = () => open(view.from ?? { kind: 'home' })
      if (!ex) return <TrainHome nav={nav} data={data} goal={goals.data?.workouts_per_week ?? 4} open={open} reload={t.reload} />
      return <ExerciseDetail api={nav.api} data={data} exercise={ex} back={back} reload={t.reload} notify={nav.notify} />
    }
    case 'workout': {
      const w = data.workouts.find(x => x.id === view.id)
      const back = () => open(view.from ?? { kind: 'home' })
      if (!w) return <TrainHome nav={nav} data={data} goal={goals.data?.workouts_per_week ?? 4} open={open} reload={t.reload} />
      return (
        <div className="screen">
          <header className="screen-head"><button className="back" onClick={back}>‹ Back</button></header>
          <WorkoutReport data={data} report={reportFromWorkout(w, data)}
            onExercise={id => open({ kind: 'exercise', id, from: view })} />
          <button className="btn btn-danger-quiet" onClick={async () => {
            if (!confirm(`Delete ${w.name} on ${fmtDay(w.started_at)} and all its sets?`)) return
            await nav.api.deleteWorkout(w.id)
            t.reload()
            back()
          }}>Delete workout</button>
        </div>
      )
    }
    case 'history':
      return (
        <div className="screen">
          <header className="screen-head"><button className="back" onClick={() => open({ kind: 'home' })}>‹ Train</button></header>
          <h1 className="detail-title">History</h1>
          {!data.workouts.length && <p className="muted">No workouts yet.</p>}
          {data.workouts.length > 0 && (
            <Section>
              {[...data.workouts].reverse().map(w => (
                <WorkoutCard key={w.id} w={w} data={data} onClick={() => open({ kind: 'workout', id: w.id, from: view })} />
              ))}
            </Section>
          )}
        </div>
      )
    case 'exercises':
      return <ExerciseLibrary nav={nav} data={data} back={() => open({ kind: 'home' })} open={open} reload={t.reload} />
    default:
      return <TrainHome nav={nav} data={data} goal={goals.data?.workouts_per_week ?? 4} open={open} reload={t.reload} />
  }
}

// ---------------------------------------------------------------------------

function isoWeek(d: Date): number {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() + 4 - day)
  const y = new Date(Date.UTC(x.getUTCFullYear(), 0, 1))
  return Math.ceil(((x.getTime() - y.getTime()) / 86400000 + 1) / 7)
}

function routineStats(r: Routine, data: TrainingData) {
  const items = data.items.filter(i => i.routine_id === r.id)
  const sets = items.reduce((s, i) => s + i.target_sets, 0)
  const last = [...data.workouts].reverse().find(w => w.routine_id === r.id) ?? null
  const muscles = [...new Set(items.map(i => data.exById.get(i.exercise_id)?.muscle).filter(Boolean) as Muscle[])]
  return { items, sets, last, minutes: Math.max(10, Math.round((sets * 2.5) / 5) * 5), muscles }
}

function TrainHome({ nav, data, goal, open, reload }: {
  nav: Nav; data: TrainingData; goal: number; open: (v: View) => void; reload: () => void
}) {
  const [naming, setNaming] = useState(false)
  const [busy, setBusy] = useState(false)
  const now = useNow(30000)
  const weekStart = startOfWeek(new Date(now))
  const thisWeek = data.workouts.filter(w => new Date(w.started_at) >= weekStart)
  const next = nextRoutine(data.routines, data.workouts)
  const tips = useMemo(() => insights(data.sets, data.exercises), [data])

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const done = thisWeek.filter(w => new Date(w.started_at).toDateString() === d.toDateString())
    const isToday = d.toDateString() === new Date(now).toDateString()
    return { d, done, isToday }
  })

  function begin(r: Routine | null) {
    nav.startWorkout(buildDraft(r, data.items, data.sessions))
  }

  async function template() {
    setBusy(true)
    try {
      await createTemplate(nav.api, data.exercises)
      reload()
      nav.notify('Push / Pull / Legs plan added')
    } catch (e) {
      nav.notify(e instanceof Error ? e.message : 'Could not create plan')
    } finally {
      setBusy(false)
    }
  }

  const routineMeta = (r: Routine) => {
    const st = routineStats(r, data)
    return `${st.items.length} exercise${st.items.length === 1 ? '' : 's'}${st.last ? ` · last ${fmtDay(st.last.started_at)}` : ''}`
  }

  return (
    <div className="screen">
      <LargeTitle title="Train" sub={`Week ${isoWeek(new Date(now))} · ${thisWeek.length} of ${goal} workouts`}
        actions={<>
          <button className="nav-btn" aria-label="Workout history" onClick={() => open({ kind: 'history' })}><History size={22} strokeWidth={2} /></button>
          <button className="nav-btn" aria-label="New routine" onClick={() => setNaming(true)}><Plus size={24} strokeWidth={2} /></button>
        </>} />

      <section className="week-v2" aria-label="This week" style={{ marginTop: 6 }}>
        {days.map(({ d, done, isToday }) => (
          <div key={d.toISOString()} className="d">
            <span className={`l ${isToday ? 'today' : ''}`}>{d.toLocaleDateString('en-GB', { weekday: 'narrow' })}</span>
            <span className={`c ${done.length ? 'done' : isToday ? 'today' : 'rest'}`}
              aria-label={`${d.toLocaleDateString('en-GB', { weekday: 'long' })}: ${done.length ? done.map(w => w.name).join(', ') : 'no workout'}`}>
              {done.length > 0 && <Check size={16} strokeWidth={3} />}
            </span>
          </div>
        ))}
      </section>

      {nav.draft && (
        <Section>
          <Row icon={<Dumbbell size={17} strokeWidth={2} />} onClick={nav.openWorkout}
            title={nav.draft.finished_at ? `${nav.draft.name} isn't saved yet` : `In progress · ${nav.draft.name}`}
            sub={nav.draft.finished_at ? 'Open the summary to save it' : `${fmtClock(now - new Date(nav.draft.started_at).getTime())} elapsed`}
            trail={<span className="pill-btn">{nav.draft.finished_at ? 'Open' : 'Resume'}</span>} />
        </Section>
      )}

      {next ? (() => {
        const st = routineStats(next, data)
        const preview = st.items.slice(0, 3).map(i => {
          const sessions = data.sessions.get(i.exercise_id) ?? []
          return { i, ex: data.exById.get(i.exercise_id), tip: suggest(i, sessions) }
        })
        return (
          <>
            <div className="section-title"><h2>Up next</h2><button onClick={() => open({ kind: 'routine', id: next.id })}>View</button></div>
            <section className="hero-v2" aria-label={`Up next: ${next.name}`}>
              <div className="top">
                <span className="name">{next.name}</span>
                {st.muscles.length > 0 && <span className="muted" style={{ fontSize: 15 }}>{st.muscles.map(m => MUSCLE_LABEL[m]).join(' · ')}</span>}
                <div className="meta">
                  <span><ListChecks size={15} strokeWidth={2} />{st.items.length} exercises</span>
                  <span><Clock size={15} strokeWidth={2} />~{st.minutes} min</span>
                  {st.last && <span><Calendar size={15} strokeWidth={2} />Last {fmtDay(st.last.started_at)}</span>}
                </div>
              </div>
              {preview.length > 0 && (
                <div className="plan">
                  {preview.map(({ i, ex, tip }) => (
                    <div key={i.id} className="plan-row">
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex?.name ?? 'Exercise'}</span>
                      <span className="t">{i.target_sets} × {i.rep_min}{i.rep_max !== i.rep_min ? `–${i.rep_max}` : ''}</span>
                      <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3, color: tip?.kind === 'up' ? 'var(--up)' : tip?.kind === 'warn' ? 'var(--warn)' : 'var(--text-2)' }}>
                        {tip?.kind === 'up' && <TrendingUp size={14} strokeWidth={2.4} />}
                        {tip?.weight != null ? `${fmtKg(tip.weight)} kg` : '–'}
                      </span>
                    </div>
                  ))}
                  {st.items.length > 3 && <div className="more">+ {st.items.length - 3} more</div>}
                </div>
              )}
              <div className="cta">
                <button className="btn btn-primary btn-big" onClick={() => begin(next)} disabled={!st.items.length}>
                  <Play size={18} fill="currentColor" strokeWidth={0} /> {st.items.length ? 'Start workout' : 'Add exercises first'}
                </button>
              </div>
            </section>
          </>
        )
      })() : (
        <section className="card" style={{ marginTop: 8 }}>
          <h2>Build your plan</h2>
          <p className="muted small">A plan is a few routines you rotate through, like Push / Pull / Legs. Each routine lists exercises with a target such as 4 × 6–8. When you start one, last time's numbers are filled in so you can beat them.</p>
          <button className="btn btn-primary" onClick={template} disabled={busy}>{busy ? 'Adding…' : 'Start with Push / Pull / Legs'}</button>
          <button className="btn" onClick={() => setNaming(true)}>Make my own routine</button>
        </section>
      )}

      <Section title="Routines" action={<button onClick={() => open({ kind: 'exercises' })}>Exercises</button>}>
        {data.routines.map(r => (
          <Row key={r.id} onClick={() => open({ kind: 'routine', id: r.id })} chevron title={r.name} sub={routineMeta(r)}
            trail={next?.id === r.id ? <span className="text-accent" style={{ fontSize: 12, fontWeight: 600 }}>Up next</span> : undefined} />
        ))}
        <button type="button" className="group-row accent" onClick={() => begin(null)}><Plus size={20} strokeWidth={2} />Empty workout</button>
      </Section>

      {tips.length > 0 && (
        <Section title="Work on" action={<button onClick={() => nav.go('progress')}>All</button>} className="icons">
          {tips.map(tip => (
            <Row key={tip.title} iconTone="warn" icon={tip.exerciseId ? <TriangleAlert size={17} strokeWidth={2} /> : <Target size={17} strokeWidth={2} />}
              title={tip.title} sub={tip.body} chevron={!!tip.exerciseId}
              onClick={tip.exerciseId ? () => open({ kind: 'exercise', id: tip.exerciseId! }) : undefined} />
          ))}
        </Section>
      )}

      {data.workouts.length > 0 && (
        <Section title="Recent" action={<button onClick={() => open({ kind: 'history' })}>See all</button>}>
          {[...data.workouts].reverse().slice(0, 3).map(w => (
            <WorkoutCard key={w.id} w={w} data={data} onClick={() => open({ kind: 'workout', id: w.id })} />
          ))}
        </Section>
      )}

      {naming && (
        <NameSheet title="New routine" placeholder="e.g. Push day" onClose={() => setNaming(false)} onSave={async name => {
          const r = await nav.api.addRoutine(name)
          setNaming(false)
          reload()
          open({ kind: 'routine', id: r.id })
        }} />
      )}
    </div>
  )
}

function WorkoutCard({ w, data, onClick }: { w: Workout; data: TrainingData; onClick: () => void }) {
  const sets = workingSets(data.sets.filter(s => s.workout_id === w.id))
  const vol = volume(sets)
  const prevW = [...data.workouts].reverse().find(x =>
    x.id !== w.id && x.started_at < w.started_at && (w.routine_id ? x.routine_id === w.routine_id : x.name === w.name))
  const prevVol = prevW ? volume(workingSets(data.sets.filter(s => s.workout_id === prevW.id))) : 0
  const delta = prevVol ? ((vol - prevVol) / prevVol) * 100 : null
  return (
    <Row onClick={onClick} chevron title={w.name}
      sub={`${fmtDay(w.started_at)} · ${fmtDuration(new Date(w.finished_at).getTime() - new Date(w.started_at).getTime())}`}
      trail={<>
        <span>{Math.round(vol).toLocaleString('en-GB')} kg</span>
        {delta !== null && <span className={delta >= 0 ? 'text-up' : 'text-down'} style={{ fontSize: 13, fontWeight: 600 }}>{delta >= 0 ? '+' : '−'}{Math.abs(delta).toFixed(0)}%</span>}
      </>} />
  )
}

export function NameSheet({ title, placeholder, initial = '', onSave, onClose }: {
  title: string; placeholder: string; initial?: string; onSave: (name: string) => Promise<void> | void; onClose: () => void
}) {
  const [name, setName] = useState(initial)
  return (
    <Sheet title={title} onClose={onClose}>
      <form className="inline-form" onSubmit={async e => { e.preventDefault(); if (name.trim()) await onSave(name.trim()) }}>
        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={placeholder} aria-label="Name" />
        <button className="btn btn-primary" disabled={!name.trim()}>Save</button>
      </form>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

function RoutineDetail({ nav, data, routine, back, open, reload }: {
  nav: Nav; data: TrainingData; routine: Routine; back: () => void; open: (v: View) => void; reload: () => void
}) {
  const s = routineStats(routine, data)
  const [editing, setEditing] = useState(s.items.length === 0)
  const [items, setItems] = useState<RoutineItem[]>(() => s.items.map(i => ({ exercise_id: i.exercise_id, target_sets: i.target_sets, rep_min: i.rep_min, rep_max: i.rep_max })))
  const [picking, setPicking] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const lastSets = s.last ? workingSets(data.sets.filter(x => x.workout_id === s.last!.id)) : []

  async function save(next = items) {
    const clean = next.map(i => {
      const lo = Math.max(1, Math.min(100, i.rep_min || 1))
      return { ...i, target_sets: Math.max(1, Math.min(20, i.target_sets || 1)), rep_min: lo, rep_max: Math.max(lo, Math.min(100, i.rep_max || lo)) }
    })
    setSaving(true)
    try {
      await nav.api.setRoutineExercises(routine.id, clean)
      setItems(clean)
      reload()
    } catch (e) {
      nav.notify(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const patch = (i: number, p: Partial<RoutineItem>) => setItems(xs => xs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, d: number) => setItems(xs => {
    const j = i + d
    if (j < 0 || j >= xs.length) return xs
    const c = [...xs];[c[i], c[j]] = [c[j], c[i]]
    return c
  })

  return (
    <div className="screen" style={{ paddingBottom: editing ? 0 : 70 }}>
      <header className="screen-head">
        <button className="back" onClick={back}>‹ Train</button>
        {editing
          ? <button className="btn-text" disabled={saving} onClick={async () => { await save(); setEditing(false) }}>{saving ? 'Saving…' : 'Done'}</button>
          : <button className="btn-text" onClick={() => setEditing(true)}>Edit</button>}
      </header>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: -6 }}>
        <h1>{routine.name}</h1>
        {s.muscles.length > 0 && <div className="chip-row">{s.muscles.map(m => <span key={m} className="chip">{MUSCLE_LABEL[m]}</span>)}</div>}
      </div>

      {s.last && !editing && (
        <section className="stats3" aria-label="Last time">
          <div className="stat"><div className="stat-value" style={{ fontSize: 18 }}>{fmtDay(s.last.started_at).replace(/^\w+ /, '')}</div><div className="stat-label">Last done</div></div>
          <div className="stat"><div className="stat-value" style={{ fontSize: 18, color: 'var(--text)' }}>{fmtDuration(new Date(s.last.finished_at).getTime() - new Date(s.last.started_at).getTime())}</div><div className="stat-label">Duration</div></div>
          <div className="stat"><div className="stat-value" style={{ fontSize: 18, color: 'var(--text)' }}>{Math.round(volume(lastSets)).toLocaleString('en-GB')}</div><div className="stat-label">kg volume</div></div>
        </section>
      )}

      <div className="section-head"><h2>Exercises</h2><span className="small muted">{items.length} · {items.reduce((a, i) => a + i.target_sets, 0)} sets</span></div>
      {!items.length && <p className="muted small">Add the exercises for this routine, with how many sets and what rep range you're aiming for.</p>}
      <ul className="cards">
        {items.map((it, i) => {
          const ex = data.exById.get(it.exercise_id)
          const sessions = data.sessions.get(it.exercise_id) ?? []
          const last = sessions[sessions.length - 1]
          const tip = suggest(it, sessions)
          return (
            <li key={`${it.exercise_id}-${i}`} className="card" style={{ padding: 0 }}>
              <div className="ex-row">
                {ex?.image ? <ExerciseThumb image={ex.image} size={40} /> : <div className="ex-num">{i + 1}</div>}
                <button className="grow card-btn" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => !editing && open({ kind: 'exercise', id: it.exercise_id, from: { kind: 'routine', id: routine.id } })}>
                  <span className="top"><h3>{ex?.name ?? 'Deleted exercise'}</h3>{!editing && <span className="small" style={{ fontWeight: 650 }}>{it.target_sets} × {it.rep_min}{it.rep_max !== it.rep_min ? `–${it.rep_max}` : ''}</span>}</span>
                  {!editing && <span className="tiny muted">Last: {last ? setsText(last.sets) : 'not done yet'}</span>}
                  {!editing && tip && <span className={`tiny ${tip.kind === 'up' ? 'text-up' : tip.kind === 'warn' ? 'text-warn' : 'muted'}`} style={{ fontWeight: 600 }}>{tip.text}</span>}
                </button>
                {editing && (
                  <div className="row-end">
                    <button className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}><IconUp /></button>
                    <button className="icon-btn" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === items.length - 1}><IconDown /></button>
                    <button className="icon-btn" aria-label={`Remove ${ex?.name ?? 'exercise'}`} onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}>×</button>
                  </div>
                )}
              </div>
              {editing && (
                <div className="target-edit" style={{ padding: '0 14px 14px' }}>
                  <label>Sets<input inputMode="numeric" value={it.target_sets || ''} onChange={e => patch(i, { target_sets: parseInt(e.target.value, 10) || 0 })} /></label>
                  <label>Min reps<input inputMode="numeric" value={it.rep_min || ''} onChange={e => patch(i, { rep_min: parseInt(e.target.value, 10) || 0 })} /></label>
                  <label>Max reps<input inputMode="numeric" value={it.rep_max || ''} onChange={e => patch(i, { rep_max: parseInt(e.target.value, 10) || 0 })} /></label>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <button className="btn btn-dashed btn-big" onClick={() => setPicking(true)}>+ Add exercise</button>

      {editing && (
        <>
          <button className="btn" onClick={() => setRenaming(true)}>Rename routine</button>
          <button className="btn btn-danger-quiet" onClick={async () => {
            if (!confirm(`Delete the routine ${routine.name}? Your workout history is kept.`)) return
            await nav.api.deleteRoutine(routine.id)
            reload()
            back()
          }}>Delete routine</button>
        </>
      )}

      {!editing && items.length > 0 && (
        <div className="bottom-bar" style={{ gridTemplateColumns: '1fr' }}>
          <button className="btn btn-primary btn-big" onClick={() => nav.startWorkout(buildDraft(routine, data.items, data.sessions))}>
            <IconPlay /> Begin workout
          </button>
        </div>
      )}

      {picking && (
        <ExercisePicker api={nav.api} exercises={data.exercises} exclude={items.map(i => i.exercise_id)}
          onClose={() => setPicking(false)} onCreated={reload}
          onPickMany={async list => {
            setPicking(false)
            const next = [...items, ...list.map(e => ({ exercise_id: e.id, target_sets: 3, rep_min: 8, rep_max: 12 }))]
            setItems(next)
            if (!editing) await save(next)
          }} />
      )}
      {renaming && (
        <NameSheet title="Rename routine" placeholder="Routine name" initial={routine.name} onClose={() => setRenaming(false)}
          onSave={async name => { await nav.api.renameRoutine(routine.id, name); setRenaming(false); reload() }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function ExerciseDetail({ api, data, exercise, back, reload, notify }: {
  api: Api; data: TrainingData; exercise: Exercise; back: () => void; reload: () => void; notify: (m: string) => void
}) {
  const [tab, setTab] = useState<'Progress' | 'History' | 'Records'>('Progress')
  const [menu, setMenu] = useState(false)
  const sessions = data.sessions.get(exercise.id) ?? []
  const series = sessions.map(s => ({ x: s.date, y: bestE1rm(s.sets) }))
  const all = sessions.flatMap(s => s.sets)
  const best = bestE1rm(all)
  const eightWeeksAgo = Date.now() - 56 * 86400000
  const baseline = series.find(p => p.x.getTime() >= eightWeeksAgo)
  const latest = series[series.length - 1]
  const delta = baseline && latest && baseline !== latest ? latest.y - baseline.y : null
  const item = data.items.find(i => i.exercise_id === exercise.id) ?? null
  const tip = suggest(item, sessions)
  const heaviest = all.reduce<typeof all[number] | null>((m, s) => (!m || s.weight_kg > m.weight_kg || (s.weight_kg === m.weight_kg && s.reps > m.reps) ? s : m), null)
  const mostReps = all.reduce<typeof all[number] | null>((m, s) => (!m || s.reps > m.reps ? s : m), null)
  const bestVol = sessions.reduce<{ v: number; d: Date } | null>((m, s) => { const v = volume(s.sets); return !m || v > m.v ? { v, d: s.date } : m }, null)
  const bestE = all.reduce<typeof all[number] | null>((m, s) => (!m || e1rm(s.weight_kg, s.reps) > e1rm(m.weight_kg, m.reps) ? s : m), null)

  const repMaxes = useMemo(() => {
    const m = new Map<number, typeof all[number]>()
    for (const s of all) { const c = m.get(s.reps); if (!c || s.weight_kg > c.weight_kg) m.set(s.reps, s) }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).slice(0, 12)
  }, [all])

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={back}>‹ Back</button>
        <button className="icon-btn" aria-label="Exercise options" onClick={() => setMenu(true)}><IconDots /></button>
      </header>
      {exercise.image && (
        <ExerciseThumb image={exercise.image} className="ex-photo" size={0} />
      )}
      <div style={{ marginTop: -6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h1>{exercise.name}</h1>
        <p className="small muted">{exercise.muscle ? MUSCLE_LABEL[exercise.muscle] : 'Muscle not set'} · {sessions.length} session{sessions.length === 1 ? '' : 's'}</p>
      </div>

      <div className="seg" role="tablist" aria-label="Exercise views">
        {(['Progress', 'History', 'Records'] as const).map(x => (
          <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>{x}</button>
        ))}
      </div>

      {tab === 'Progress' && (
        <>
          <section className="card">
            <div className="card-head">
              <div>
                <span className="small muted">Estimated 1-rep max</span>
                <span className="num" style={{ fontSize: 34 }}>{best ? best.toFixed(1) : '–'} <span className="small muted">kg</span></span>
                {delta !== null && <span className={`small ${delta >= 0 ? 'text-up' : 'text-down'}`} style={{ fontWeight: 700 }}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} kg in 8 weeks</span>}
              </div>
            </div>
            {series.length >= 2
              ? <LineChart points={series} unit="kg" />
              : <p className="muted small">Do this exercise in two workouts to see your trend.</p>}
          </section>
          {tip && (
            <section className={`card ${tip.kind === 'up' ? 'card-up' : tip.kind === 'warn' ? 'card-warn' : ''}`}>
              <h2 className={tip.kind === 'up' ? 'text-up' : tip.kind === 'warn' ? 'text-warn' : ''}>Next time</h2>
              <p className="small" style={{ color: 'var(--text-2)' }}>{tip.text}</p>
            </section>
          )}
          {all.length > 0 && (
            <section className="grid2" aria-label="Records">
              <div className="tile"><span className="label">Best e1RM</span><span className="value">{bestE ? `${e1rm(bestE.weight_kg, bestE.reps).toFixed(1)} kg` : '–'}</span><span className="tiny muted">{bestE ? `${fmtKg(bestE.weight_kg)} × ${bestE.reps}` : ''}</span></div>
              <div className="tile"><span className="label">Heaviest set</span><span className="value">{heaviest ? `${fmtKg(heaviest.weight_kg)} × ${heaviest.reps}` : '–'}</span><span className="tiny muted">{heaviest ? fmtDay(heaviest.performed_at) : ''}</span></div>
              <div className="tile"><span className="label">Best session volume</span><span className="value">{bestVol ? `${Math.round(bestVol.v).toLocaleString('en-GB')} kg` : '–'}</span><span className="tiny muted">{bestVol ? fmtDay(bestVol.d) : ''}</span></div>
              <div className="tile"><span className="label">Most reps in a set</span><span className="value">{mostReps ? `${fmtKg(mostReps.weight_kg)} × ${mostReps.reps}` : '–'}</span><span className="tiny muted">{mostReps ? fmtDay(mostReps.performed_at) : ''}</span></div>
            </section>
          )}
        </>
      )}

      {tab === 'History' && (
        <ul className="cards">
          {!sessions.length && <p className="muted">No sets yet.</p>}
          {[...sessions].reverse().map((s, _i, arr) => {
            const w = s.workoutId ? data.workouts.find(x => x.id === s.workoutId) : null
            const isPR = bestE1rm(s.sets) >= best - 0.01 && arr.length > 1
            return (
              <li key={s.key} className="card">
                <div className="card-head" style={{ alignItems: 'baseline' }}>
                  <h3>{fmtDay(s.date)}{w ? ` · ${w.name}` : ''}</h3>
                  <span className={`tiny ${isPR ? 'text-accent' : 'muted'}`} style={{ fontWeight: 700 }}>e1RM {bestE1rm(s.sets).toFixed(1)}{isPR ? ' · PR' : ''}</span>
                </div>
                <div className="set-chips">
                  {s.sets.map(x => (
                    <span key={x.id}>
                      {fmtKg(x.weight_kg)} × {x.reps}
                      {!s.workoutId && (
                        <button className="icon-btn" style={{ width: 22, height: 22, fontSize: 16 }} aria-label="Delete set"
                          onClick={async () => { await api.deleteSet(x.id); reload() }}>×</button>
                      )}
                    </span>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {tab === 'Records' && (
        <section className="card">
          <h2>Best weight for each rep count</h2>
          {!repMaxes.length && <p className="muted small">No sets yet.</p>}
          <ul className="rows">
            {repMaxes.map(([reps, s]) => (
              <li key={reps} className="row">
                <span className="muted small" style={{ width: 70 }}>{reps} rep{reps === 1 ? '' : 's'}</span>
                <span style={{ flex: 1, fontWeight: 650 }}>{fmtKg(s.weight_kg)} kg</span>
                <span className="tiny muted">{fmtDay(s.performed_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {menu && (
        <Sheet title={exercise.name} onClose={() => setMenu(false)}>
          <MuscleSelect value={exercise.muscle} onChange={async m => {
            await api.updateExercise(exercise.id, { muscle: m })
            reload()
            notify('Saved')
          }} />
          <button className="btn btn-danger-quiet" onClick={async () => {
            if (!confirm(`Delete ${exercise.name} and all its sets? This also removes it from your routines.`)) return
            await api.deleteExercise(exercise.id)
            setMenu(false)
            reload()
            back()
          }}>Delete exercise</button>
        </Sheet>
      )}
    </div>
  )
}

function ExerciseLibrary({ nav, data, back, open, reload }: {
  nav: Nav; data: TrainingData; back: () => void; open: (v: View) => void; reload: () => void
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={back}>‹ Train</button>
        <button className="btn-text" onClick={() => setPicking(true)}>+ New</button>
      </header>
      <h1 className="detail-title">Exercises</h1>
      <Section className="thumbs">
        {data.exercises.map(e => {
          const sessions = data.sessions.get(e.id) ?? []
          const best = bestE1rm(sessions.flatMap(x => x.sets))
          return (
            <Row key={e.id} thumb={<ExerciseThumb image={e.image} />} chevron title={e.name}
              onClick={() => open({ kind: 'exercise', id: e.id, from: { kind: 'exercises' } })}
              sub={`${e.muscle ? MUSCLE_LABEL[e.muscle] : 'Muscle not set'}${sessions.length ? ` · best e1RM ${best.toFixed(1)} kg` : ' · no sets yet'}`} />
          )
        })}
      </Section>
      {picking && (
        <ExercisePicker api={nav.api} exercises={data.exercises} onClose={() => setPicking(false)} onCreated={reload}
          onPick={e => { setPicking(false); open({ kind: 'exercise', id: e.id, from: { kind: 'exercises' } }) }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

const TEMPLATE: [string, [string, Muscle, number, number, number][]][] = [
  ['Push day', [['Bench press', 'chest', 4, 6, 8], ['Incline DB press', 'chest', 3, 8, 10], ['Overhead press', 'shoulders', 3, 6, 8],
    ['Lateral raise', 'shoulders', 3, 12, 15], ['Triceps pushdown', 'triceps', 3, 10, 12]]],
  ['Pull day', [['Barbell row', 'back', 4, 6, 8], ['Lat pulldown', 'back', 3, 8, 12], ['Face pull', 'shoulders', 3, 12, 15],
    ['Biceps curl', 'biceps', 3, 10, 12]]],
  ['Legs day', [['Back squat', 'quads', 4, 5, 8], ['Romanian deadlift', 'hamstrings', 3, 8, 10], ['Leg press', 'quads', 3, 10, 12],
    ['Leg curl', 'hamstrings', 3, 10, 12], ['Calf raise', 'calves', 3, 10, 15]]],
]

async function createTemplate(api: Api, existing: Exercise[]) {
  const byName = new Map(existing.map(e => [e.name.toLowerCase(), e]))
  for (const [routineName, list] of TEMPLATE) {
    const r = await api.addRoutine(routineName)
    const items: RoutineItem[] = []
    for (const [name, muscle, sets, lo, hi] of list) {
      let ex = byName.get(name.toLowerCase())
      if (!ex) { ex = await api.addExercise(name, muscle); byName.set(name.toLowerCase(), ex) }
      items.push({ exercise_id: ex.id, target_sets: sets, rep_min: lo, rep_max: hi })
    }
    await api.setRoutineExercises(r.id, items)
  }
}
