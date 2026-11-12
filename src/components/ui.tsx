import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MUSCLES, type Api, type Exercise, type Muscle } from '../lib/types'
import { guessMuscle, MUSCLE_LABEL, type Badge as BadgeT } from '../lib/training'

const svg = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const IconCheck = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={3} {...svg}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
)
export const IconPlus = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.2} {...svg}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconPlay = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" /></svg>
)
export const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth={2.2} {...svg}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const IconDown = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth={2} {...svg}><path d="m6 9 6 6 6-6" /></svg>
)
export const IconDots = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" />
  </svg>
)
export const IconTrophy = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" strokeWidth={2} {...svg}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
)
export const IconSearch = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth={2} {...svg}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></svg>
)
export const IconPin = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" strokeWidth={2} {...svg}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" />
  </svg>
)
export const IconUp = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth={2} {...svg}><path d="m6 15 6-6 6 6" /></svg>
)

export function Badge({ b, className = '' }: { b: BadgeT; className?: string }) {
  return <span className={`badge badge-${b.kind} ${className}`}>{b.text}</span>
}

/** Bottom sheet. Closes on backdrop tap and Escape. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><IconClose /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function MuscleSelect({ value, onChange, label = 'Main muscle' }: {
  value: Muscle | null; onChange: (m: Muscle | null) => void; label?: string
}) {
  return (
    <label>
      {label}
      <select value={value ?? ''} onChange={e => onChange((e.target.value || null) as Muscle | null)}>
        <option value="">Not set</option>
        {MUSCLES.map(m => <option key={m} value={m}>{MUSCLE_LABEL[m]}</option>)}
      </select>
    </label>
  )
}

/** Search your exercises, or create a new one. */
export function ExercisePicker({ api, exercises, exclude = [], onPick, onClose, onCreated }: {
  api: Api
  exercises: Exercise[]
  exclude?: string[]
  onPick: (e: Exercise) => void
  onClose: () => void
  onCreated?: () => void
}) {
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = q.trim().toLowerCase()
  const list = useMemo(() => exercises
    .filter(e => !exclude.includes(e.id) && (!query || e.name.toLowerCase().includes(query)))
    .sort((a, b) => a.name.localeCompare(b.name)), [exercises, exclude, query])
  const exact = exercises.find(e => e.name.toLowerCase() === query)
  useEffect(() => { setMuscle(guessMuscle(q)) }, [q])

  async function create() {
    const name = q.trim()
    if (!name) return
    try {
      const e = await api.addExercise(name, muscle)
      onCreated?.()
      onPick(e)
    } catch (err) {
      setError(err instanceof Error && err.message.includes('duplicate') ? 'You already have that exercise' : 'Could not add exercise')
    }
  }

  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <div className="search">
        <IconSearch />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search or type a new name" aria-label="Exercise name" />
      </div>
      {query && !exact && (
        <div className="card">
          <h3>New: {q.trim()}</h3>
          <MuscleSelect value={muscle} onChange={setMuscle} />
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" onClick={create}>Create and add</button>
        </div>
      )}
      <div className="results">
        {list.map(e => (
          <button key={e.id} className="result" onClick={() => onPick(e)}>
            <span>
              <span style={{ fontWeight: 600 }}>{e.name}</span>
              <span className="muted small"> · {e.muscle ? MUSCLE_LABEL[e.muscle] : 'muscle not set'}</span>
            </span>
            <span className="text-accent"><IconPlus /></span>
          </button>
        ))}
        {!list.length && !query && <p className="muted small">No exercises yet. Type a name above to create one.</p>}
      </div>
    </Sheet>
  )
}

/** Tiny line, no axes. */
export function Spark({ values, width = 84, height = 28, color = 'var(--accent-text)' }: {
  values: number[]; width?: number; height?: number; color?: string
}) {
  if (values.length < 2) {
    return <svg className="spark" width={width} height={height} aria-hidden="true"><path d={`M${width - 8} ${height / 2}H${width - 2}`} stroke={color} strokeWidth={2} strokeLinecap="round" /></svg>
  }
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${i ? 'L' : 'M'}${(2 + (i / (values.length - 1)) * (width - 4)).toFixed(1)} ${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(1)}`)
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Ring({ value, max, size = 112, stroke = 12, children }: {
  value: number; max: number; size?: number; stroke?: number; children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={value > max ? 'var(--warn)' : 'var(--accent)'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${(frac * c).toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="center">{children}</div>
    </div>
  )
}

export function MacroBar({ name, value, goal, color }: { name: string; value: number; goal: number; color: string }) {
  return (
    <div className="macro">
      <div className="top"><span style={{ fontWeight: 600 }}>{name}</span><span className="muted">{Math.round(value)} / {goal} g</span></div>
      <div className="mbar"><div style={{ width: `${Math.min(100, (value / Math.max(1, goal)) * 100)}%`, background: color }} /></div>
    </div>
  )
}

export const fmtDuration = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

export const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
