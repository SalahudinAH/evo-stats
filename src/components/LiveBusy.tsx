import { useEffect, useState } from 'react'
import { BusynessNotSetUp, type Api, type Busyness } from '../lib/types'

export type BusyLevel = { word: string; color: string }

export function busyLevel(percent: number): BusyLevel {
  if (percent < 35) return { word: 'Quiet', color: 'var(--up)' }
  if (percent < 60) return { word: 'Moderate', color: '#e5c07b' }
  if (percent < 85) return { word: 'Busy', color: 'var(--warn)' }
  return { word: 'Very busy', color: '#ff5c5c' }
}

type State = { status: 'loading' } | { status: 'ok'; data: Busyness } | { status: 'setup' } | { status: 'error'; message: string }

/** Live numbers from EVO Visits, refreshed every 2 minutes while shown. */
export function useBusyness(api: Api, visitsId: string | null | undefined): State {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    if (!visitsId) return
    let live = true
    const load = () => api.centreBusyness(visitsId).then(
      data => live && setState({ status: 'ok', data }),
      e => live && setState(e instanceof BusynessNotSetUp ? { status: 'setup' } : { status: 'error', message: e instanceof Error ? e.message : 'No live numbers right now.' }),
    )
    setState({ status: 'loading' })
    load()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') load() }, 120_000)
    return () => { live = false; window.clearInterval(t) }
  }, [api, visitsId])
  return visitsId ? state : { status: 'error', message: 'No live numbers for this centre.' }
}

/** A short line for list rows: "6 training now · Quiet". */
export function busyLine(s: State): string | null {
  if (s.status === 'ok') return `${s.data.current} training now · ${busyLevel(s.data.percent).word}`
  if (s.status === 'loading') return 'Checking how busy it is…'
  return null
}

/** Small coloured percentage pill. */
export function BusyPill({ state }: { state: State }) {
  if (state.status !== 'ok') return null
  const l = busyLevel(state.data.percent)
  return <span className="busy-pill" style={{ color: l.color }}><i style={{ background: l.color }} />{Math.round(state.data.percent)}%</span>
}

/** Today's blocks from EVO: how busy each part of the day was, is and is expected to be. */
export function BusyDay({ data }: { data: Busyness }) {
  if (!data.intervals.length) return null
  return (
    <div className="busy-day" role="img" aria-label="How busy the centre is through the day">
      {data.intervals.map(i => {
        // EVO's own page shows 50% for a future block with no data yet; do the same.
        const p = i.status === 'future' && !i.percent ? 50 : i.percent
        return (
          <div key={i.label} className={`busy-col ${i.status}`}>
            <div className="busy-bar"><span style={{ height: `${Math.max(4, Math.min(100, p))}%`, background: i.status === 'current' ? busyLevel(p).color : undefined }} /></div>
            <span className="busy-lbl">{i.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** The full block for a centre: number now, how full, and the day. */
export function LiveBusy({ state }: { state: State }) {
  if (state.status === 'loading') return <div className="card busy-card"><span className="small muted">Checking how busy it is…</span></div>
  if (state.status === 'setup') return (
    <div className="card busy-card">
      <span className="small" style={{ fontWeight: 600 }}>Live busyness isn't switched on yet</span>
      <span className="tiny muted">It needs a one-time setup in Supabase. See More › Settings & Shortcuts › 6. Live busyness.</span>
    </div>
  )
  if (state.status === 'error') return <div className="card busy-card"><span className="small muted">{state.message}</span></div>
  const { data } = state
  const l = busyLevel(data.percent)
  return (
    <div className="card busy-card">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{data.current}</span>
          <span className="small muted">training now</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: l.color, fontWeight: 650 }}>{l.word}</span>
          <div className="tiny muted">{Math.round(data.percent)}% of {data.capacity}</div>
        </div>
      </div>
      <div className="kbar" style={{ height: 6 }}><div style={{ width: `${Math.min(100, data.percent)}%`, background: l.color }} /></div>
      <BusyDay data={data} />
      <span className="tiny muted">Live from EVO Visits · updated {new Date(data.fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
  )
}
