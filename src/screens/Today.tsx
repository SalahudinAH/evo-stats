import { useState } from 'react'
import type { Nav } from '../App'
import { useLoad, useNow, useTraining } from '../lib/hooks'
import { countSince, startOfWeek, weekStreak } from '../lib/stats'
import { buildDraft } from '../lib/draft'
import { findPRs, nextRoutine, previousWorkout, volume, workingSets } from '../lib/training'
import { fmtClock, fmtDuration, IconPin, IconPlay, MacroBar, Ring, Spark } from '../components/ui'
import { IconDumbbell } from '../App'
import { dayRange, sumMacros } from './Food'

export function Today({ nav }: { nav: Nav }) {
  const { api } = nav
  const visits = useLoad(() => api.listVisits(), [api])
  const clubs = useLoad(() => api.listClubs(), [api])
  const weights = useLoad(() => api.listWeights(), [api])
  const goals = useLoad(() => api.getGoals(), [api])
  const { from, to } = dayRange(0)
  const food = useLoad(() => api.listFoodEntries(from.toISOString(), to.toISOString()), [api])
  const t = useTraining(api)
  const [busy, setBusy] = useState(false)
  const now = useNow(30000)

  const list = visits.data ?? []
  const favorite = clubs.data?.find(c => c.is_favorite) ?? clubs.data?.[0] ?? null
  const lastVisit = list[0]
  const checkedIn = lastVisit && now - new Date(lastVisit.visited_at).getTime() < 3 * 3600 * 1000
  const streak = weekStreak(list)
  const weekStart = startOfWeek(new Date(now))
  const thisWeekVisits = list.filter(v => new Date(v.visited_at) >= weekStart)
  const g = goals.data
  const eaten = sumMacros(food.data ?? [])
  const w = weights.data ?? []
  const latestW = w[w.length - 1]
  const weekAvg = (() => {
    const recent = w.filter(x => new Date(x.measured_at).getTime() > now - 7 * 86400000)
    return recent.length ? recent.reduce((s, x) => s + x.kg, 0) / recent.length : null
  })()

  const todaysWorkout = t.data ? [...t.data.workouts].reverse().find(x => new Date(x.started_at).toDateString() === new Date(now).toDateString()) : null
  const next = t.data ? nextRoutine(t.data.routines, t.data.workouts) : null

  async function checkIn() {
    setBusy(true)
    try {
      const r = await api.checkIn(favorite?.name ?? null)
      nav.notify(r.message)
      visits.reload()
    } catch (e) {
      nav.notify(e instanceof Error ? e.message : 'Check-in failed')
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="screen">
      <header className="screen-head">
        <div>
          <p className="sub" style={{ marginTop: 0 }}>{new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>Today</h1>
        </div>
        {streak > 0 && <span className="pill">{streak} week streak</span>}
      </header>

      {(visits.error || t.error) && <p className="error">{visits.error ?? t.error}</p>}

      {nav.draft && (
        <button className="card card-accent card-btn resume" onClick={nav.openWorkout}>
          <div className="grow">
            <h3>{nav.draft.finished_at ? `${nav.draft.name} isn't saved yet` : `Workout in progress · ${nav.draft.name}`}</h3>
            <span className="small muted">{nav.draft.finished_at ? 'Open the summary to save it' : `${fmtClock(now - new Date(nav.draft.started_at).getTime())} elapsed`}</span>
          </div>
          <span className="btn btn-primary btn-small">{nav.draft.finished_at ? 'Open' : 'Resume'}</span>
        </button>
      )}

      <section className="card" aria-label="Gym check-in" style={{ gap: 10 }}>
        <div className="resume">
          <span className="pr-ic" style={{ width: 40, height: 40, borderRadius: 12 }}><IconPin /></span>
          <div className="grow">
            {checkedIn
              ? <><h3>At {lastVisit.club_name ?? 'the gym'} · {new Date(lastVisit.visited_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</h3>
                <span className="tiny muted">{lastVisit.source === 'manual' ? 'Checked in by you' : 'Checked in automatically'}</span></>
              : <><h3>Not checked in</h3><span className="tiny muted">{favorite?.name ?? 'Shortcuts check you in on arrival'}</span></>}
          </div>
          {!checkedIn && <button className="btn btn-primary btn-small" onClick={checkIn} disabled={busy}>{busy ? '…' : 'Check in'}</button>}
        </div>
        <div className="mini-stats">
          <div><b className="text-accent">{visits.data ? countSince(list, 30) : '–'}</b><span>30 days</span></div>
          <div><b>{visits.data ? countSince(list, 182) : '–'}</b><span>6 months</span></div>
          <div><b>{visits.data ? countSince(list, 365) : '–'}</b><span>12 months</span></div>
        </div>
      </section>

      <button className="card card-btn" onClick={() => nav.go('food')} aria-label="Calories today. Open Food">
        <div className="card-head" style={{ alignItems: 'center' }}>
          <h2>Calories</h2>
          <span className="small text-accent" style={{ fontWeight: 650 }}>Log food ›</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Ring value={eaten.kcal} max={g?.kcal ?? 1} size={100} stroke={11}>
            <span className="num" style={{ fontSize: 24 }}>{g ? Math.abs(Math.round(g.kcal - eaten.kcal)).toLocaleString('en-GB') : '–'}</span>
            <span className="tiny muted">{g && eaten.kcal > g.kcal ? 'kcal over' : 'kcal left'}</span>
          </Ring>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MacroBar name="Protein" value={eaten.protein} goal={g?.protein ?? 0} color="var(--protein)" />
            <MacroBar name="Carbs" value={eaten.carbs} goal={g?.carbs ?? 0} color="var(--carbs)" />
            <MacroBar name="Fat" value={eaten.fat} goal={g?.fat ?? 0} color="var(--fat)" />
          </div>
        </div>
      </button>

      {t.data && todaysWorkout && (() => {
        const sets = workingSets(t.data.sets.filter(s => s.workout_id === todaysWorkout.id))
        const prev = previousWorkout(todaysWorkout, t.data.workouts)
        const prevVol = prev ? volume(workingSets(t.data.sets.filter(s => s.workout_id === prev.id))) : 0
        const vol = volume(sets)
        const byEx = new Map<string, typeof sets>()
        for (const s of sets) byEx.set(s.exercise_id, [...(byEx.get(s.exercise_id) ?? []), s])
        const prs = findPRs(byEx, t.data.sessions, new Date(todaysWorkout.started_at)).length
        return (
          <button className="card card-accent card-btn resume" onClick={() => nav.go('train')}>
            <span className="pr-ic" style={{ width: 44, height: 44, borderRadius: 14 }}><IconDumbbell /></span>
            <div className="grow">
              <h3>{todaysWorkout.name} done</h3>
              <span className="small" style={{ color: '#e0c2cf' }}>
                {fmtDuration(new Date(todaysWorkout.finished_at).getTime() - new Date(todaysWorkout.started_at).getTime())} · {Math.round(vol).toLocaleString('en-GB')} kg{prs ? ` · ${prs} PR${prs === 1 ? '' : 's'}` : ''}
              </span>
            </div>
            {prevVol > 0 && <span className={`small ${vol >= prevVol ? 'text-up' : 'text-down'}`} style={{ fontWeight: 700 }}>{vol >= prevVol ? '▲' : '▼'} {Math.abs(((vol - prevVol) / prevVol) * 100).toFixed(1)}%</span>}
          </button>
        )
      })()}
      {t.data && !todaysWorkout && !nav.draft && next && (
        <section className="card resume">
          <span className="pr-ic" style={{ width: 44, height: 44, borderRadius: 14 }}><IconDumbbell /></span>
          <div className="grow"><h3>Up next: {next.name}</h3><span className="small muted">{t.data.items.filter(i => i.routine_id === next.id).length} exercises</span></div>
          <button className="btn btn-primary btn-small" onClick={() => nav.startWorkout(buildDraft(next, t.data!.items, t.data!.sessions))}><IconPlay /> Begin</button>
        </section>
      )}

      <div className="grid2">
        <button className="card card-btn" onClick={() => nav.go('progress')} style={{ gap: 6, padding: 14 }}>
          <span className="small muted">Body weight</span>
          <span className="num" style={{ fontSize: 26 }}>{latestW ? latestW.kg.toFixed(1) : '–'} <span className="small muted">kg</span></span>
          <Spark values={w.slice(-10).map(x => x.kg)} width={130} height={34} />
          <span className="tiny muted">{weekAvg ? `7-day avg ${weekAvg.toFixed(1)}` : 'No entries this week'}</span>
        </button>
        <div className="card" style={{ gap: 6, padding: 14 }}>
          <span className="small muted">Gym this week</span>
          <span className="num" style={{ fontSize: 26 }}>{thisWeekVisits.length} <span className="small muted">of {g?.workouts_per_week ?? 4}</span></span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, alignItems: 'end', height: 34 }} aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => {
              const d = new Date(weekStart); d.setDate(d.getDate() + i)
              const went = thisWeekVisits.some(v => new Date(v.visited_at).toDateString() === d.toDateString())
              return <div key={i} style={{ height: went ? 34 : 6, borderRadius: 3, background: went ? 'var(--accent)' : 'var(--surface-2)' }} />
            })}
          </div>
          <span className="tiny muted">M T W T F S S</span>
        </div>
      </div>

    </div>
  )
}
