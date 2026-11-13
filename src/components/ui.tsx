import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronRight, Dumbbell, Plus } from 'lucide-react'
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

export interface LibraryExercise { name: string; muscle: Muscle; equipment: string; image: string }

let libraryCache: Promise<LibraryExercise[]> | null = null
/** The bundled exercise library (free-exercise-db, public domain). Loaded the first time the picker opens. */
export function loadLibrary(): Promise<LibraryExercise[]> {
  if (!libraryCache) {
    libraryCache = fetch(`${import.meta.env.BASE_URL}exercise-library.json`)
      .then(r => { if (!r.ok) throw new Error('library'); return r.json() })
      .then((d: { exercises: [string, Muscle, string, string][] }) =>
        d.exercises.map(([name, muscle, equipment, image]) => ({ name, muscle, equipment, image })))
      .catch(err => { libraryCache = null; throw err })
  }
  return libraryCache
}

const FILTERS: [string, Muscle[] | null][] = [
  ['All', null], ['Chest', ['chest']], ['Back', ['back']], ['Shoulders', ['shoulders']],
  ['Legs', ['quads', 'hamstrings', 'glutes', 'calves']], ['Arms', ['biceps', 'triceps']], ['Core', ['core']],
]
const EQUIP_ORDER = ['barbell', 'dumbbell', 'cable', 'machine', 'body only', 'e-z curl bar', 'kettlebells']
/** Gym staples shown first, so "bench" finds the normal bench press before the variations. */
const POPULAR = [
  'Barbell Bench Press - Medium Grip', 'Barbell Squat', 'Barbell Deadlift', 'Romanian Deadlift', 'Dumbbell Bench Press',
  'Barbell Incline Bench Press - Medium Grip', 'Incline Dumbbell Press', 'Standing Military Press', 'Dumbbell Shoulder Press',
  'Seated Dumbbell Press', 'Arnold Dumbbell Press', 'Pullups', 'Chin-Up', 'Wide-Grip Lat Pulldown', 'Seated Cable Rows',
  'Bent Over Barbell Row', 'One-Arm Dumbbell Row', 'T-Bar Row with Handle', 'Straight-Arm Pulldown', 'Leg Press', 'Hack Squat',
  'Goblet Squat', 'Front Squat (Clean Grip)', 'Smith Machine Squat', 'Lying Leg Curls', 'Leg Extensions', 'Barbell Hip Thrust',
  'Dumbbell Lunges', 'Split Squat with Dumbbells', 'Glute Ham Raise', 'Good Morning', 'Standing Calf Raises', 'Seated Calf Raise',
  'Side Lateral Raise', 'Cable Seated Lateral Raise', 'Face Pull', 'Reverse Flyes', 'Barbell Shrug', 'Triceps Pushdown',
  'Dips - Triceps Version', 'EZ-Bar Skullcrusher', 'Lying Triceps Press', 'Close-Grip Barbell Bench Press', 'Barbell Curl',
  'Dumbbell Bicep Curl', 'Hammer Curls', 'Preacher Curl', 'Cable Crossover', 'Dumbbell Flyes', 'Butterfly', 'Machine Bench Press',
  'Leverage Chest Press', 'Decline Barbell Bench Press', 'Pushups', 'Plank', 'Cable Crunch', 'Hanging Leg Raise', 'Crunches',
  'Russian Twist', 'Ab Roller',
]
const POPULAR_RANK = new Map(POPULAR.map((n, i) => [n, i]))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * Pick exercises: yours first, then the library with photos. With onPickMany
 * you can tick several; with onPick a tap picks one. Library picks are added to
 * your exercises (name, muscle and photo filled in).
 */
export function ExercisePicker({ api, exercises, exclude = [], onPick, onPickMany, onClose, onCreated }: {
  api: Api
  exercises: Exercise[]
  exclude?: string[]
  onPick?: (e: Exercise) => void
  onPickMany?: (list: Exercise[]) => void
  onClose: () => void
  onCreated?: () => void
}) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('All')
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const [library, setLibrary] = useState<LibraryExercise[] | null>(null)
  const [libError, setLibError] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const multi = !!onPickMany

  useEffect(() => { loadLibrary().then(setLibrary, () => setLibError(true)) }, [])
  useEffect(() => { setMuscle(guessMuscle(q)) }, [q])

  const query = q.trim().toLowerCase()
  const words = query.split(/\s+/).filter(Boolean)
  const match = (name: string) => words.every(w => name.toLowerCase().includes(w))
  const muscles = FILTERS.find(f => f[0] === filter)?.[1] ?? null
  const inFilter = (m: Muscle | null) => !muscles || (m !== null && muscles.includes(m))
  const ownNames = useMemo(() => new Set(exercises.map(e => e.name.toLowerCase())), [exercises])

  const mine = exercises
    .filter(e => !exclude.includes(e.id) && match(e.name) && inFilter(e.muscle))
    .sort((a, b) => a.name.localeCompare(b.name))
  const lib = useMemo(() => {
    if (!library) return []
    const list = library.filter(x => !ownNames.has(x.name.toLowerCase()) && match(x.name) && inFilter(x.muscle))
    const pop = (x: LibraryExercise) => POPULAR_RANK.get(x.name) ?? 999
    const phrase = (x: LibraryExercise) => (query && x.name.toLowerCase().includes(query) ? 0 : 1)
    const equip = (x: LibraryExercise) => { const i = EQUIP_ORDER.indexOf(x.equipment); return i < 0 ? 99 : i }
    return list
      .sort((a, b) => pop(a) - pop(b) || phrase(a) - phrase(b) || equip(a) - equip(b) || a.name.length - b.name.length)
      .slice(0, 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, ownNames, query, filter])
  const exact = exercises.some(e => e.name.toLowerCase() === query) || library?.some(x => x.name.toLowerCase() === query)

  async function resolve(key: string): Promise<Exercise> {
    if (key.startsWith('own:')) return exercises.find(e => e.id === key.slice(4))!
    const x = library!.find(l => l.image === key.slice(4))!
    return api.addExercise(x.name, x.muscle, x.image)
  }

  async function choose(keys: string[]) {
    setBusy(true)
    setError(null)
    try {
      const list: Exercise[] = []
      for (const k of keys) list.push(await resolve(k))
      if (keys.some(k => k.startsWith('lib:'))) onCreated?.()
      if (multi) onPickMany!(list)
      else onPick?.(list[0])
    } catch {
      setError('Could not add that exercise. Try again.')
      setBusy(false)
    }
  }

  const tap = (key: string) => {
    if (!multi) { void choose([key]); return }
    setSelected(sel => sel.includes(key) ? sel.filter(k => k !== key) : [...sel, key])
  }

  async function create() {
    const name = q.trim()
    if (!name) return
    setBusy(true)
    try {
      const e = await api.addExercise(name, muscle)
      onCreated?.()
      if (multi) {
        const others: Exercise[] = []
        for (const k of selected) others.push(await resolve(k))
        onPickMany!([...others, e])
      } else onPick?.(e)
    } catch (err) {
      setError(err instanceof Error && err.message.includes('duplicate') ? 'You already have that exercise' : 'Could not add exercise')
      setBusy(false)
    }
  }

  const mark = (on: boolean) => multi
    ? <span className={`pick ${on ? 'on' : ''}`} aria-hidden="true"><Check size={15} strokeWidth={3} /></span>
    : <span className="pick" aria-hidden="true"><Plus size={16} strokeWidth={2.4} /></span>

  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <label className="searchbar">
        <IconSearch />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search 750+ exercises" aria-label="Search exercises" />
      </label>
      <div className="chips scroll" role="group" aria-label="Filter by muscle">
        {FILTERS.map(([label]) => (
          <button key={label} type="button" className="chip-btn" aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>
        ))}
      </div>

      {mine.length > 0 && (
        <Section title="Your exercises" className="thumbs">
          {mine.map(e => {
            const on = selected.includes(`own:${e.id}`)
            return (
              <button key={e.id} type="button" className="group-row" aria-pressed={multi ? on : undefined} onClick={() => tap(`own:${e.id}`)} disabled={busy}>
                <ExerciseThumb image={e.image} />
                <span className="row-text"><span className="row-title">{e.name}</span><span className="row-sub">{e.muscle ? MUSCLE_LABEL[e.muscle] : 'Muscle not set'}</span></span>
                {mark(on)}
              </button>
            )
          })}
        </Section>
      )}

      <Section title="Exercise library" className="thumbs">
        {!library && !libError && <div className="group-block muted small">Loading…</div>}
        {libError && <div className="group-block muted small">The library couldn't load. Check your connection; you can still create your own below.</div>}
        {library && !lib.length && <div className="group-block muted small">No matches in the library.</div>}
        {lib.map(x => {
          const key = `lib:${x.image}`
          const on = selected.includes(key)
          return (
            <button key={key} type="button" className="group-row" aria-pressed={multi ? on : undefined} onClick={() => tap(key)} disabled={busy}>
              <ExerciseThumb image={x.image} />
              <span className="row-text"><span className="row-title">{x.name}</span><span className="row-sub">{MUSCLE_LABEL[x.muscle]}{x.equipment ? ` · ${cap(x.equipment)}` : ''}</span></span>
              {mark(on)}
            </button>
          )
        })}
      </Section>

      {query && !exact && (
        <div className="card">
          <h3>Create “{q.trim()}” as your own</h3>
          <MuscleSelect value={muscle} onChange={setMuscle} />
          <button className="btn" onClick={create} disabled={busy}>Create and add</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="tiny muted">Library photos and names: free-exercise-db (public domain).</p>
      {multi && selected.length > 0 && (
        <div className="bottom-bar" style={{ gridTemplateColumns: '1fr', bottom: 'calc(-18px - env(safe-area-inset-bottom))', paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)' }}>
          <button className="btn btn-primary btn-big" onClick={() => choose(selected)} disabled={busy}>
            {busy ? 'Adding…' : `Add ${selected.length} exercise${selected.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
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

// ---- v2 building blocks (iOS-style grouped lists) ----

/** Large iOS title with optional trailing nav buttons above it. */
export function LargeTitle({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <>
      <div className="nav-bar">{actions}</div>
      <div className="large-title">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
    </>
  )
}

/** Uppercase section header with an optional action on the right. */
export function Section({ title, action, children, className = '' }: {
  title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <>
      {title && <div className="section-title"><h2>{title}</h2>{action}</div>}
      <section className={`group ${className}`}>{children}</section>
    </>
  )
}

type RowProps = {
  icon?: ReactNode
  iconTone?: 'accent' | 'warn' | 'up'
  thumb?: ReactNode
  title: ReactNode
  sub?: ReactNode
  trail?: ReactNode
  chevron?: boolean
  onClick?: () => void
  ariaLabel?: string
}

/** One row in a group: icon or photo, title, subtitle, trailing value, chevron. */
export function Row({ icon, iconTone = 'accent', thumb, title, sub, trail, chevron, onClick, ariaLabel }: RowProps) {
  const body = (
    <>
      {icon && <span className={`row-icon ${iconTone === 'accent' ? '' : iconTone}`}>{icon}</span>}
      {thumb}
      <span className="row-text">
        <span className="row-title">{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {trail !== undefined && <span className="row-trail">{trail}</span>}
      {chevron && <ChevronRight className="row-chev" size={18} strokeWidth={2.4} aria-hidden="true" />}
    </>
  )
  return onClick
    ? <button type="button" className="group-row" onClick={onClick} aria-label={ariaLabel}>{body}</button>
    : <div className="group-row">{body}</div>
}

/** Exercise photos come from free-exercise-db (public domain), pinned to one commit. */
const LIBRARY_IMG = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/'
export const exerciseImageUrl = (path: string) => LIBRARY_IMG + path.split('/').map(encodeURIComponent).join('/')

export function ExerciseThumb({ image, size = 44, className = 'row-thumb' }: { image: string | null | undefined; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  if (!size && (!image || failed)) return null
  if (!image || failed) {
    return <span className={className} style={{ width: size, height: size }} aria-hidden="true"><Dumbbell size={Math.round(size / 2)} strokeWidth={1.8} /></span>
  }
  const style = size ? { width: size, height: size } : undefined
  if (!size && failed) return null
  return <img className={className} style={style} src={exerciseImageUrl(image)} alt="" loading="lazy" onError={() => setFailed(true)} />
}
