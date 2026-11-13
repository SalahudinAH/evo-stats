import { useEffect, useMemo, useState } from 'react'
import { Clock, ExternalLink, LocateFixed, MapPin, Navigation, Search, Star, Trash2, Users } from 'lucide-react'
import type { Api, Club } from '../lib/types'
import { useGeolocation, useLoad } from '../lib/hooks'
import { distanceMeters, hourlyPattern } from '../lib/stats'
import { HourStrip } from '../components/Charts'
import { Row, Section, Sheet } from '../components/ui'
import { appleMapsUrl, CENTRES, centreUrl, googleMapsUrl, type Centre } from '../lib/evoCentres'

const NEAR_M = 250
const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`)
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae')

/** All EVO centres in Norway, nearest first when location is on, plus the clubs you've saved for check-ins. */
export function Clubs({ api, notify }: { api: Api; notify: (m: string) => void }) {
  const clubs = useLoad(() => api.listClubs(), [api])
  const visits = useLoad(() => api.listVisits(), [api])
  const { geo, locate } = useGeolocation()
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState<Centre | null>(null)

  // Sort by distance when location is on. iOS only asks the first time.
  useEffect(() => { locate() }, [locate])
  const here = geo.status === 'ok' ? geo : null

  const savedFor = (c: Centre) => (clubs.data ?? []).find(s => distanceMeters(s.lat, s.lng, c.lat, c.lng) < NEAR_M) ?? null
  const dist = (lat: number, lng: number) => (here ? distanceMeters(here.lat, here.lng, lat, lng) : null)

  const list = useMemo(() => {
    const f = fold(q.trim())
    const rows = CENTRES.filter(c => !f || fold(`${c.name} ${c.address}`).includes(f))
      .map(c => ({ c, d: here ? distanceMeters(here.lat, here.lng, c.lat, c.lng) : null }))
    rows.sort((a, b) => (a.d !== null && b.d !== null ? a.d - b.d : a.c.name.localeCompare(b.c.name, 'nb')))
    return rows
  }, [q, here])
  const limited = here && !q && !showAll ? list.slice(0, 15) : list

  // Saved clubs that aren't one of the centres (e.g. saved with "Add here" somewhere else).
  const saved = clubs.data ?? []
  const savedRows = saved.map(s => ({ s, centre: CENTRES.find(c => distanceMeters(s.lat, s.lng, c.lat, c.lng) < NEAR_M) ?? null }))

  async function save(c: Centre) {
    await api.addClub(`EVO ${c.name}`, c.lat, c.lng, saved.length === 0)
    notify(`EVO ${c.name} saved`)
    clubs.reload()
  }
  async function remove(s: Club) {
    if (!confirm(`Remove ${s.name} from your clubs?`)) return
    await api.deleteClub(s.id)
    clubs.reload()
  }

  const hour = new Date().getHours()

  return (
    <div className="screen">
      <div className="large-title">
        <h1>Centres</h1>
        <p>{here ? 'Nearest first' : `${CENTRES.length} EVO centres in Norway`}</p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <label className="searchbar" style={{ flex: 1 }}>
          <Search size={18} strokeWidth={2.2} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search centre or town" aria-label="Search centres" />
        </label>
        <button className="square-btn" aria-label="Sort by distance from me" onClick={locate}><LocateFixed size={20} strokeWidth={2} /></button>
      </div>
      {geo.status === 'locating' && <p className="small muted">Finding your location…</p>}
      {geo.status === 'error' && <p className="small muted">{geo.message} Showing all centres A–Z.</p>}

      {savedRows.length > 0 && !q && (
        <Section title="Your clubs">
          {savedRows.map(({ s, centre }) => {
            const d = dist(s.lat, s.lng)
            return (
              <Row key={s.id} icon={<Star size={18} strokeWidth={2} fill={s.is_favorite ? 'currentColor' : 'none'} />}
                title={s.name} sub={[d !== null ? fmtDist(d) : null, s.is_favorite ? 'Favourite' : null].filter(Boolean).join(' · ') || 'Saved'}
                chevron onClick={centre ? () => setOpen(centre) : () => remove(s)} />
            )
          })}
        </Section>
      )}

      <Section title={q ? `${list.length} found` : here ? 'Nearest' : 'All centres'}>
        {limited.map(({ c, d }) => (
          <Row key={c.slug} icon={<MapPin size={18} strokeWidth={2} />} title={c.name} sub={c.address}
            trail={d !== null ? fmtDist(d) : undefined} chevron onClick={() => setOpen(c)} />
        ))}
        {!list.length && <div className="group-block muted small">No EVO centre matches “{q.trim()}”.</div>}
        {limited.length < list.length && (
          <button type="button" className="group-row accent" onClick={() => setShowAll(true)}>Show all {list.length} centres</button>
        )}
      </Section>
      <p className="tiny muted" style={{ padding: '0 16px' }}>Centre list from evofitness.no.</p>

      {open && (() => {
        const s = savedFor(open)
        const d = dist(open.lat, open.lng)
        const pattern = s ? hourlyPattern(visits.data ?? [], s.name) : []
        const hasData = pattern.some(v => v > 0)
        return (
          <Sheet title={`EVO ${open.name}`} onClose={() => setOpen(null)}>
            <p className="small muted" style={{ marginTop: -6 }}>{open.address}{d !== null ? ` · ${fmtDist(d)} away` : ''}</p>

            <a className="btn btn-primary btn-big" href={googleMapsUrl(open)} target="_blank" rel="noreferrer">
              <Users size={18} strokeWidth={2.2} />How busy is it? Open Google Maps
            </a>
            <p className="tiny muted" style={{ marginTop: -4 }}>Google shows live busyness and popular times on the centre's page when you're signed in to Google Maps.</p>

            {hasData && (
              <div className="card" style={{ gap: 8 }}>
                <span className="small" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><Clock size={15} strokeWidth={2.2} />When you usually train here</span>
                <HourStrip values={pattern} nowHour={hour} />
              </div>
            )}

            <div className="grid2">
              <a className="btn" href={appleMapsUrl(open)} target="_blank" rel="noreferrer"><Navigation size={17} strokeWidth={2.2} />Directions</a>
              <a className="btn" href={centreUrl(open)} target="_blank" rel="noreferrer"><ExternalLink size={17} strokeWidth={2.2} />EVO page</a>
            </div>

            {!s && <button className="btn" onClick={async () => { await save(open); setOpen(null) }}><Star size={17} strokeWidth={2.2} />Save as my club</button>}
            {s && !s.is_favorite && (
              <button className="btn" onClick={async () => { await api.setFavorite(s.id); clubs.reload(); notify(`${s.name} is your favourite`) }}>
                <Star size={17} strokeWidth={2.2} />Make favourite
              </button>
            )}
            {s && <button className="btn btn-danger-quiet" onClick={async () => { await remove(s); setOpen(null) }}><Trash2 size={17} strokeWidth={2.2} />Remove from my clubs</button>}
            <p className="tiny muted">Saved clubs are used for automatic check-ins.</p>
          </Sheet>
        )
      })()}
    </div>
  )
}
