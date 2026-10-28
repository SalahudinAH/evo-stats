import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Api, Club } from '../lib/types'
import { useGeolocation, useLoad } from '../lib/hooks'
import { distanceMeters, hourlyPattern } from '../lib/stats'
import { HourStrip } from '../components/Charts'

export function Clubs({ api, notify }: { api: Api; notify: (m: string) => void }) {
  const clubs = useLoad(() => api.listClubs(), [api])
  const visits = useLoad(() => api.listVisits(), [api])
  const { geo, locate } = useGeolocation()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('EVO ')

  // Ask for location once when the screen opens (needed for distance + "add here").
  useEffect(() => { locate() }, [locate])

  const here = geo.status === 'ok' ? geo : null
  const sorted = useMemo(() => {
    const list = [...(clubs.data ?? [])]
    if (here) list.sort((a, b) => distanceMeters(here.lat, here.lng, a.lat, a.lng) - distanceMeters(here.lat, here.lng, b.lat, b.lng))
    else list.sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite))
    return list
  }, [clubs.data, here])

  async function addHere(e: FormEvent) {
    e.preventDefault()
    if (!here) return
    const n = name.trim() || 'EVO'
    await api.addClub(n, here.lat, here.lng, (clubs.data ?? []).length === 0)
    setAdding(false)
    setName('EVO ')
    notify(`${n} saved`)
    clubs.reload()
  }

  async function remove(c: Club) {
    if (!confirm(`Remove ${c.name}?`)) return
    await api.deleteClub(c.id)
    clubs.reload()
  }

  const hour = new Date().getHours()

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Clubs</h1>
        <button className="btn btn-small" onClick={() => setAdding(a => !a)} disabled={!here}>
          {adding ? 'Cancel' : '+ Add here'}
        </button>
      </header>

      {geo.status === 'error' && <p className="error">{geo.message}</p>}
      {geo.status === 'locating' && <p className="muted small">Finding your location…</p>}

      {adding && here && (
        <form className="card" onSubmit={addHere}>
          <h2>Save this spot as a club</h2>
          <p className="muted small">Uses where you're standing now (±{Math.round(here.accuracy)} m). Do this inside the gym.</p>
          <div className="inline-form">
            <input value={name} onChange={e => setName(e.target.value)} aria-label="Club name" autoFocus />
            <button className="btn btn-primary">Save</button>
          </div>
        </form>
      )}

      {clubs.data && clubs.data.length === 0 && !adding && (
        <div className="card empty">
          <p><b>No clubs yet.</b></p>
          <p className="muted">Next time you're at your EVO, open this tab and tap <b>+ Add here</b>. Your first club becomes your favourite.</p>
        </div>
      )}

      <ul className="cards">
        {sorted.map(c => {
          const pattern = hourlyPattern(visits.data ?? [], c.name)
          const hasData = pattern.some(v => v > 0)
          const level = pattern[hour] ?? 0
          const label = !hasData ? 'No visits logged here yet'
            : level > 0.66 ? 'This is usually your busiest hour here'
            : level > 0.33 ? 'You often train here around now'
            : 'You rarely train here at this hour'
          const dist = here ? distanceMeters(here.lat, here.lng, c.lat, c.lng) : null
          return (
            <li key={c.id} className="card">
              <div className="card-head">
                <div>
                  <h2>{c.name}</h2>
                  {dist !== null && (
                    <span className="muted small">{dist < 1000 ? `${Math.round(dist)} m` : `${(dist / 1000).toFixed(1)} km`} away</span>
                  )}
                </div>
                <div className="row-end">
                  <button className={`star ${c.is_favorite ? 'on' : ''}`}
                    aria-label={c.is_favorite ? 'Favourite' : 'Make favourite'} aria-pressed={c.is_favorite}
                    onClick={async () => { await api.setFavorite(c.id); clubs.reload() }}>
                    {c.is_favorite ? '★' : '☆'}
                  </button>
                  <button className="icon-btn" aria-label={`Remove ${c.name}`} onClick={() => remove(c)}>×</button>
                </div>
              </div>
              {hasData && <HourStrip values={pattern} nowHour={hour} />}
              <p className="muted small">{label}</p>
              <a className="link small" target="_blank" rel="noreferrer"
                href={`https://maps.apple.com/?q=${encodeURIComponent(c.name)}&ll=${c.lat},${c.lng}`}>Open in Maps</a>
            </li>
          )
        })}
      </ul>

      <p className="muted small footnote">
        The hour bars show when <i>you</i> usually visit each club. EVO doesn't publish live crowd numbers.
      </p>
    </div>
  )
}
