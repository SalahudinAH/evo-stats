import { useState } from 'react'
import type { Api, Visit } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { countSince, fmtDateTime, weekStreak, weeklyCounts } from '../lib/stats'
import { BarChart } from '../components/Charts'

const SOURCE_LABEL: Record<Visit['source'], string> = {
  arrival: 'Arrived', nfc: 'NFC tap', wallet: 'Door tap', shortcut: 'Shortcut', manual: 'Manual',
}

export function Dashboard({ api, notify }: { api: Api; notify: (m: string) => void }) {
  const visits = useLoad(() => api.listVisits(), [api])
  const clubs = useLoad(() => api.listClubs(), [api])
  const [busy, setBusy] = useState(false)

  const list = visits.data ?? []
  const favorite = clubs.data?.find(c => c.is_favorite) ?? clubs.data?.[0] ?? null
  const weeks = weeklyCounts(list, 12)
  const streak = weekStreak(list)

  async function checkIn() {
    setBusy(true)
    try {
      const r = await api.checkIn(favorite?.name ?? null)
      notify(r.message)
      visits.reload()
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Check-in failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove(v: Visit) {
    if (!confirm(`Delete visit on ${fmtDateTime(v.visited_at)}?`)) return
    await api.deleteVisit(v.id)
    visits.reload()
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>EVO Stats</h1>
        {streak > 0 && <span className="pill">{streak} week streak</span>}
      </header>

      {visits.error && <p className="error">{visits.error}</p>}

      <section className="stats3" aria-label="Gym visits">
        <Stat value={countSince(list, 30)} label="Last 30 days" loading={!visits.data} />
        <Stat value={countSince(list, 182)} label="6 months" loading={!visits.data} />
        <Stat value={countSince(list, 365)} label="12 months" loading={!visits.data} />
      </section>

      <button className="btn btn-primary btn-big" onClick={checkIn} disabled={busy}>
        {busy ? 'Logging…' : `I'm at the gym${favorite ? ` · ${favorite.name}` : ''}`}
      </button>

      <section className="card">
        <div className="card-head">
          <h2>Visits per week</h2>
          <span className="muted">last 12 weeks</span>
        </div>
        <BarChart bars={weeks.map((w, i) => ({
          label: w.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          value: w.count,
          highlight: i === weeks.length - 1,
        }))} />
      </section>

      <section className="card">
        <div className="card-head"><h2>Recent visits</h2></div>
        {visits.data && list.length === 0 && (
          <p className="muted">No visits yet. Press the button above, or set up the Shortcuts automations in Settings so arrivals log on their own.</p>
        )}
        <ul className="rows">
          {list.slice(0, 12).map(v => (
            <li key={v.id} className="row">
              <div>
                <div>{v.club_name ?? 'EVO'}</div>
                <div className="muted small">{fmtDateTime(v.visited_at)}</div>
              </div>
              <div className="row-end">
                <span className="tag">{SOURCE_LABEL[v.source]}</span>
                <button className="icon-btn" aria-label="Delete visit" onClick={() => remove(v)}>×</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Stat({ value, label, loading }: { value: number; label: string; loading: boolean }) {
  return (
    <div className="stat">
      <div className="stat-value">{loading ? '–' : value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
