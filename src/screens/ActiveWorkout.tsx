import { useEffect, useMemo, useRef, useState } from 'react'
import { scrollToTop } from '../lib/scroll'
import type { Nav } from '../App'
import { useNow, useTraining } from '../lib/hooks'
import { draftExercise, draftSet, parseNum, validSet, type Draft, type DraftExercise, type DraftSet } from '../lib/draft'
import { fmtKg, MUSCLE_LABEL } from '../lib/training'
import { Check, ChevronDown, Ellipsis, Minus, Plus, Timer, TrendingUp, TriangleAlert } from 'lucide-react'
import { ExercisePicker, fmtClock, Sheet } from '../components/ui'

type SetDraft = (d: (cur: Draft) => Draft) => void

/** What a set shows before you touch it: what you typed, else last time, else the target. */
function shownWeight(s: DraftSet): string {
  return s.weight || (s.prev ? fmtKg(s.prev.w) : '')
}
function shownReps(s: DraftSet, ex: DraftExercise): string {
  return s.reps || (s.prev ? String(s.prev.r) : ex.target ? String(ex.target.rep_max) : '')
}
/** Plate-sized steps: 1 kg for light weights, 2 kg for dumbbells, 2.5 kg above that. */
function kgStep(w: number) {
  return w < 10 ? 1 : w < 30 ? 2 : 2.5
}
const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function ActiveWorkout({ nav, draft, setDraft, onMinimise, onDiscard }: {
  nav: Nav; draft: Draft; setDraft: SetDraft; onMinimise: () => void; onDiscard: () => void
}) {
  const t = useTraining(nav.api)
  const now = useNow(500)
  const [picking, setPicking] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  // Which exercise is open and which of its sets you're on. Defaults to the first set not logged yet.
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [setKey, setSetKey] = useState<string | null>(null)
  const restWasRunning = useRef(false)
  const cardRef = useRef<HTMLElement | null>(null)

  const working = draft.exercises.flatMap(e => e.sets.filter(s => !s.warmup))
  const done = working.filter(validSet)
  const restLeft = draft.restUntil ? draft.restUntil - now : 0
  const resting = restLeft > 0

  const firstOpen = draft.exercises.find(e => e.sets.some(s => !s.done)) ?? draft.exercises[0] ?? null
  const open = draft.exercises.find(e => e.key === openKey) ?? firstOpen
  const active = open ? (open.sets.find(s => s.key === setKey && !s.done) ?? open.sets.find(s => !s.done) ?? null) : null

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
  const updateSet = (exKey: string, sKey: string, p: Partial<DraftSet>) =>
    updateEx(exKey, e => ({ ...e, sets: e.sets.map(s => (s.key === sKey ? { ...s, ...p } : s)) }))

  function openExercise(key: string) {
    setOpenKey(key)
    setSetKey(null)
    requestAnimationFrame(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  function log(ex: DraftExercise, s: DraftSet) {
    const weight = shownWeight(s)
    const reps = shownReps(s, ex)
    if (!validSet({ ...s, weight, reps, done: true })) { nav.notify('Set a weight and reps first'); return }
    const sets = ex.sets.map(x => (x.key === s.key ? { ...x, weight, reps, done: true } : x))
    setDraft(d => ({
      ...d,
      restUntil: Date.now() + d.restTotal * 1000,
      exercises: d.exercises.map(e => (e.key !== ex.key ? e : { ...e, sets })),
    }))
    setSetKey(null)
    // Last set of this exercise: move on to the next one that isn't finished.
    if (sets.every(x => x.done)) {
      const i = draft.exercises.findIndex(e => e.key === ex.key)
      const next = [...draft.exercises.slice(i + 1), ...draft.exercises.slice(0, i)].find(e => e.sets.some(x => !x.done))
      if (next) { nav.notify(`${exName(ex.exercise_id)} done`); openExercise(next.key) }
    }
  }

  /** Apply the suggested weight to every set that isn't logged yet. */
  function useTip(ex: DraftExercise) {
    if (ex.tip?.weight == null) return
    const w = fmtKg(ex.tip.weight)
    updateEx(ex.key, e => ({ ...e, sets: e.sets.map(s => (s.done ? s : { ...s, weight: w })) }))
  }

  function finish() {
    if (!draft.exercises.some(e => e.sets.some(s => s.done))) {
      if (confirm('No sets are logged. Discard this workout?')) onDiscard()
      return
    }
    setDraft(d => ({ ...d, finished_at: new Date().toISOString(), restUntil: null }))
    scrollToTop()
  }

  const exName = (id: string) => t.data?.exById.get(id)?.name ?? (t.data ? 'Deleted exercise' : '…')
  const exMuscle = (id: string) => { const m = t.data?.exById.get(id)?.muscle; return m ? MUSCLE_LABEL[m] : null }
  const menuEx = draft.exercises.find(e => e.key === menuFor) ?? null

  // Quick add: the exercises you train most that aren't in this workout yet.
  const quick = useMemo(() => {
    if (!t.data) return []
    const inWorkout = new Set(draft.exercises.map(e => e.exercise_id))
    return t.data.exercises
      .filter(e => !inWorkout.has(e.id))
      .map(e => ({ e, n: t.data!.sessions.get(e.id)?.length ?? 0 }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 8)
      .map(x => x.e)
  }, [t.data, draft.exercises])

  function addExercises(ids: string[]) {
    if (!t.data) return
    const added = ids.map(id => {
      const item = t.data!.items.find(i => i.exercise_id === id && i.routine_id === draft.routine_id) ?? null
      return draftExercise(id, item, t.data!.sessions.get(id) ?? [])
    })
    setDraft(d => ({ ...d, exercises: [...d.exercises, ...added] }))
    if (added[0] && (!open || open.sets.every(s => s.done))) openExercise(added[0].key)
  }

  const others = draft.exercises.filter(e => e.key !== open?.key)

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

      {open && (() => {
        const ex = open
        const name = exName(ex.exercise_id)
        const muscle = exMuscle(ex.exercise_id)
        const hist = t.data?.sessions.get(ex.exercise_id) ?? []
        const last = hist.length ? hist[hist.length - 1] : null
        const lastSets = last?.sets.filter(s => !s.is_warmup) ?? []
        const sameWeight = lastSets.length > 0 && lastSets.every(s => s.weight_kg === lastSets[0].weight_kg)
        const lastText = !lastSets.length ? null
          : sameWeight ? `${fmtKg(lastSets[0].weight_kg)} kg × ${lastSets.map(s => s.reps).join(', ')}`
          : lastSets.map(s => `${fmtKg(s.weight_kg)}×${s.reps}`).join(', ')
        const tipWeight = ex.tip?.weight != null ? fmtKg(ex.tip.weight) : null
        const tipApplied = tipWeight != null && ex.sets.filter(s => !s.done).every(s => shownWeight(s) === tipWeight)
        let n = 0
        return (
          <section className="wk-card" ref={el => { cardRef.current = el }} aria-label={name}>
            <div className="wk-head">
              <div style={{ minWidth: 0 }}>
                <h2>{name}</h2>
                {muscle && <span className="muted small">{muscle}</span>}
              </div>
              <button className="circle-btn" aria-label={`Options for ${name}`} onClick={() => setMenuFor(ex.key)}><Ellipsis size={20} strokeWidth={2.4} /></button>
            </div>

            {lastText && <p className="wk-last">Last time ({fmtDay(last!.date)}): <b>{lastText}</b></p>}
            {!lastText && ex.target && <p className="wk-last">First time: aim for <b>{ex.target.target_sets} × {ex.target.rep_min}{ex.target.rep_max !== ex.target.rep_min ? `–${ex.target.rep_max}` : ''}</b></p>}

            {ex.tip && !ex.tip.text.startsWith('Last time') && !ex.tip.text.startsWith('First time') ? (
              <div className={`wk-tip ${ex.tip.kind}`}>
                {ex.tip.kind === 'warn' ? <TriangleAlert size={16} strokeWidth={2.2} /> : <TrendingUp size={16} strokeWidth={2.2} />}
                <span>{ex.tip.text.replace(/^↑ /, '')}</span>
                {tipWeight != null && !tipApplied && <button onClick={() => useTip(ex)}>Use</button>}
              </div>
            ) : null}

            <div className="wk-sets">
              {ex.sets.map(s => {
                const label = s.warmup ? 'W' : String(++n)
                const isActive = active?.key === s.key
                const w = shownWeight(s), r = shownReps(s, ex)
                if (!isActive) {
                  return (
                    <button key={s.key} type="button" className={`wk-set ${s.done ? 'done' : ''}`}
                      onClick={() => { if (s.done) updateSet(ex.key, s.key, { done: false }); setSetKey(s.key) }}
                      aria-label={s.done ? `Set ${label}, logged ${w} kg × ${r}. Tap to change` : `Set ${label}, ${w || '–'} kg × ${r || '–'}`}>
                      <span className="num">{s.done ? <Check size={16} strokeWidth={3} /> : label}</span>
                      <span>{w ? `${w} kg` : '– kg'} × {r || '–'}</span>
                    </button>
                  )
                }
                const wNum = parseNum(w) || 0
                const rNum = parseInt(r, 10) || 0
                const hint = s.prev ? (s.warmup ? 'Warm-up' : `Beat ${s.prev.r} reps`) : ex.target ? `${ex.target.rep_min}–${ex.target.rep_max} reps` : null
                return (
                  <div key={s.key} className="wk-active">
                    <div className="wk-active-head">
                      <button className={`num ring ${s.warmup ? 'warm' : ''}`} aria-label={`Set ${label}: tap to mark as ${s.warmup ? 'working set' : 'warm-up'}`}
                        onClick={() => updateSet(ex.key, s.key, { warmup: !s.warmup })}>{label}</button>
                      {hint && <span className="muted">{hint}</span>}
                    </div>
                    <Stepper label="KG" value={w} inputMode="decimal"
                      onChange={v => updateSet(ex.key, s.key, { weight: v })}
                      onStep={dir => updateSet(ex.key, s.key, { weight: fmtKg(Math.max(0, wNum + dir * kgStep(wNum + (dir < 0 ? -0.01 : 0)))) })} />
                    <Stepper label="REPS" value={r} inputMode="numeric"
                      onChange={v => updateSet(ex.key, s.key, { reps: v.replace(/\D/g, '') })}
                      onStep={dir => updateSet(ex.key, s.key, { reps: String(Math.max(1, rNum + dir)) })} />
                    <button className="wk-log" onClick={() => log(ex, s)}><Check size={20} strokeWidth={2.8} />Log set {label}</button>
                  </div>
                )
              })}
              {!active && <p className="small" style={{ color: 'var(--up)', fontWeight: 600, margin: '4px 2px' }}>All sets logged. Nice work.</p>}
            </div>

            <div className="wk-foot">
              <button onClick={() => updateEx(ex.key, e => {
                const lastSet = e.sets[e.sets.length - 1]
                const s = draftSet(null, lastSet ? shownWeight(lastSet) : '')
                return { ...e, sets: [...e.sets, { ...s, reps: lastSet ? shownReps(lastSet, e) : '' }] }
              })}><Plus size={16} strokeWidth={2.6} />Add set</button>
              {ex.sets.length > 1 && !ex.sets[ex.sets.length - 1].done && (
                <button className="quiet" onClick={() => updateEx(ex.key, e => ({ ...e, sets: e.sets.slice(0, -1) }))}>Remove last set</button>
              )}
            </div>
          </section>
        )
      })()}

      {others.length > 0 && (
        <section className="group wk-list" aria-label="Other exercises">
          {others.map(ex => {
            const sets = ex.sets.filter(s => !s.warmup)
            const logged = sets.filter(s => s.done).length
            const allDone = sets.length > 0 && logged === sets.length
            const first = ex.sets.find(s => !s.done) ?? ex.sets[0]
            const plan = first ? `${sets.length} sets · ${shownWeight(first) || '–'} kg` : ''
            
            return (
              <button key={ex.key} type="button" className="group-row" onClick={() => openExercise(ex.key)}>
                <span className={`wk-dot ${allDone ? 'on' : logged ? 'part' : ''}`}>{allDone && <Check size={14} strokeWidth={3} />}</span>
                <span className="row-text"><span className="row-title">{exName(ex.exercise_id)}</span></span>
                <span className="row-trail">{logged && !allDone ? `${logged}/${sets.length} · ` : ''}{allDone ? `${sets.length} sets` : plan}</span>
              </button>
            )
          })}
        </section>
      )}

      {!draft.exercises.length && <p className="muted" style={{ marginTop: 16 }}>Add the first exercise to get going.</p>}

      <div className="section-title"><h2>Add exercise</h2></div>
      <section className="group" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button className="searchbar" style={{ border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setPicking(true)} disabled={!t.data}>
          <Plus size={18} strokeWidth={2.2} /><span style={{ fontSize: 17 }}>Search 750+ exercises</span>
        </button>
        {quick.length > 0 && (
          <div className="chips" aria-label="Your usual exercises">
            {quick.map(e => <button key={e.id} className="chip-btn" onClick={() => addExercises([e.id])}>{e.name}</button>)}
          </div>
        )}
      </section>

      <button className="btn btn-primary btn-big" style={{ marginTop: 16 }} onClick={finish}>Finish workout</button>
      <button className="btn" onClick={() => { if (confirm('Discard this workout? Nothing will be saved.')) onDiscard() }}>Discard</button>

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
          onPickMany={list => { setPicking(false); addExercises(list.map(e => e.id)) }} />
      )}

      {menuEx && (
        <Sheet title={exName(menuEx.exercise_id)} onClose={() => setMenuFor(null)}>
          <button className="btn" onClick={() => { move(setDraft, menuEx.key, -1); setMenuFor(null) }}>Move up</button>
          <button className="btn" onClick={() => { move(setDraft, menuEx.key, 1); setMenuFor(null) }}>Move down</button>
          <button className="btn btn-danger-quiet" onClick={() => {
            if (menuEx.sets.some(s => s.done) && !confirm('Remove this exercise and its logged sets?')) return
            setDraft(d => ({ ...d, exercises: d.exercises.filter(e => e.key !== menuEx.key) }))
            if (openKey === menuEx.key) setOpenKey(null)
            setMenuFor(null)
          }}>Remove exercise</button>
        </Sheet>
      )}
    </div>
  )
}

function Stepper({ label, value, inputMode, onChange, onStep }: {
  label: string; value: string; inputMode: 'decimal' | 'numeric'; onChange: (v: string) => void; onStep: (dir: 1 | -1) => void
}) {
  return (
    <div className="wk-stepper">
      <span className="lbl">{label}</span>
      <button type="button" aria-label={`Less ${label.toLowerCase()}`} onClick={() => onStep(-1)}><Minus size={22} strokeWidth={2.6} /></button>
      <input inputMode={inputMode} aria-label={label === 'KG' ? 'Weight in kg' : 'Reps'} value={value}
        onFocus={e => e.target.select()} onChange={e => onChange(e.target.value)} />
      <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onStep(1)}><Plus size={22} strokeWidth={2.6} /></button>
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
