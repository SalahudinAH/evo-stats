import { lazy, Suspense, useMemo, useState } from 'react'
import type { Nav } from '../App'
import { useLoad, useTraining } from '../lib/hooks'
import { weeklyCounts } from '../lib/stats'
import { bestE1rm, insights, isStalled, MUSCLE_LABEL, weeklySetsByMuscle } from '../lib/training'
import { BarChart, LineChart } from '../components/Charts'
import { ExerciseThumb, LargeTitle, Row, Section, Spark } from '../components/ui'
import { LEVEL_COLORS, loadLevel } from '../components/muscleLevels'
const MuscleMap = lazy(() => import('../components/MuscleMap').then(m => ({ default: m.MuscleMap })))
import { ChevronLeft, TriangleAlert } from 'lucide-react'
import type { Muscle } from '../lib/types'
import { WeightScreen } from './Weight'

const RANGES = { '4W': 28, '3M': 91, '1Y': 365 } as const
type Range = keyof typeof RANGES
const RANGE_LABEL: Record<Range, string> = { '4W': '4 weeks', '3M': '3 months', '1Y': '1 year' }
const DAY = 24 * 3600 * 1000

export function Progress({ nav }: { nav: Nav }) {
  const t = useTraining(nav.api)
  const weights = useLoad(() => nav.api.listWeights(), [nav.api])
  const visits = useLoad(() => nav.api.listVisits(), [nav.api])
  const [range, setRange] = useState<Range>('4W')
  const [weightLog, setWeightLog] = useState(false)
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const goals = useLoad(() => nav.api.getGoals(), [nav.api])
  const days = RANGES[range]
  const since = Date.now() - days * DAY

  const loads = useMemo(() => t.data ? weeklySetsByMuscle(t.data.sets, t.data.exercises, days) : [], [t.data, days])
  const tips = useMemo(() => t.data ? insights(t.data.sets, t.data.exercises, 5) : [], [t.data])
  const lifts = useMemo(() => {
    if (!t.data) return []
    return t.data.exercises
      .map(e => {
        const sessions = (t.data!.sessions.get(e.id) ?? []).filter(s => s.date.getTime() >= since)
        const bests = sessions.map(s => bestE1rm(s.sets))
        return { e, sessions, bests, stalled: isStalled(sessions) }
      })
      .filter(x => x.sessions.length > 0)
      .sort((a, b) => b.sessions.length - a.sessions.length)
      .slice(0, 6)
  }, [t.data, since])

  if (weightLog) {
    return (
      <div className="screen">
        <div className="nav-bar"><button className="nav-btn nav-text" onClick={() => { setWeightLog(false); weights.reload() }}><ChevronLeft size={24} strokeWidth={2.2} />Progress</button></div>
        <WeightScreen api={nav.api} notify={nav.notify} />
      </div>
    )
  }

  const w = (weights.data ?? []).filter(x => new Date(x.measured_at).getTime() >= since)
  const weeks = weeklyCounts(visits.data ?? [], 12)
  const avg = weeks.reduce((s, x) => s + x.count, 0) / weeks.length
  const rangeText = range === '4W' ? 'last 4 weeks' : range === '3M' ? 'last 3 months' : 'last year'
  const shown = muscle ? loads.filter(l => l.muscle === muscle) : loads

  return (
    <div className="screen">
      <LargeTitle title="Progress" />
      <div className="seg" role="group" aria-label="Time range">
        {(Object.keys(RANGES) as Range[]).map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
      </div>
      {t.error && <p className="error">{t.error}</p>}

      <Section title="Muscles" action={muscle ? <button className="btn-text" onClick={() => setMuscle(null)}>Show all</button> : undefined}>
        <Suspense fallback={<div className="body-map" style={{ height: 300 }} />}>
          <MuscleMap loads={loads} sex={goals.data?.sex ?? null} selected={muscle} onSelect={setMuscle} />
        </Suspense>
        <div className="map-legend" aria-hidden="true">
          <span><i style={{ background: '#3a3a3c' }} />None</span>
          {LEVEL_COLORS.map((c, i) => <span key={c}><i style={{ background: c }} />{['Some', 'Close', 'On target'][i]}</span>)}
        </div>
        {shown.map(l => {
          const level = loadLevel(l)
          const behind = l.target > 0 && l.perWeek < l.target * 0.6
          return (
            <Row key={l.muscle} title={MUSCLE_LABEL[l.muscle]} onClick={() => setMuscle(muscle === l.muscle ? null : l.muscle)}
              sub={l.target ? (level === 3 ? 'On target' : behind ? `Behind · aim for ${l.target} a week` : `Close · aim for ${l.target} a week`) : 'No target'}
              trail={<span style={{ color: level === 3 ? 'var(--up)' : behind ? 'var(--warn)' : undefined }}>{l.perWeek}{l.target ? ` / ${l.target}` : ''} sets</span>} />
          )
        })}
      </Section>
      <p className="tiny muted" style={{ padding: '0 16px' }}>Average working sets a week, {rangeText}. Tap a muscle to focus on it.</p>

      {tips.length > 0 && (
        <Section title="Work on">
          {tips.map(tip => (
            <Row key={tip.title} icon={<TriangleAlert size={18} strokeWidth={2} />} iconTone="warn" title={tip.title} sub={tip.body}
              onClick={() => nav.go('train')} chevron />
          ))}
        </Section>
      )}

      <Section title="Key lifts · e1RM" action={<button className="btn-text" onClick={() => nav.go('train')}>Train</button>}>
        {!lifts.length && <div className="group-block"><p className="muted small">Finish a workout to see your lifts here.</p></div>}
        {lifts.map(({ e, bests, stalled }) => {
          const first = bests[0], last = bests[bests.length - 1]
          const d = bests.length > 1 ? last - first : null
          const color = stalled ? 'var(--warn)' : d !== null && d > 0 ? 'var(--up)' : 'var(--muted)'
          return (
            <Row key={e.id} thumb={<ExerciseThumb image={e.image} />} title={e.name}
              sub={<span style={{ color }}>{stalled ? 'Flat for 3 sessions' : d === null ? 'New' : `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} kg`}</span>}
              trail={<span className="lift-trail"><Spark values={bests} color={color} /><span style={{ color: 'var(--text)', fontWeight: 600 }}>{last.toFixed(1)} kg</span></span>} />
          )
        })}
      </Section>

      <Section title="Body weight" action={<button className="btn-text" onClick={() => setWeightLog(true)}>Log weight</button>}>
        <div className="group-block">
          {w.length > 0 && <p className="small muted">{w[w.length - 1].kg.toFixed(1)} kg now{w.length > 1 ? ` · ${(w[w.length - 1].kg - w[0].kg >= 0 ? '+' : '')}${(w[w.length - 1].kg - w[0].kg).toFixed(1)} kg, ${rangeText}` : ''}</p>}
          {w.length >= 2
            ? <LineChart points={w.map(x => ({ x: new Date(x.measured_at), y: x.kg }))} unit="kg" decimals={0} height={150} />
            : <p className="muted small">Log your weight a couple of times, or set up the daily Health sync in More › Settings.</p>}
        </div>
      </Section>

      <Section title={`Visits per week · avg ${avg.toFixed(1)}`}>
        <div className="group-block">
          <BarChart bars={weeks.map((x, i) => ({
            label: x.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
            value: x.count,
            highlight: i === weeks.length - 1,
          }))} />
        </div>
      </Section>
    </div>
  )
}
