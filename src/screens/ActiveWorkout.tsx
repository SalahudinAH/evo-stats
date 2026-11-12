import { useEffect, useRef, useState } from 'react'
import type { Nav } from '../App'
import { useNow, useTraining } from '../lib/hooks'
import { draftExercise, draftSet, parseNum, validSet, type Draft, type DraftExercise, type DraftSet } from '../lib/draft'
import { bestE1rm, fmtKg } from '../lib/training'
import { ExercisePicker, fmtClock, IconCheck, IconDots, IconDown, Sheet } from '../components/ui'

type SetDraft = (d: (cur: Draft) => Draft) => void

export function ActiveWorkout({ nav, draft, setDraft, onMinimise, onDiscard }: {
  nav: Nav; draft: Draft; setDraft: SetDraft; onMinimise: () => void; onDiscard: () => void
}) {
  const t = useTraining(nav.api)
  const now = useNow(500)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [picking, setPicking] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const restWasRunning = useRef(false)

  const working = draft.exercises.flatMap(e => e.sets.filter(s => !s.warmup))
  const done = working.filter(validSet)
  const vol = done.reduce((m, s) => m + parseNum(s.weight) * parseInt(s.reps, 10), 0)
  const restLeft = draft.restUntil ? draft.restUntil - now : 0
  const resting = restLeft > 0

  // Buzz once when the rest is over (Android; iPhone Safari has no vibration API).
  useEffect(() => {
    if (resting) restWasRunning.current = true
    else if (restWasRunning.current) {
      restWasRunning.current = false
      navigator.vibrate?.([200, 100, 200])
      setDraft(d => ({ ...d, restUntil: null }))
    }
  }, [resting, setDraft])

  const updateEx = (key: string, fn: (e: DraftExercise) => DraftExercise) =>
    setDraft(d => ({ ...d, exercises: d.exercises.map(e => (e.key === key ? fn(e) : e)) }))
  const updateSet = (exKey: string, setKey: string, p: Partial<DraftSet>) =>
    updateEx(exKey, e => ({ ...e, sets: e.sets.map(s => (s.key === setKey ? { ...s, ...p } : s)) }))

  function toggle(ex: DraftExercise, s: DraftSet) {
    if (s.done) { updateSet(ex.key, s.key, { done: false }); return }
    const weight = s.weight || (s.prev ? fmtKg(s.prev.w) : '')
    const reps = s.reps || (s.prev ? String(s.prev.r) : ex.target ? String(ex.target.rep_max) : '')
    if (!validSet({ ...s, weight, reps, done: true })) { nav.notify('Enter weight and reps first'); return }
    setDraft(d => ({
      ...d,
      restUntil: Date.now() + d.restTotal * 1000,
      exercises: d.exercises.map(e => e.key !== ex.key ? e : {
        ...e, sets: e.sets.map(x => (x.key === s.key ? { ...x, weight, reps, done: true } : x)),
      }),
    }))
  }

  function finish() {
    const unticked = draft.exercises.flatMap(e => e.sets).filter(s => !s.done && s.reps.trim()).length
    if (!done.length && !draft.exercises.some(e => e.sets.some(s => s.done))) {
      if (confirm('No sets are ticked off. Discard this workout?')) onDiscard()
      return
    }
    if (unticked && !confirm(`${unticked} set${unticked === 1 ? ' has' : 's have'} reps typed in but not ticked off. Those won't be saved. Finish anyway?`)) return
    setDraft(d => ({ ...d, finished_at: new Date().toISOString(), restUntil: null }))
    window.scrollTo({ top: 0 })
  }

  const exName = (id: string) => t.data?.exById.get(id)?.name ?? (t.data ? 'Deleted exercise' : '…')
  const menuEx = draft.exercises.find(e => e.key === menuFor) ?? null

  return (
    <div className="screen" style={{ paddingBottom: resting ? 120 : 0 }}>
      <header className="workout-head">
        <div className="bar">
          <button className="round-btn" aria-label="Minimise workout" onClick={onMinimise}><IconDown /></button>
          <div className="title">
            <span>{draft.name}</span>
            <span className="clock" aria-label="Elapsed time">{fmtClock(now - new Date(draft.started_at).getTime())}</span>
          </div>
          <button className="btn btn-primary" onClick={finish}>Finish</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="tiny muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{done.length} of {working.length} sets</span>
            <span>{Math.round(vol).toLocaleString('en-GB')} kg volume</span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={working.length} aria-valuenow={done.length} aria-label="Sets done">
            <div style={{ width: `${working.length ? (done.length / working.length) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      {draft.exercises.map(ex => {
        const isOpen = !collapsed.has(ex.key)
        const doneHere = ex.sets.filter(s => !s.warmup && validSet(s)).length
        const total = ex.sets.filter(s => !s.warmup).length
        const sessions = t.data?.sessions.get(ex.exercise_id) ?? []
        const best = bestE1rm(sessions.flatMap(s => s.sets))
        let n = 0
        return (
          <section key={ex.key} className="card wex">
            <div className="wex-head">
              <button className="wex-title" aria-expanded={isOpen}
                onClick={() => setCollapsed(c => { const x = new Set(c); if (x.has(ex.key)) x.delete(ex.key); else x.add(ex.key); return x })}>
                <span className="n">{exName(ex.exercise_id)}</span>
                <span className="s">
                  {ex.target ? `${ex.target.target_sets} × ${ex.target.rep_min}${ex.target.rep_max !== ex.target.rep_min ? `–${ex.target.rep_max}` : ''} · ` : ''}
                  {doneHere}/{total} done{best ? ` · best e1RM ${best.toFixed(1)} kg` : ''}
                </span>
              </button>
              <button className="icon-btn" aria-label={`Options for ${exName(ex.exercise_id)}`} onClick={() => setMenuFor(ex.key)}><IconDots /></button>
            </div>
            {isOpen && (
              <>
                {ex.tip && <div className={`tip tip-${ex.tip.kind}`}>{ex.tip.text}</div>}
                <div className="set-grid head" aria-hidden="true">
                  <span>SET</span><span>PREVIOUS</span><span>KG</span><span>REPS</span><span>✓</span>
                </div>
                {ex.sets.map(s => {
                  const label = s.warmup ? 'W' : String(++n)
                  const name = `${exName(ex.exercise_id)} set ${label}`
                  return (
                    <div key={s.key} className={`set-grid ${s.done ? 'done' : ''}`}>
                      <button className={`set-label ${s.warmup ? 'warm' : ''}`} aria-label={`${name}: tap to mark as ${s.warmup ? 'working set' : 'warm-up'}`}
                        onClick={() => updateSet(ex.key, s.key, { warmup: !s.warmup })}>{label}</button>
                      <span className="set-prev">{s.prev ? `${fmtKg(s.prev.w)} × ${s.prev.r}` : '–'}</span>
                      <input className="set-in" inputMode="decimal" aria-label={`${name} weight in kg`} value={s.weight}
                        placeholder={s.prev ? fmtKg(s.prev.w) : 'kg'} onFocus={e => e.target.select()}
                        onChange={e => updateSet(ex.key, s.key, { weight: e.target.value })} />
                      <input className="set-in" inputMode="numeric" aria-label={`${name} reps`} value={s.reps}
                        placeholder={s.prev ? String(s.prev.r) : ex.target ? String(ex.target.rep_max) : 'reps'} onFocus={e => e.target.select()}
                        onChange={e => updateSet(ex.key, s.key, { reps: e.target.value.replace(/\D/g, '') })} />
                      <button className={`check ${s.done ? 'on' : ''}`} aria-label={`${name} done`} aria-pressed={s.done} onClick={() => toggle(ex, s)}>
                        <IconCheck />
                      </button>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ flex: 1 }} onClick={() => updateEx(ex.key, e => {
                    const last = e.sets[e.sets.length - 1]
                    return { ...e, sets: [...e.sets, draftSet(null, last?.weight ?? '')] }
                  })}>+ Add set</button>
                  {ex.sets.length > 1 && !ex.sets[ex.sets.length - 1].done && (
                    <button className="btn" onClick={() => updateEx(ex.key, e => ({ ...e, sets: e.sets.slice(0, -1) }))}>− Set</button>
                  )}
                </div>
              </>
            )}
          </section>
        )
      })}

      {!draft.exercises.length && <p className="muted">Add the first exercise to get going.</p>}
      <button className="btn btn-soft btn-big" onClick={() => setPicking(true)} disabled={!t.data}>+ Add exercise</button>
      <button className="btn btn-danger-quiet" onClick={() => { if (confirm('Discard this workout? Nothing will be saved.')) onDiscard() }}>Discard workout</button>

      {resting && (
        <div className="rest" role="status">
          <div className="rest-inner">
            <div className="rest-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="tiny muted">Rest</span>
                <span className="time">{fmtClock(restLeft)}</span>
              </div>
              <div className="btns">
                <button className="btn" aria-label="15 seconds less rest" onClick={() => setDraft(d => ({ ...d, restUntil: (d.restUntil ?? Date.now()) - 15000, restTotal: Math.max(15, d.restTotal - 15) }))}>−15</button>
                <button className="btn" aria-label="15 seconds more rest" onClick={() => setDraft(d => ({ ...d, restUntil: (d.restUntil ?? Date.now()) + 15000, restTotal: Math.min(600, d.restTotal + 15) }))}>+15</button>
                <button className="btn btn-primary" onClick={() => { restWasRunning.current = false; setDraft(d => ({ ...d, restUntil: null })) }}>Skip</button>
              </div>
            </div>
            <div className="progress"><div style={{ width: `${Math.min(100, (restLeft / (draft.restTotal * 1000)) * 100)}%` }} /></div>
          </div>
        </div>
      )}

      {picking && t.data && (
        <ExercisePicker api={nav.api} exercises={t.data.exercises} exclude={draft.exercises.map(e => e.exercise_id)}
          onClose={() => setPicking(false)} onCreated={t.reload}
          onPick={e => {
            setPicking(false)
            const item = t.data!.items.find(i => i.exercise_id === e.id && i.routine_id === draft.routine_id) ?? null
            setDraft(d => ({ ...d, exercises: [...d.exercises, draftExercise(e.id, item, t.data!.sessions.get(e.id) ?? [])] }))
          }} />
      )}

      {menuEx && (
        <Sheet title={exName(menuEx.exercise_id)} onClose={() => setMenuFor(null)}>
          <button className="btn" onClick={() => { move(setDraft, menuEx.key, -1); setMenuFor(null) }}>Move up</button>
          <button className="btn" onClick={() => { move(setDraft, menuEx.key, 1); setMenuFor(null) }}>Move down</button>
          <button className="btn btn-danger-quiet" onClick={() => {
            if (menuEx.sets.some(s => s.done) && !confirm('Remove this exercise and its ticked sets?')) return
            setDraft(d => ({ ...d, exercises: d.exercises.filter(e => e.key !== menuEx.key) }))
            setMenuFor(null)
          }}>Remove exercise</button>
        </Sheet>
      )}
    </div>
  )
}

function move(setDraft: SetDraft, key: string, dir: number) {
  setDraft(d => {
    const i = d.exercises.findIndex(e => e.key === key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= d.exercises.length) return d
    const list = [...d.exercises];[list[i], list[j]] = [list[j], list[i]]
    return { ...d, exercises: list }
  })
}
