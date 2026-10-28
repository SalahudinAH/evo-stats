import { useState } from 'react'
import type { Api } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { fmtDate } from '../lib/stats'
import { LineChart } from '../components/Charts'

const DAY = 24 * 3600 * 1000

export function WeightScreen({ api, notify }: { api: Api; notify: (m: string) => void }) {
  const weights = useLoad(() => api.listWeights(), [api])
  const [kg, setKg] = useState('')
  const list = weights.data ?? []
  const latest = list[list.length - 1]
  const monthAgo = [...list].reverse().find(w => new Date(w.measured_at).getTime() < Date.now() - 30 * DAY)
  const delta = latest && monthAgo ? latest.kg - monthAgo.kg : null

  const value = parseFloat(kg.replace(',', '.'))
  const valid = Number.isFinite(value) && value > 20 && value < 400

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    try {
      await api.addWeight(Math.round(value * 100) / 100)
      setKg('')
      notify('Weight saved')
      weights.reload()
    } catch {
      notify('Could not save weight')
    }
  }

  return (
    <div className="screen">
      <header className="screen-head"><h1>Weight</h1></header>
      {weights.error && <p className="error">{weights.error}</p>}

      <section className="stats3">
        <div className="stat">
          <div className="stat-value">{latest ? latest.kg.toFixed(1) : '–'}</div>
          <div className="stat-label">kg now</div>
        </div>
        <div className="stat">
          <div className={`stat-value ${delta === null ? '' : delta <= 0 ? 'down-good' : 'up-neutral'}`}>
            {delta === null ? '–' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
          </div>
          <div className="stat-label">vs 30 days ago</div>
        </div>
        <div className="stat">
          <div className="stat-value">{list.length}</div>
          <div className="stat-label">entries</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Trend</h2></div>
        {list.length >= 2
          ? <LineChart points={list.map(w => ({ x: new Date(w.measured_at), y: w.kg }))} unit="kg" decimals={0} />
          : <p className="muted">Add a couple of entries, or set up the daily Health sync Shortcut in Settings.</p>}
      </section>

      <form className="inline-form" onSubmit={add}>
        <input inputMode="decimal" value={kg} onChange={e => setKg(e.target.value)} placeholder="Today's weight (kg)"
          aria-label="Weight in kg" />
        <button className="btn btn-primary" disabled={!valid}>Save</button>
      </form>

      <section className="card">
        <div className="card-head"><h2>History</h2></div>
        <ul className="rows">
          {[...list].reverse().slice(0, 30).map(w => (
            <li key={w.id} className="row">
              <span>{w.kg.toFixed(1)} kg</span>
              <div className="row-end">
                {w.source === 'health' && <span className="tag">Health</span>}
                <span className="muted small">{fmtDate(w.measured_at)}</span>
                <button className="icon-btn" aria-label="Delete entry"
                  onClick={async () => { await api.deleteWeight(w.id); weights.reload() }}>×</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
