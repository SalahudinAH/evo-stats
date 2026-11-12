import { useMemo, useState } from 'react'
import type { Nav } from '../App'
import { useLoad, useTraining } from '../lib/hooks'
import { weeklyCounts } from '../lib/stats'
import { bestE1rm, insights, isStalled, MUSCLE_LABEL, weeklySetsByMuscle } from '../lib/training'
import { BarChart, LineChart } from '../components/Charts'
import { Spark } from '../components/ui'
import { WeightScreen } from './Weight'

const RANGES = { '4W': 28, '3M': 91, '1Y': 365 } as const
type Range = keyof typeof RANGES
const DAY = 24 * 3600 * 1000

export function Progress({ nav }: { nav: Nav }) {
  const t = useTraining(nav.api)
  const weights = useLoad(() => nav.api.listWeights(), [nav.api])
  const visits = useLoad(() => nav.api.listVisits(), [nav.api])
  const [range, setRange] = useState<Range>('4W')
  const [weightLog, setWeightLog] = useState(false)
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
        <header className="screen-head"><button className="back" onClick={() => setWeightLog(false)}>‹ Progress</button></header>
        <WeightScreen api={nav.api} notify={nav.notify} />
      </div>
    )
  }

  const w = (weights.data ?? []).filter(x => new Date(x.measured_at).getTime() >= since)
  const weeks = weeklyCounts(visits.data ?? [], 12)
  const avg = weeks.reduce((s, x) => s + x.count, 0) / weeks.length

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Progress</h1>
        <div className="seg seg-sm" role="group" aria-label="Time range">
          {(Object.keys(RANGES) as Range[]).map(r => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </header>
      {t.error && <p className="error">{t.error}</p>}

      <section className="card" aria-labelledby="mus-h" style={{ gap: 12 }}>
        <div>
          <h2 id="mus-h">Weekly sets per muscle</h2>
          <p className="small muted">Average working sets a week, {range === '4W' ? 'last 4 weeks' : range === '3M' ? 'last 3 months' : 'last year'}, vs target</p>
        </div>
        {loads.map(l => {
          const r = l.target ? l.perWeek / l.target : 1
          const kind = !l.target ? 'none' : r >= 1 ? 'on' : r >= 0.75 ? 'close' : 'behind'
          const color = kind === 'on' ? 'var(--up)' : kind === 'behind' ? 'var(--warn)' : '#8a8a8a'
          return (
            <div key={l.muscle} className="muscle-row">
              <span className="small" style={{ fontWeight: 600 }}>{MUSCLE_LABEL[l.muscle]}</span>
              <div className="mbar"><div style={{ width: `${Math.min(100, (l.target ? r : Math.min(1, l.perWeek / 10)) * 100)}%`, background: color }} /></div>
              <span className="tiny" style={{ textAlign: 'right', fontWeight: 650, color: kind === 'close' || kind === 'none' ? 'var(--text-2)' : color }}>
                {l.perWeek}{l.target ? ` / ${l.target}` : ''}
              </span>
            </div>
          )
        })}
        <div className="legend">
          <span><i style={{ background: 'var(--up)' }} />On target</span>
          <span><i style={{ background: '#8a8a8a' }} />Close</span>
          <span><i style={{ background: 'var(--warn)' }} />Behind</span>
        </div>
      </section>

      {tips.length > 0 && (
        <section className="card card-warn" aria-labelledby="wo-h">
          <h2 id="wo-h" className="text-warn">What to work on</h2>
          {tips.map((tip, i) => (
            <div key={tip.title} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.45 }}>
              <span className="num text-warn" style={{ flex: 'none' }}>{i + 1}</span>
              <span><b style={{ fontWeight: 650 }}>{tip.title}.</b> <span style={{ color: 'var(--text-2)' }}>{tip.body}</span></span>
            </div>
          ))}
        </section>
      )}

      <div className="section-head"><h2>Key lifts · e1RM</h2><button className="btn-text" onClick={() => nav.go('train')}>Train ›</button></div>
      {!lifts.length && <p className="muted small">Finish a workout to see your lifts here.</p>}
      <ul className="cards">
        {lifts.map(({ e, bests, stalled }) => {
          const first = bests[0], last = bests[bests.length - 1]
          const d = bests.length > 1 ? last - first : null
          const color = stalled ? 'var(--warn)' : d !== null && d > 0 ? 'var(--up)' : 'var(--muted)'
          return (
            <li key={e.id} className="card lift-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <h3>{e.name}</h3>
                <span className="tiny" style={{ fontWeight: 650, color }}>
                  {stalled ? 'Flat for 3 sessions' : d === null ? 'New' : `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)} kg`}
                </span>
              </div>
              <Spark values={bests} color={color} />
              <span className="num" style={{ textAlign: 'right', fontSize: 20 }}>{last.toFixed(1)}<span className="tiny muted" style={{ fontFamily: 'inherit' }}> kg</span></span>
            </li>
          )
        })}
      </ul>

      <section className="card">
        <div className="card-head">
          <div><h2>Body weight</h2>{w.length > 0 && <span className="small muted">{w[w.length - 1].kg.toFixed(1)} kg now{w.length > 1 ? ` · ${(w[w.length - 1].kg - w[0].kg >= 0 ? '+' : '')}${(w[w.length - 1].kg - w[0].kg).toFixed(1)} kg in this range` : ''}</span>}</div>
          <button className="btn-text" style={{ minHeight: 0 }} onClick={() => setWeightLog(true)}>Log ›</button>
        </div>
        {w.length >= 2
          ? <LineChart points={w.map(x => ({ x: new Date(x.measured_at), y: x.kg }))} unit="kg" decimals={0} height={150} />
          : <p className="muted small">Log your weight a couple of times, or set up the daily Health sync in More › Settings.</p>}
      </section>

      <section className="card">
        <div className="card-head"><h2>Visits per week</h2><span className="small muted">avg {avg.toFixed(1)} · 12 weeks</span></div>
        <BarChart bars={weeks.map((x, i) => ({
          label: x.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          value: x.count,
          highlight: i === weeks.length - 1,
        }))} />
      </section>
    </div>
  )
}
