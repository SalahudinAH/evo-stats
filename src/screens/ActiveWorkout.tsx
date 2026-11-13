import { useEffect, useRef, useState } from 'react'
import { scrollToTop } from '../lib/scroll'
import type { Nav } from '../App'
import { useNow, useTraining } from '../lib/hooks'
import { draftExercise, draftSet, validSet, type Draft, type DraftExercise, type DraftSet } from '../lib/draft'
import { fmtKg } from '../lib/training'
import { Check, ChevronDown, Ellipsis, Plus, Timer, TrendingUp, TriangleAlert } from 'lucide-react'
import { ExercisePicker, ExerciseThumb, fmtClock, Sheet } from '../components/ui'

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
    scrollToTop()
  }

  const exName = (id: string) => t.data?.exById.get(id)?.name ?? (t.data ? 'Deleted exercise' : '…')
  const menuEx = draft.exercises.find(e => e.key === menuFor) ?? null

  const exImage = (id: string) => t.data?.exById.get(id)?.image ?? null

  return (
    <div className="screen" style={{ paddingBottom: resting ? 96 : 0 }}>
      <header className="wbar">
        <div className="row">
          <button className="nav-btn" aria-label="Minimise workout" onClick={onMinimise}><ChevronDown size={24} strokeWidth={2.2} /></button>
          <div className="mid">
            <b>{draft.name}</b>
            <span aria-label="Elapsed time and sets done">{fmtClock(now - new Date(draft.started_at).getTime())} · {done.length} of {working.length} sets</span>
          </div>
          <button className="pill-btn finish" onClick={finish}>Finish</button>
        </div>
        <div className="line" role="progressbar" aria-valuemin={0} aria-valuemax={working.length} aria-valuenow={done.length} aria-label="Sets done">
          <div style={{ width: `${working.length ? (done.length / working.length) * 100 : 0}%` }} />
        </div>
      </header>

      {draft.exercises.map(ex => {
        const isOpen = !collapsed.has(ex.key)
        const workingHere = ex.sets.filter(s => !s.warmup)
        const doneHere = workingHere.filter(validSet).length
        const name = exName(ex.exercise_id)
        const lastLine = workingHere.filter(s => s.prev).map(s => s.prev!.r).join(', ')
        const firstPrev = workingHere.find(s => s.prev)?.prev
        let n = 0
        return (
          <section key={ex.key} className="wx">
            <div className="wx-head">
              <button className="open" aria-expanded={isOpen}
                onClick={() => setCollapsed(c => { const x = new Set(c); if (x.has(ex.key)) x.delete(ex.key); else x.add(ex.key); return x })}>
                <ExerciseThumb image={exImage(ex.exercise_id)} size={40} className="thumb" />
                <span style={{ minWidth: 0 }}>
                  <span className="n">{name}</span>
                  <span className="s">
                    {isOpen
                      ? `${ex.target ? `${ex.target.target_sets} × ${ex.target.rep_min}${ex.target.rep_max !== ex.target.rep_min ? `–${ex.target.rep_max}` : ''} · ` : ''}${doneHere} of ${workingHere.length} done`
                      : `${workingHere.length} sets${firstPrev ? ` · last ${fmtKg(firstPrev.w)} kg × ${lastLine}` : ''}`}
                  </span>
                </span>
              </button>
              <button className="nav-btn" aria-label={`Options for ${name}`} onClick={() => setMenuFor(ex.key)}><Ellipsis size={22} strokeWidth={2.6} /></button>
            </div>
            {isOpen && (
              <>
                {ex.tip && (
                  <p className={`wx-tip ${ex.tip.kind === 'info' ? '' : ex.tip.kind}`}>
                    {ex.tip.kind === 'up' && <TrendingUp size={15} strokeWidth={2.2} />}
                    {ex.tip.kind === 'warn' && <TriangleAlert size={15} strokeWidth={2.2} />}
                    {ex.tip.text.replace(/^↑ /, '')}
                  </p>
                )}
                <div className="sets">
                  <div className="r h" aria-hidden="true"><span>SET</span><span>PREVIOUS</span><span>KG</span><span>REPS</span><span /></div>
                  {ex.sets.map(s => {
                    const label = s.warmup ? 'W' : String(++n)
                    const what = `${name} set ${label}`
                    return (
                      <div key={s.key} className={`r ${s.done ? 'done' : ''}`}>
                        <button className={`lbl ${s.warmup ? 'warm' : ''}`} aria-label={`${what}: tap to mark as ${s.warmup ? 'working set' : 'warm-up'}`}
                          onClick={() => updateSet(ex.key, s.key, { warmup: !s.warmup })}>{label}</button>
                        <span className="prev">{s.prev ? `${fmtKg(s.prev.w)} × ${s.prev.r}` : '–'}</span>
                        <input inputMode="decimal" aria-label={`${what} weight in kg`} value={s.weight}
                          placeholder={s.prev ? fmtKg(s.prev.w) : 'kg'} onFocus={e => e.target.select()}
                          onChange={e => updateSet(ex.key, s.key, { weight: e.target.value })} />
                        <input inputMode="numeric" aria-label={`${what} reps`} value={s.reps}
                          placeholder={s.prev ? String(s.prev.r) : ex.target ? String(ex.target.rep_max) : 'reps'} onFocus={e => e.target.select()}
                          onChange={e => updateSet(ex.key, s.key, { reps: e.target.value.replace(/\D/g, '') })} />
                        <button className={`ck ${s.done ? 'on' : ''}`} aria-label={`${what} done`} aria-pressed={s.done} onClick={() => toggle(ex, s)}>
                          <span><Check size={16} strokeWidth={3} /></span>
                        </button>
                      </div>
                    )
                  })}
                  <button className="add" onClick={() => updateEx(ex.key, e => {
                    const last = e.sets[e.sets.length - 1]
                    return { ...e, sets: [...e.sets, draftSet(null, last?.weight ?? '')] }
                  })}><Plus size={18} strokeWidth={2.2} />Add set</button>
                </div>
              </>
            )}
          </section>
        )
      })}

      {!draft.exercises.length && <p className="muted" style={{ marginTop: 16 }}>Add the first exercise to get going.</p>}
      <button className="btn btn-big" style={{ marginTop: 16, color: 'var(--accent-text)', background: 'var(--surface)' }} onClick={() => setPicking(true)} disabled={!t.data}>
        <Plus size={20} strokeWidth={2.2} />Add exercise
      </button>
      <button className="btn btn-danger-quiet" onClick={() => { if (confirm('Discard this workout? Nothing will be saved.')) onDiscard() }}>Discard workout</button>

      {resting && (
        <div className="rest-pill" role="status">
          <div className="bar" style={{ width: `${Math.min(100, (restLeft / (draft.restTotal * 1000)) * 100)}%` }} />
          <Timer size={20} strokeWidth={2} color="var(--muted)" aria-hidden="true" />
          <span className="t" aria-label="Rest time left">{fmtClock(restLeft)}</span>
          <button className="b" aria-label="15 seconds less rest" onClick={() => setDraft(d => ({ ...d, restUntil: (d.restUntil ?? Date.now()) - 15000, restTotal: Math.max(15, d.restTotal - 15) }))}>−15</button>
          <button className="b" aria-label="15 seconds more rest" onClick={() => setDraft(d => ({ ...d, restUntil: (d.restUntil ?? Date.now()) + 15000, restTotal: Math.min(600, d.restTotal + 15) }))}>+15</button>
          <button className="skip" onClick={() => { restWasRunning.current = false; setDraft(d => ({ ...d, restUntil: null })) }}>Skip</button>
        </div>
      )}

      {picking && t.data && (
        <ExercisePicker api={nav.api} exercises={t.data.exercises} exclude={draft.exercises.map(e => e.exercise_id)}
          onClose={() => setPicking(false)} onCreated={t.reload}
          onPickMany={list => {
            setPicking(false)
            setDraft(d => ({
              ...d,
              exercises: [...d.exercises, ...list.map(e => {
                const item = t.data!.items.find(i => i.exercise_id === e.id && i.routine_id === draft.routine_id) ?? null
                return draftExercise(e.id, item, t.data!.sessions.get(e.id) ?? [])
              })],
            }))
          }} />
      )}

      {menuEx && (
        <Sheet title={exName(menuEx.exercise_id)} onClose={() => setMenuFor(null)}>
          <button className="btn" onClick={() => { move(setDraft, menuEx.key, -1); setMenuFor(null) }}>Move up</button>
          <button className="btn" onClick={() => { move(setDraft, menuEx.key, 1); setMenuFor(null) }}>Move down</button>
          {menuEx.sets.length > 1 && !menuEx.sets[menuEx.sets.length - 1].done && (
            <button className="btn" onClick={() => { updateEx(menuEx.key, e => ({ ...e, sets: e.sets.slice(0, -1) })); setMenuFor(null) }}>Remove last set</button>
          )}
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
