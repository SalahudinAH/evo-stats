import { useMemo, useState } from 'react'
import type { Api, Exercise, WorkoutSet } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { e1rm, e1rmSeries, fmtDate } from '../lib/stats'
import { LineChart } from '../components/Charts'

const DAY = 24 * 3600 * 1000

export function Strength({ api, notify }: { api: Api; notify: (m: string) => void }) {
  const exercises = useLoad(() => api.listExercises(), [api])
  const sets = useLoad(() => api.listSets(), [api])
  const [openId, setOpenId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const byExercise = useMemo(() => {
    const m = new Map<string, WorkoutSet[]>()
    for (const s of sets.data ?? []) {
      const arr = m.get(s.exercise_id) ?? []
      arr.push(s)
      m.set(s.exercise_id, arr)
    }
    return m
  }, [sets.data])

  const open = exercises.data?.find(e => e.id === openId) ?? null

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    try {
      await api.addExercise(name)
      setNewName('')
      exercises.reload()
    } catch (err) {
      notify(err instanceof Error && err.message.includes('duplicate') ? 'You already have that exercise' : 'Could not add exercise')
    }
  }

  if (open) {
    return (
      <ExerciseDetail api={api} exercise={open} sets={byExercise.get(open.id) ?? []}
        onBack={() => setOpenId(null)}
        onChange={() => sets.reload()}
        onDeleted={() => { setOpenId(null); exercises.reload(); sets.reload() }}
        notify={notify} />
    )
  }

  return (
    <div className="screen">
      <header className="screen-head"><h1>Strength</h1></header>
      {(exercises.error || sets.error) && <p className="error">{exercises.error ?? sets.error}</p>}

      <form className="inline-form" onSubmit={add}>
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a lift, e.g. Back squat"
          aria-label="New exercise name" />
        <button className="btn btn-primary" disabled={!newName.trim()}>Add</button>
      </form>

      {exercises.data && exercises.data.length === 0 && (
        <p className="muted">Add the lifts you want to track. Each set you log updates your estimated 1-rep max, which is the number to watch for progressive overload.</p>
      )}

      <ul className="cards">
        {(exercises.data ?? []).map(ex => {
          const series = e1rmSeries(byExercise.get(ex.id) ?? [])
          const best = series.reduce((m, p) => Math.max(m, p.value), 0)
          const latest = series[series.length - 1]
          const monthAgo = [...series].reverse().find(p => p.date.getTime() < Date.now() - 28 * DAY)
          const delta = latest && monthAgo ? latest.value - monthAgo.value : null
          return (
            <li key={ex.id}>
              <button className="card card-btn" onClick={() => setOpenId(ex.id)}>
                <div className="card-head">
                  <h2>{ex.name}</h2>
                  <span className="chev" aria-hidden="true">›</span>
                </div>
                {series.length ? (
                  <div className="kv">
                    <span><b>{best.toFixed(1)}</b> kg best e1RM</span>
                    {delta !== null && (
                      <span className={delta >= 0 ? 'up' : 'down'}>
                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} kg / 4 wk
                      </span>
                    )}
                  </div>
                ) : <span className="muted small">No sets yet</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ExerciseDetail({ api, exercise, sets, onBack, onChange, onDeleted, notify }: {
  api: Api; exercise: Exercise; sets: WorkoutSet[]
  onBack: () => void; onChange: () => void; onDeleted: () => void; notify: (m: string) => void
}) {
  const last = sets[sets.length - 1]
  const [weight, setWeight] = useState(last ? String(last.weight_kg) : '')
  const [reps, setReps] = useState(last ? String(last.reps) : '')
  const series = e1rmSeries(sets)
  const best = series.reduce((m, p) => Math.max(m, p.value), 0)

  const w = parseFloat(weight.replace(',', '.'))
  const r = parseInt(reps, 10)
  const valid = Number.isFinite(w) && w >= 0 && Number.isInteger(r) && r >= 1 && r <= 100

  async function logSet(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    const isPR = e1rm(w, r) > best && best > 0
    await api.addSet(exercise.id, w, r)
    notify(isPR ? `New PR! e1RM ${e1rm(w, r).toFixed(1)} kg` : 'Set logged')
    onChange()
  }

  async function removeExercise() {
    if (!confirm(`Delete ${exercise.name} and all its sets?`)) return
    await api.deleteExercise(exercise.id)
    onDeleted()
  }

  // Group history by day, newest first.
  const days = new Map<string, WorkoutSet[]>()
  for (const s of [...sets].reverse()) {
    const k = new Date(s.performed_at).toDateString()
    days.set(k, [...(days.get(k) ?? []), s])
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={onBack}>‹ Strength</button>
      </header>
      <h1 className="detail-title">{exercise.name}</h1>

      <section className="card">
        <div className="card-head">
          <h2>Estimated 1RM</h2>
          {best > 0 && <span className="muted">best {best.toFixed(1)} kg</span>}
        </div>
        {series.length >= 2
          ? <LineChart points={series.map(p => ({ x: p.date, y: p.value }))} unit="kg" />
          : <p className="muted">Log sets on two different days to see your trend.</p>}
      </section>

      <form className="card set-form" onSubmit={logSet}>
        <h2>Log a set</h2>
        <div className="set-inputs">
          <label>
            <span>Weight (kg)</span>
            <input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="100" />
          </label>
          <span className="times" aria-hidden="true">×</span>
          <label>
            <span>Reps</span>
            <input inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} placeholder="5" />
          </label>
        </div>
        {valid && <p className="muted small">e1RM for this set: {e1rm(w, r).toFixed(1)} kg</p>}
        <button className="btn btn-primary" disabled={!valid}>Log set</button>
      </form>

      <section className="card">
        <div className="card-head"><h2>History</h2></div>
        {sets.length === 0 && <p className="muted">No sets yet.</p>}
        {[...days.entries()].map(([k, daySets]) => (
          <div key={k} className="day-group">
            <div className="muted small">{fmtDate(daySets[0].performed_at)}</div>
            <ul className="rows">
              {daySets.map(s => (
                <li key={s.id} className="row">
                  <span>{s.weight_kg} kg × {s.reps}</span>
                  <div className="row-end">
                    <span className="muted small">e1RM {e1rm(s.weight_kg, s.reps).toFixed(0)}</span>
                    <button className="icon-btn" aria-label="Delete set"
                      onClick={async () => { await api.deleteSet(s.id); onChange() }}>×</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <button className="btn btn-danger-quiet" onClick={removeExercise}>Delete exercise</button>
    </div>
  )
}
