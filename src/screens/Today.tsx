import { useState } from 'react'
import type { Nav } from '../App'
import { useLoad, useNow, useTraining } from '../lib/hooks'
import { countSince, startOfWeek, weekStreak } from '../lib/stats'
import { buildDraft } from '../lib/draft'
import { findPRs, planNext, previousWorkout, volume, workingSets } from '../lib/training'
import { loadSkips } from '../lib/skips'
import { Check, ChevronRight, Dumbbell, Flame, MapPin, Play, Star, Users } from 'lucide-react'
import { CENTRES, googleMapsUrl, openStatus } from '../lib/evoCentres'
import { distanceMeters, hourlyPattern } from '../lib/stats'
import { openMoreSub } from './More'
import { BusyDay, busyLine, BusyPill, useBusyness } from '../components/LiveBusy'
import { fmtClock, fmtDuration, LargeTitle, Ring, Row, Section, Spark } from '../components/ui'
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
  const mainCentre = favorite ? CENTRES.find(c => distanceMeters(favorite.lat, favorite.lng, c.lat, c.lng) < 250) ?? null : null
  const busyUrl = mainCentre ? googleMapsUrl(mainCentre)
    : favorite ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(favorite.name)}` : null
  const live = useBusyness(api, mainCentre?.visitsId)
  const hours = mainCentre ? openStatus(mainCentre, new Date(now)) : null
  const usualHours = (() => {
    if (!favorite) return null
    const p = hourlyPattern(visits.data ?? [], favorite.name)
    if (!p.some(v => v > 0)) return null
    const top = p.indexOf(1)
    return `You usually train here around ${String(top).padStart(2, '0')}:00`
  })()
  const openCentres = () => { openMoreSub('clubs'); nav.go('more') }
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
  const up = t.data ? planNext(t.data.routines, t.data.workouts, t.data.schedule, loadSkips(nav.owner)) : null
  const next = up?.routine ?? null

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


  const pct = (v: number, goal: number | undefined) => `${goal ? Math.min(100, (v / goal) * 100) : 0}%`
  const workoutDays = (() => {
    const out: boolean[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i)
      out.push(thisWeekVisits.some(v => new Date(v.visited_at).toDateString() === d.toDateString()))
    }
    return out
  })()

  return (
    <div className="screen">
      <LargeTitle title="Today" sub={new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={streak > 0 ? <span className="nav-pill"><Flame size={18} strokeWidth={2} aria-hidden="true" />{streak} week{streak === 1 ? '' : 's'}</span> : null} />

      {(visits.error || t.error) && <p className="error">{visits.error ?? t.error}</p>}

      {nav.draft && (
        <Section>
          <Row icon={<Dumbbell size={17} strokeWidth={2} />} onClick={nav.openWorkout}
            title={nav.draft.finished_at ? `${nav.draft.name} isn't saved yet` : `Workout in progress · ${nav.draft.name}`}
            sub={nav.draft.finished_at ? 'Open the summary to save it' : `${fmtClock(now - new Date(nav.draft.started_at).getTime())} elapsed`}
            trail={<span className="pill-btn">{nav.draft.finished_at ? 'Open' : 'Resume'}</span>} />
        </Section>
      )}

      <button className="hero-v2 card-btn" onClick={() => nav.go('food')} aria-label="Calories today. Open Food" style={{ border: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Ring value={eaten.kcal} max={g?.kcal ?? 1} size={104} stroke={12}>
            <Flame size={22} strokeWidth={2} color="var(--accent-text)" aria-hidden="true" />
          </Ring>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>
              {g ? Math.abs(Math.round(g.kcal - eaten.kcal)).toLocaleString('en-GB') : '–'}
            </span>
            <span className="muted" style={{ fontSize: 15 }}>{g && eaten.kcal > g.kcal ? 'kcal over' : 'kcal left'} of {g?.kcal.toLocaleString('en-GB') ?? '–'}</span>
          </div>
          <ChevronRight className="row-chev" size={18} strokeWidth={2.4} style={{ marginLeft: 'auto' }} aria-hidden="true" />
        </div>
        <div className="macro3">
          <div><span className="k">Protein</span><span className="v">{Math.round(eaten.protein)}<span> / {g?.protein ?? '–'} g</span></span><span className="b"><span style={{ width: pct(eaten.protein, g?.protein), background: 'var(--protein)' }} /></span></div>
          <div><span className="k">Carbs</span><span className="v">{Math.round(eaten.carbs)}<span> / {g?.carbs ?? '–'} g</span></span><span className="b"><span style={{ width: pct(eaten.carbs, g?.carbs), background: 'var(--carbs)' }} /></span></div>
          <div><span className="k">Fat</span><span className="v">{Math.round(eaten.fat)}<span> / {g?.fat ?? '–'} g</span></span><span className="b"><span style={{ width: pct(eaten.fat, g?.fat), background: 'var(--fat)' }} /></span></div>
        </div>
      </button>

      <Section title="Gym" className="icons" action={<button className="btn-text" onClick={openCentres}>Centres</button>}>
        <Row icon={<MapPin size={17} strokeWidth={2} />}
          title={checkedIn ? `At ${lastVisit.club_name ?? 'the gym'} · ${new Date(lastVisit.visited_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not checked in'}
          sub={checkedIn ? (lastVisit.source === 'manual' ? 'Checked in by you' : 'Checked in automatically') : 'Shortcuts check you in on arrival'}
          trail={checkedIn ? undefined : <button className="pill-btn" onClick={checkIn} disabled={busy}>{busy ? '…' : 'Check in'}</button>} />
        {favorite ? (
          <>
            <Row icon={<Star size={17} strokeWidth={2} fill="currentColor" />} title={favorite.name}
              sub={<>
                {hours && <span style={{ color: !hours.open ? 'var(--warn)' : hours.soon ? '#e5c07b' : 'var(--up)', fontWeight: 600 }}>{hours.text}</span>}
                {hours && ' · '}
                {(hours && !hours.open) ? 'Main centre' : busyLine(live) ?? (usualHours ? usualHours.replace('You usually', 'Usually') : 'Main centre')}
              </>}
              trail={live.status === 'ok' && hours?.open !== false ? <BusyPill state={live} />
                : busyUrl && hours?.open !== false ? <a className="pill-btn" href={busyUrl} target="_blank" rel="noreferrer"><Users size={14} strokeWidth={2.4} />How busy?</a> : undefined} />
            {live.status === 'ok' && hours?.open !== false && <div className="group-block" style={{ paddingTop: 4 }}><BusyDay data={live.data} /></div>}
          </>
        ) : clubs.data && (
          <Row icon={<Star size={17} strokeWidth={2} />} title="Choose your main centre" sub="See how busy it is from here" chevron onClick={openCentres} />
        )}
        <div className="group-block" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {([[30, 'last 30 days'], [182, '6 months'], [365, '12 months']] as const).map(([d, l]) => (
            <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{visits.data ? countSince(list, d) : '–'}</span>
              <span className="row-sub">{l}</span>
            </div>
          ))}
        </div>
        {t.data && todaysWorkout && (() => {
          const sets = workingSets(t.data.sets.filter(x => x.workout_id === todaysWorkout.id))
          const byEx = new Map<string, typeof sets>()
          for (const x of sets) byEx.set(x.exercise_id, [...(byEx.get(x.exercise_id) ?? []), x])
          const prs = findPRs(byEx, t.data.sessions, new Date(todaysWorkout.started_at)).length
          const prev = previousWorkout(todaysWorkout, t.data.workouts)
          const prevVol = prev ? volume(workingSets(t.data.sets.filter(x => x.workout_id === prev.id))) : 0
          const vol = volume(sets)
          return (
            <Row icon={<Check size={17} strokeWidth={2.4} />} iconTone="up" onClick={() => nav.go('train')} chevron
              title={`${todaysWorkout.name} done`}
              sub={`${fmtDuration(new Date(todaysWorkout.finished_at).getTime() - new Date(todaysWorkout.started_at).getTime())} · ${Math.round(vol).toLocaleString('en-GB')} kg${prs ? ` · ${prs} PR${prs === 1 ? '' : 's'}` : ''}`}
              trail={prevVol > 0 ? <span className={vol >= prevVol ? 'text-up' : 'text-down'} style={{ fontWeight: 600 }}>{vol >= prevVol ? '+' : '−'}{Math.abs(((vol - prevVol) / prevVol) * 100).toFixed(0)}%</span> : undefined} />
          )
        })()}
        {t.data && !todaysWorkout && !nav.draft && next && (
          <Row icon={<Dumbbell size={17} strokeWidth={2} />} title={up?.restToday ? 'Rest day' : `Up next: ${next.name}`}
            sub={up?.restToday ? `Your plan says rest today · next: ${next.name}` : `${t.data.items.filter(i => i.routine_id === next.id).length} exercises`}
            trail={<button className="circle-btn" aria-label={`Start ${next.name}`} onClick={() => nav.startWorkout(buildDraft(next, t.data!.items, t.data!.sessions))}><Play size={14} fill="currentColor" strokeWidth={0} /></button>} />
        )}
      </Section>

      <Section title="Body">
        <Row onClick={() => nav.go('progress')} chevron title="Weight"
          sub={weekAvg ? `7-day average ${weekAvg.toFixed(1)}` : 'No entries this week'}
          trail={<span style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Spark values={w.slice(-10).map(x => x.kg)} width={64} height={24} /><span style={{ color: 'var(--text)', fontSize: 17, fontWeight: 600 }}>{latestW ? `${latestW.kg.toFixed(1)} kg` : '–'}</span></span>} />
        <Row title="This week" sub={`${thisWeekVisits.length} of ${g?.workouts_per_week ?? 4} workouts`}
          trail={<span className="dots7" aria-hidden="true">{workoutDays.map((on, i) => <span key={i} className={on ? 'on' : ''} />)}</span>} />
      </Section>
    </div>
  )
}
