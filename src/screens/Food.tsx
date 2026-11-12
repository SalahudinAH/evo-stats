import { useMemo, useState } from 'react'
import type { Nav } from '../App'
import { MEALS, type Api, type Food, type FoodEntry, type Goals, type Meal } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { IconPlus, IconSearch, Sheet } from '../components/ui'

const DAY = 24 * 3600 * 1000
const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' }

export function dayRange(offset: number) {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() + offset)
  const to = new Date(from)
  to.setDate(to.getDate() + 1)
  return { from, to }
}

export function sumMacros(list: { kcal: number; protein: number; carbs: number; fat: number }[]) {
  return list.reduce((m, e) => ({ kcal: m.kcal + e.kcal, protein: m.protein + e.protein, carbs: m.carbs + e.carbs, fat: m.fat + e.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 })
}

function mealNow(): Meal {
  const h = new Date().getHours()
  return h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h >= 17 && h < 21 ? 'dinner' : 'snack'
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function FoodScreen({ nav }: { nav: Nav }) {
  const [offset, setOffset] = useState(0)
  const { from, to } = dayRange(offset)
  const entries = useLoad(() => nav.api.listFoodEntries(from.toISOString(), to.toISOString()), [nav.api, offset])
  const recent = useLoad(() => nav.api.listFoodEntries(new Date(Date.now() - 30 * DAY).toISOString(), new Date(Date.now() + DAY).toISOString()), [nav.api])
  const foods = useLoad(() => nav.api.listFoods(), [nav.api])
  const goals = useLoad(() => nav.api.getGoals(), [nav.api])
  const [adding, setAdding] = useState<Meal | null>(null)
  const [editGoals, setEditGoals] = useState(false)

  const list = entries.data ?? []
  const total = sumMacros(list)
  const g = goals.data
  const left = g ? g.kcal - total.kcal : 0

  // Your most-logged foods in the last 30 days, for one-tap adding.
  const usual = useMemo(() => {
    const count = new Map<string, number>()
    for (const e of recent.data ?? []) if (e.food_id) count.set(e.food_id, (count.get(e.food_id) ?? 0) + 1)
    return (foods.data ?? []).filter(f => count.has(f.id)).sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0)).slice(0, 6)
  }, [recent.data, foods.data])

  const reload = () => { entries.reload(); recent.reload(); foods.reload() }

  async function quickAdd(f: Food) {
    await nav.api.addFoodEntry(entryFrom(f, 1, mealNow(), offset))
    nav.notify(`${f.name} added to ${MEAL_LABEL[mealNow()].toLowerCase()}`)
    reload()
  }

  const dayLabel = offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : from.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Food</h1>
        <div className="date-switch">
          <button aria-label="Previous day" onClick={() => setOffset(o => o - 1)}>‹</button>
          <span>{dayLabel}</span>
          <button aria-label="Next day" onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}>›</button>
        </div>
      </header>

      {(entries.error || goals.error) && <p className="error">{entries.error ?? goals.error}</p>}

      <button className="search card-btn" onClick={() => setAdding(mealNow())} style={{ color: 'var(--muted)' }}>
        <IconSearch /> <span>Search or add food</span>
      </button>

      <section className="card" aria-label="Calories">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div className="big-left" style={{ color: left < 0 ? 'var(--warn)' : undefined }}>{g ? Math.abs(left).toLocaleString('en-GB') : '–'}</div>
            <div className="small muted" style={{ marginTop: 4 }}>{left < 0 ? 'kcal over goal' : 'kcal left'}</div>
          </div>
          <div className="small muted" style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>Goal <b style={{ color: 'var(--text)' }}>{g?.kcal.toLocaleString('en-GB') ?? '–'}</b></span>
            <span>Eaten <b style={{ color: 'var(--text)' }}>{Math.round(total.kcal).toLocaleString('en-GB')}</b></span>
          </div>
        </div>
        <div className={`kbar ${left < 0 ? 'over' : ''}`}><div style={{ width: `${g ? Math.min(100, (total.kcal / g.kcal) * 100) : 0}%` }} /></div>
        <div className="macro-tiles">
          {([['Protein', total.protein, g?.protein, 'var(--protein)'], ['Carbs', total.carbs, g?.carbs, 'var(--carbs)'], ['Fat', total.fat, g?.fat, 'var(--fat)']] as const).map(([name, v, goal, color]) => (
            <div key={name} className="macro-tile">
              <span className="tiny" style={{ color, fontWeight: 650 }}>{name}</span>
              <span style={{ fontWeight: 700 }}>{Math.round(v)}<span className="tiny muted" style={{ fontWeight: 500 }}> / {goal ?? '–'} g</span></span>
              <div className="mbar"><div style={{ width: `${goal ? Math.min(100, (v / goal) * 100) : 0}%`, background: color }} /></div>
            </div>
          ))}
        </div>
      </section>

      {usual.length > 0 && offset === 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-label="Quick add">
          <span className="small muted" style={{ fontWeight: 600 }}>Quick add · your usuals</span>
          <div className="quick">
            {usual.map(f => <button key={f.id} onClick={() => quickAdd(f)}>+ {f.name} <span className="muted">{f.kcal}</span></button>)}
          </div>
        </section>
      )}

      {MEALS.map(meal => {
        const items = list.filter(e => e.meal === meal)
        const kcal = sumMacros(items).kcal
        return (
          <section key={meal} className="card" style={{ gap: 4 }}>
            <div className="card-head" style={{ alignItems: 'center' }}>
              <div style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <h2>{MEAL_LABEL[meal]}</h2>
                {kcal > 0 && <span className="small muted">{Math.round(kcal)} kcal</span>}
              </div>
              <button className="icon-btn btn-soft" style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
                aria-label={`Add food to ${MEAL_LABEL[meal]}`} onClick={() => setAdding(meal)}><IconPlus /></button>
            </div>
            {!items.length && <p className="small muted">Nothing logged</p>}
            {items.map(e => (
              <div key={e.id} className="food-row">
                <div className="grow">
                  <span style={{ fontWeight: 550 }}>{e.name}</span>
                  <span className="tiny muted">{e.serving ? `${e.serving} · ` : ''}P {round1(e.protein)} · C {round1(e.carbs)} · F {round1(e.fat)}</span>
                </div>
                <div className="row-end">
                  <span style={{ fontWeight: 650 }}>{Math.round(e.kcal)}</span>
                  <button className="icon-btn" aria-label={`Delete ${e.name}`} onClick={async () => { await nav.api.deleteFoodEntry(e.id); reload() }}>×</button>
                </div>
              </div>
            ))}
          </section>
        )
      })}

      <button className="btn" onClick={() => setEditGoals(true)}>Calorie & macro goals</button>

      {adding && foods.data && (
        <AddFood api={nav.api} foods={foods.data} meal={adding} offset={offset} onClose={() => setAdding(null)}
          onAdded={name => { setAdding(null); nav.notify(`${name} added`); reload() }} />
      )}
      {editGoals && g && (
        <GoalsSheet api={nav.api} goals={g} onClose={() => setEditGoals(false)} onSaved={() => { setEditGoals(false); goals.reload(); nav.notify('Goals saved') }} />
      )}
    </div>
  )
}

function entryFrom(f: Pick<Food, 'name' | 'serving' | 'kcal' | 'protein' | 'carbs' | 'fat'> & { id?: string }, servings: number, meal: Meal, offset: number) {
  // Logging for an earlier day puts the entry at noon that day.
  const eaten_at = offset === 0 ? undefined : (() => { const d = dayRange(offset).from; d.setHours(12); return d.toISOString() })()
  return {
    food_id: f.id ?? null,
    name: f.name,
    serving: servings === 1 ? f.serving : `${round1(servings)} × ${f.serving}`,
    kcal: Math.round(f.kcal * servings),
    protein: round1(f.protein * servings),
    carbs: round1(f.carbs * servings),
    fat: round1(f.fat * servings),
    meal,
    eaten_at,
  } satisfies Omit<FoodEntry, 'id' | 'eaten_at'> & { eaten_at?: string }
}

function AddFood({ api, foods, meal: initialMeal, offset, onClose, onAdded }: {
  api: Api; foods: Food[]; meal: Meal; offset: number; onClose: () => void; onAdded: (name: string) => void
}) {
  const [q, setQ] = useState('')
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const [picked, setPicked] = useState<Food | null>(null)
  const [servings, setServings] = useState('1')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ serving: '1 serving', kcal: '', protein: '', carbs: '', fat: '' })
  const [save, setSave] = useState(true)
  const [busy, setBusy] = useState(false)
  const query = q.trim().toLowerCase()
  const results = foods.filter(f => !query || f.name.toLowerCase().includes(query)).slice(0, 30)
  const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }
  const sv = num(servings)

  async function addPicked() {
    if (!picked || sv <= 0) return
    setBusy(true)
    try { await api.addFoodEntry(entryFrom(picked, sv, meal, offset)); onAdded(picked.name) } finally { setBusy(false) }
  }

  async function addNew() {
    const name = q.trim()
    if (!name || !form.kcal) return
    setBusy(true)
    try {
      const base = { name, serving: form.serving.trim() || '1 serving', kcal: Math.round(num(form.kcal)), protein: num(form.protein), carbs: num(form.carbs), fat: num(form.fat) }
      const food = save ? await api.addFood(base) : base
      await api.addFoodEntry(entryFrom(food, 1, meal, offset))
      onAdded(name)
    } finally { setBusy(false) }
  }

  return (
    <Sheet title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} onClose={onClose}>
      <div className="seg seg-sm" role="group" aria-label="Meal">
        {MEALS.map(m => <button key={m} aria-pressed={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</button>)}
      </div>

      {picked ? (
        <div className="card">
          <h3>{picked.name}</h3>
          <p className="small muted">{picked.serving}: {picked.kcal} kcal · P {picked.protein} · C {picked.carbs} · F {picked.fat}</p>
          <label>Servings
            <input inputMode="decimal" value={servings} onChange={e => setServings(e.target.value)} onFocus={e => e.target.select()} />
          </label>
          <p className="small">{Math.round(picked.kcal * sv)} kcal · {round1(picked.protein * sv)} g protein</p>
          <div className="grid2">
            <button className="btn" onClick={() => setPicked(null)}>Back</button>
            <button className="btn btn-primary" onClick={addPicked} disabled={busy || sv <= 0}>Add</button>
          </div>
        </div>
      ) : (
        <>
          <div className="search">
            <IconSearch />
            <input autoFocus value={q} onChange={e => { setQ(e.target.value); setCreating(false) }} placeholder="Search your foods or type a new one" aria-label="Food name" />
          </div>
          {query && !foods.some(f => f.name.toLowerCase() === query) && !creating && (
            <button className="btn btn-soft" onClick={() => setCreating(true)}>+ Create “{q.trim()}”</button>
          )}
          {creating && (
            <div className="card">
              <h3>New food: {q.trim()}</h3>
              <label>Serving<input value={form.serving} onChange={e => setForm({ ...form, serving: e.target.value })} placeholder="e.g. 200 g" /></label>
              <div className="form-grid4">
                {(['kcal', 'protein', 'carbs', 'fat'] as const).map(k => (
                  <label key={k}>{k === 'kcal' ? 'kcal' : `${k[0].toUpperCase()}${k.slice(1)} g`}
                    <input inputMode="decimal" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10, color: 'var(--text)' }}>
                <input type="checkbox" checked={save} onChange={e => setSave(e.target.checked)} style={{ width: 22, minHeight: 22, height: 22 }} />
                Save to my foods for next time
              </label>
              <p className="tiny muted">Tip: the nutrition label or matvaretabellen.no has the numbers.</p>
              <button className="btn btn-primary" onClick={addNew} disabled={busy || !form.kcal}>Add</button>
            </div>
          )}
          <div className="results">
            {results.map(f => (
              <button key={f.id} className="result" onClick={() => { setPicked(f); setServings('1') }}>
                <span><span style={{ fontWeight: 600 }}>{f.name}</span><span className="small muted"> · {f.serving}</span></span>
                <span className="small" style={{ fontWeight: 650 }}>{f.kcal} kcal</span>
              </button>
            ))}
            {!results.length && !query && <p className="small muted">Your foods show up here. Type a name to add your first one.</p>}
          </div>
        </>
      )}
    </Sheet>
  )
}

export function GoalsSheet({ api, goals, onClose, onSaved }: { api: Api; goals: Goals; onClose: () => void; onSaved: () => void }) {
  const [g, setG] = useState({
    kcal: String(goals.kcal), protein: String(goals.protein), carbs: String(goals.carbs), fat: String(goals.fat), workouts_per_week: String(goals.workouts_per_week),
  })
  const n = (s: string) => Math.max(0, Math.round(parseFloat(s.replace(',', '.')) || 0))
  const fromMacros = n(g.protein) * 4 + n(g.carbs) * 4 + n(g.fat) * 9
  return (
    <Sheet title="Goals" onClose={onClose}>
      <label>Calories per day<input inputMode="numeric" value={g.kcal} onChange={e => setG({ ...g, kcal: e.target.value })} /></label>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <label>Protein g<input inputMode="numeric" value={g.protein} onChange={e => setG({ ...g, protein: e.target.value })} /></label>
        <label>Carbs g<input inputMode="numeric" value={g.carbs} onChange={e => setG({ ...g, carbs: e.target.value })} /></label>
        <label>Fat g<input inputMode="numeric" value={g.fat} onChange={e => setG({ ...g, fat: e.target.value })} /></label>
      </div>
      <p className="tiny muted">Your macros add up to {fromMacros.toLocaleString('en-GB')} kcal (protein and carbs 4 kcal/g, fat 9 kcal/g).</p>
      <label>Workouts per week<input inputMode="numeric" value={g.workouts_per_week} onChange={e => setG({ ...g, workouts_per_week: e.target.value })} /></label>
      <button className="btn btn-primary" onClick={async () => {
        await api.saveGoals({ kcal: n(g.kcal) || 2000, protein: n(g.protein), carbs: n(g.carbs), fat: n(g.fat), workouts_per_week: Math.min(14, Math.max(1, n(g.workouts_per_week) || 1)) })
        onSaved()
      }}>Save</button>
    </Sheet>
  )
}
