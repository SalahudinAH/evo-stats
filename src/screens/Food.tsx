import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, ChevronDown, ChevronLeft, ChevronRight, Footprints, X, GripVertical, Minus, Pencil, Plus, RefreshCw, ScanBarcode, Search, Trash2 } from 'lucide-react'
import type { Nav } from '../App'
import { MEALS, NUTRIENT_KEYS, PhotoNotSetUp, type Api, type NutrientKey, type Nutrients, type Food, type FoodEntry, type Goals, type Meal, type PhotoItem } from '../lib/types'
import { shrinkPhoto } from '../lib/photo'
import { useLoad } from '../lib/hooks'
import { kcalFromMacros, planLabel, scaleMacros } from '../lib/nutrition'
import { IconSearch, LargeTitle, Row, Section, Sheet, SwipeRow } from '../components/ui'
import { BarcodeScanner } from '../components/Scanner'
import { lookupBarcode, searchProducts, TooManySearches, type ScannedProduct } from '../lib/openFoodFacts'
import { syncSteps, useBudget } from '../lib/burn'

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
const round2 = (n: number) => Math.round(n * 100) / 100

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
  const budget = useBudget(nav.api, goals.data, from, to)
  const g = budget.goal
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

  const [scanning, setScanning] = useState(false)
  const [photo, setPhoto] = useState<{ base64: string; dataUrl: string; meal: Meal } | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const photoMeal = useRef<Meal>('breakfast')
  /** Opens the camera / photo library. Must run straight from a tap. */
  const takePhoto = (meal: Meal) => { photoMeal.current = meal; photoInput.current?.click() }
  async function onPhotoPicked(file: File | undefined) {
    if (!file) return
    try { setPhoto({ ...(await shrinkPhoto(file)), meal: photoMeal.current }) }
    catch (e) { nav.notify(e instanceof Error ? e.message : 'Could not open that photo') }
  }
  const [scanned, setScanned] = useState<{ code: string; product?: ScannedProduct; meal?: Meal } | null>(null)
  const [entryMenu, setEntryMenu] = useState<FoodEntry | null>(null)
  // Press and hold a food, then drag it to another meal (works with touch and mouse).
  const [drag, setDrag] = useState<{ id: string; name: string; from: Meal; over: Meal | null; x: number; y: number } | null>(null)
  const [moved, setMoved] = useState<Record<string, Meal>>({})
  const dragging = useRef(false)
  const suppressClick = useRef(false)
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const shown = list.filter(e => !removed.has(e.id)).map(e => (moved[e.id] ? { ...e, meal: moved[e.id] } : e))

  async function deleteEntry(e: FoodEntry) {
    setRemoved(r => new Set(r).add(e.id))
    try {
      await nav.api.deleteFoodEntry(e.id)
      reload()
      nav.notify(`${e.name} deleted`, {
        label: 'Undo',
        run: async () => {
          const { id: _id, ...rest } = e
          try { await nav.api.addFoodEntry(rest); reload() }
          catch { nav.notify('Could not undo. Add it again from Your usuals.') }
        },
      })
    } catch {
      setRemoved(r => { const n = new Set(r); n.delete(e.id); return n })
      nav.notify('Could not delete it. Try again.')
    }
  }

  // While dragging, stop the page from scrolling under your finger (needs a non-passive listener).
  useEffect(() => {
    const stop = (ev: TouchEvent) => { if (dragging.current) ev.preventDefault() }
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [])

  async function moveEntry(e: FoodEntry, meal: Meal) {
    if (e.meal === meal) return
    setMoved(m => ({ ...m, [e.id]: meal }))
    try {
      await nav.api.moveFoodEntry(e.id, meal)
      nav.notify(`${e.name} moved to ${MEAL_LABEL[meal].toLowerCase()}`)
      reload()
    } catch {
      setMoved(m => { const n = { ...m }; delete n[e.id]; return n })
      nav.notify('Could not move it. Try again.')
    }
  }

  function startDrag(ev: React.PointerEvent, entry: FoodEntry) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return
    const startX = ev.clientX, startY = ev.clientY
    let active = false
    let over: Meal | null = entry.meal
    const scroller = document.querySelector('main')
    const timer = window.setTimeout(() => {
      active = true
      dragging.current = true
      navigator.vibrate?.(15)
      setDrag({ id: entry.id, name: entry.name, from: entry.meal, over, x: startX, y: startY })
    }, 350)
    const meal = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-meal]') as HTMLElement | null)?.dataset.meal as Meal | undefined
    const move = (e: PointerEvent) => {
      if (!active) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) end()
        return
      }
      over = meal(e.clientX, e.clientY) ?? over
      if (scroller) {
        if (e.clientY < 140) scroller.scrollBy(0, -14)
        else if (e.clientY > window.innerHeight - 170) scroller.scrollBy(0, 14)
      }
      setDrag(d => (d ? { ...d, over, x: e.clientX, y: e.clientY } : d))
    }
    const up = () => {
      if (active) {
        suppressClick.current = true
        window.setTimeout(() => { suppressClick.current = false }, 400)
        if (over && over !== entry.meal) moveEntry(entry, over)
      }
      end()
    }
    const end = () => {
      window.clearTimeout(timer)
      dragging.current = false
      setDrag(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', end)
  }
  const pct = (v: number, goal: number | undefined) => `${goal ? Math.min(100, (v / goal) * 100) : 0}%`

  return (
    <div className="screen">
      <LargeTitle title="Food" sub={offset === 0 ? `Today, ${from.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : dayLabel}
        actions={<>
          <button className="nav-btn" aria-label="Previous day" onClick={() => setOffset(o => o - 1)}><ChevronLeft size={24} strokeWidth={2.2} /></button>
          <button className="nav-btn" aria-label="Next day" onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}><ChevronRight size={24} strokeWidth={2.2} /></button>
        </>} />

      {(entries.error || goals.error) && <p className="error">{entries.error ?? goals.error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button className="searchbar" style={{ border: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => setAdding(mealNow())}>
          <Search size={18} strokeWidth={2.2} /> <span style={{ fontSize: 17 }}>Search food</span>
        </button>
        <button className="square-btn" aria-label="Estimate from a photo" onClick={() => takePhoto(mealNow())}><Camera size={20} strokeWidth={2} /></button>
        <button className="square-btn" aria-label="Scan a barcode" onClick={() => setScanning(true)}><ScanBarcode size={20} strokeWidth={2} /></button>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={e => { onPhotoPicked(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      <section className="hero-v2" aria-label="Calories" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: left < 0 ? 'var(--warn)' : undefined }}>{g ? Math.abs(left).toLocaleString('en-GB') : '–'}</span>
            <span className="muted" style={{ fontSize: 15 }}>{left < 0 ? 'kcal over' : 'kcal left'}</span>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="muted" style={{ fontSize: 15 }}>{Math.round(total.kcal).toLocaleString('en-GB')} of {g?.kcal.toLocaleString('en-GB') ?? '–'}</span>
            <button className="edit-btn" aria-label="Edit calorie and macro goals" onClick={() => setEditGoals(true)} disabled={!g}><Pencil size={15} strokeWidth={2.2} /></button>
          </span>
        </div>
        <div className={`kbar ${left < 0 ? 'over' : ''}`} style={{ height: 8 }}><div style={{ width: pct(total.kcal, g?.kcal) }} /></div>
        <div className="macro3">
          <div><span className="k">Protein</span><span className="v">{Math.round(total.protein)}<span> / {g?.protein ?? '–'} g</span></span><span className="b"><span style={{ width: pct(total.protein, g?.protein), background: 'var(--protein)' }} /></span></div>
          <div><span className="k">Carbs</span><span className="v">{Math.round(total.carbs)}<span> / {g?.carbs ?? '–'} g</span></span><span className="b"><span style={{ width: pct(total.carbs, g?.carbs), background: 'var(--carbs)' }} /></span></div>
          <div><span className="k">Fat</span><span className="v">{Math.round(total.fat)}<span> / {g?.fat ?? '–'} g</span></span><span className="b"><span style={{ width: pct(total.fat, g?.fat), background: 'var(--fat)' }} /></span></div>
        </div>
        <MoreNutrients entries={list} />
        {(budget.burn || (budget.on && offset === 0)) && (
          <div className="burn-row">
            <Footprints size={16} strokeWidth={2.2} />
            <span style={{ flex: 1, minWidth: 0 }}>
              {!budget.burn
                ? <>No steps synced yet today</>
                : budget.burn.fromHealth !== null
                ? <>Active energy <b>{budget.burn.fromHealth} kcal</b> · {budget.burn.steps.toLocaleString('en-GB')} steps</>
                : <>{budget.burn.steps.toLocaleString('en-GB')} steps{budget.burn.workoutMinutes ? ` · ${budget.burn.workoutMinutes} min training` : ''} ≈ <b>{budget.burn.total} kcal</b></>}
              {budget.burn && budget.on && <span className="muted">{budget.extra > 0
                ? ` · +${budget.extra} added to your goal`
                : ` · adds to your goal after ${budget.allowance.toLocaleString('en-GB')} kcal (already in it)`}</span>}
            </span>
            {!budget.on && <button className="link-btn" onClick={async () => {
              try { await nav.api.setAddBurned(true); budget.reload(); nav.notify('Burned calories are added to your goal') }
              catch (e) { nav.notify(e instanceof Error ? e.message : 'Could not change the setting') }
            }}>Add to goal</button>}
            {offset === 0 && <button className="sync-btn" aria-label="Sync steps from Apple Health" onClick={syncSteps}><RefreshCw size={14} strokeWidth={2.4} />Sync</button>}
          </div>
        )}
      </section>

      {usual.length > 0 && offset === 0 && (
        <>
          <div className="section-title"><h2>Your usuals</h2></div>
          <div className="chips scroll" aria-label="Quick add">
            {usual.map(f => <button key={f.id} className="chip-btn" onClick={() => quickAdd(f)}>{f.name}<span className="muted">{f.kcal}</span></button>)}
          </div>
        </>
      )}

      {MEALS.map(meal => {
        const items = shown.filter(e => e.meal === meal)
        const kcal = sumMacros(items).kcal
        const target = drag?.over === meal && drag.over !== drag.from
        return (
          <div key={meal} data-meal={meal} className={`meal-drop ${target ? 'drop-target' : ''}`}>
            <Section title={`${MEAL_LABEL[meal]}${kcal > 0 ? ` · ${Math.round(kcal)} kcal` : ''}`}
              action={items.length ? <button aria-label={`Add food to ${MEAL_LABEL[meal]}`} onClick={() => setAdding(meal)}><Plus size={22} strokeWidth={2.2} /></button> : undefined}>
              {items.map(e => (
                <div key={e.id} className={`drag-item ${drag?.id === e.id ? 'dragging' : ''}`} onPointerDown={ev => startDrag(ev, e)}
                  onContextMenu={ev => ev.preventDefault()}>
                  <SwipeRow onDelete={() => deleteEntry(e)}>
                    <Row title={e.name} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } setEntryMenu(e) }}
                      sub={`${e.serving ? `${e.serving} · ` : ''}P ${round1(e.protein)} · C ${round1(e.carbs)} · F ${round1(e.fat)}`}
                      trail={<span style={{ fontSize: 17 }}>{Math.round(e.kcal)}</span>} />
                  </SwipeRow>
                </div>
              ))}
              {!items.length && (
                <button type="button" className="group-row accent" onClick={() => setAdding(meal)}>
                  <Plus size={20} strokeWidth={2} />{target ? `Move to ${MEAL_LABEL[meal].toLowerCase()}` : `Add ${MEAL_LABEL[meal].toLowerCase()}`}
                </button>
              )}
            </Section>
          </div>
        )
      })}
      {list.length > 0 && <p className="tiny muted" style={{ padding: '0 16px', marginTop: -4 }}>Swipe left to delete.{list.length > 1 ? ' Press and hold to drag to another meal.' : ''}</p>}

      {drag && (
        <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <GripVertical size={16} strokeWidth={2.2} />{drag.name}
        </div>
      )}

      <button className="btn" style={{ marginTop: 8 }} onClick={() => setEditGoals(true)}>Calorie & macro goals</button>

      {adding && foods.data && (
        <AddFood api={nav.api} foods={foods.data} meal={adding} offset={offset} onClose={() => setAdding(null)}
          onScan={() => { setAdding(null); setScanning(true) }}
          onPhoto={meal => { setAdding(null); takePhoto(meal) }}
          onPickProduct={(product, meal) => { setAdding(null); setScanned({ code: product.barcode, product, meal }) }}
          onAdded={name => { setAdding(null); nav.notify(`${name} added`); reload() }} />
      )}
      {photo && (
        <PhotoMeal api={nav.api} photo={photo} meal={photo.meal} offset={offset} onClose={() => setPhoto(null)}
          onRetake={() => { const m = photo.meal; setPhoto(null); takePhoto(m) }}
          onAdded={name => { setPhoto(null); nav.notify(`${name} added`); reload() }} />
      )}
      {scanning && (
        <BarcodeScanner onClose={() => setScanning(false)} onCode={code => { setScanning(false); setScanned({ code }) }} />
      )}
      {scanned && foods.data && (
        <ScanResult api={nav.api} foods={foods.data} code={scanned.code} initial={scanned.product} initialMeal={scanned.meal} offset={offset} onClose={() => setScanned(null)}
          onRescan={() => { setScanned(null); setScanning(true) }}
          onAdded={name => { setScanned(null); nav.notify(`${name} added`); reload() }} />
      )}
      {entryMenu && (
        <Sheet title={entryMenu.name} onClose={() => setEntryMenu(null)}>
          <p className="small muted">{entryMenu.serving ? `${entryMenu.serving} · ` : ''}{Math.round(entryMenu.kcal)} kcal · P {round1(entryMenu.protein)} · C {round1(entryMenu.carbs)} · F {round1(entryMenu.fat)}</p>
          <div className="seg seg-sm" role="group" aria-label="Move to meal">
            {MEALS.map(m => <button key={m} aria-pressed={(moved[entryMenu.id] ?? entryMenu.meal) === m} onClick={() => { moveEntry(entryMenu, m); setEntryMenu(null) }}>{MEAL_LABEL[m]}</button>)}
          </div>
          <button className="btn btn-danger-quiet" onClick={() => { const e = entryMenu; setEntryMenu(null); deleteEntry(e) }}><Trash2 size={18} strokeWidth={2} />Delete</button>
        </Sheet>
      )}
      {editGoals && goals.data && (
        <GoalsSheet api={nav.api} goals={goals.data} onReplan={() => { setEditGoals(false); nav.openPlanner() }} onClose={() => setEditGoals(false)} onSaved={() => { setEditGoals(false); goals.reload(); budget.reload(); nav.notify('Goals saved') }} />
      )}
    </div>
  )
}

/** After a scan: look the barcode up, ask how many grams, add it. */
function ScanResult({ api, foods, code, initial, initialMeal, offset, onClose, onAdded, onRescan }: {
  api: Api; foods: Food[]; code: string; initial?: ScannedProduct; initialMeal?: Meal; offset: number
  onClose: () => void; onAdded: (name: string) => void; onRescan: () => void
}) {
  const known = foods.find(f => f.barcode === code) ?? null
  const [state, setState] = useState<'loading' | 'found' | 'missing' | 'error'>(known || initial ? 'found' : 'loading')
  const [product, setProduct] = useState<ScannedProduct | null>(initial ?? null)
  const [meal, setMeal] = useState<Meal>(initialMeal ?? mealNow())
  const [grams, setGrams] = useState(initial?.servingGrams ? String(Math.round(initial.servingGrams)) : '100')
  const [form, setForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initial) return // picked from search: we already have the product
    let live = true
    lookupBarcode(code).then(p => {
      if (!live) return
      setProduct(p)
      if (p?.servingGrams) setGrams(String(Math.round(p.servingGrams)))
      if (known) return // your own copy already has the numbers; we only wanted the serving size
      if (p && p.per100) setState('found')
      else { setForm(f => ({ ...f, name: p ? p.name : '' })); setState('missing') }
    }, () => { if (live && !known) setState('error') })
    return () => { live = false }
  }, [code, known, initial])

  const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }
  const per100 = known ? { kcal: known.kcal, protein: known.protein, carbs: known.carbs, fat: known.fat, ...scaleNutrients(known, 1) }
    : state === 'found' && product?.per100 ? product.per100
    : { kcal: num(form.kcal), protein: num(form.protein), carbs: num(form.carbs), fat: num(form.fat) }
  const g = num(grams)
  const f = g / 100
  const servingG = product?.servingGrams ?? null
  const servings = servingG ? g / servingG : null
  const setServings = (n: number) => { if (servingG) setGrams(String(Math.round(Math.max(0, n) * servingG * 10) / 10)) }
  const fmtServ = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n * 4 % 1 === 0 ? 2 : 1).replace(/0$/, ''))
  const title = known ? known.name : product ? (product.brand ? `${product.name} (${product.brand})` : product.name) : form.name.trim()

  async function add() {
    if (!title || g <= 0) return
    setBusy(true)
    try {
      const food = known ?? await api.addFood({ name: title, serving: '100 g', ...per100, barcode: code })
      await api.addFoodEntry({ ...entryFrom(food, f, meal, offset), serving: servings && servingG ? `${fmtServ(Math.round(servings * 100) / 100)} × ${Math.round(servingG)} g` : `${Math.round(g)} g` })
      onAdded(title)
    } catch {
      setBusy(false)
    }
  }

  return (
    <Sheet title={state === 'missing' ? 'New product' : initial ? 'Add food' : 'Scanned'} onClose={onClose}>
      {state === 'loading' && <p className="muted">Looking up {code}…</p>}
      {state === 'error' && (
        <>
          <p className="small muted">Couldn't reach the food database. Check your connection, or enter the numbers from the label.</p>
          <button className="btn" onClick={() => setState('missing')}>Enter from the label</button>
        </>
      )}
      {(state === 'found' || state === 'missing') && (
        <>
          {state === 'found' ? (
            <div>
              <h3 style={{ fontSize: 20 }}>{title}</h3>
              <p className="small muted">Per 100 g: {per100.kcal} kcal · P {per100.protein} · C {per100.carbs} · F {per100.fat}</p>
            </div>
          ) : (
            <>
              <p className="small muted">{product ? 'This product has no nutrition facts yet.' : `Barcode ${code} isn't in the database yet.`} Copy them from the label once; next scan is instant.</p>
              <label>Name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Skyr naturell" /></label>
              <div className="form-grid4">
                {(['kcal', 'protein', 'carbs', 'fat'] as const).map(k => (
                  <label key={k}>{k === 'kcal' ? 'kcal' : `${k[0].toUpperCase()}${k.slice(1)}`}/100 g
                    <input inputMode="decimal" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
            </>
          )}
          {servingG && servings !== null && (
            <div className="serv-row">
              <span className="small" style={{ display: 'flex', flexDirection: 'column' }}>
                <b style={{ fontSize: 16 }}>Servings</b>
                <span className="muted tiny">1 serving = {Math.round(servingG)} g</span>
              </span>
              <div className="wk-stepper serv">
                <button type="button" aria-label="Half a serving less" onClick={() => setServings(Math.round((servings - 0.5) * 2) / 2)} disabled={servings <= 0.5}><Minus size={20} strokeWidth={2.6} /></button>
                <input inputMode="decimal" aria-label="Servings" value={fmtServ(Math.round(servings * 100) / 100)}
                  onFocus={e => e.target.select()} onChange={e => setServings(num(e.target.value))} />
                <button type="button" aria-label="Half a serving more" onClick={() => setServings(Math.round((servings + 0.5) * 2) / 2)}><Plus size={20} strokeWidth={2.6} /></button>
              </div>
            </div>
          )}
          <label>{servingG ? 'Or grams' : 'How much did you eat? (grams)'}
            <input inputMode="decimal" value={grams} onChange={e => setGrams(e.target.value)} onFocus={e => e.target.select()} />
          </label>
          <div className="chips">
            {servingG && [1, 2, 3].map(n => <button key={n} className="chip-btn" onClick={() => setServings(n)}>{n} serving{n > 1 ? 's' : ''} · {Math.round(servingG * n)} g</button>)}
            <button className="chip-btn" onClick={() => setGrams('100')}>100 g</button>
          </div>
          <div className="seg seg-sm" role="group" aria-label="Meal">
            {MEALS.map(m => <button key={m} aria-pressed={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</button>)}
          </div>
          <div className="card" style={{ padding: 14, gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{Math.round(per100.kcal * f)} <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>kcal</span></span>
            <span className="small muted">P {round1(per100.protein * f)} g · C {round1(per100.carbs * f)} g · F {round1(per100.fat * f)} g</span>
          </div>
          <button className="btn btn-primary btn-big" onClick={add} disabled={busy || !title || g <= 0 || (state === 'missing' && !form.kcal)}>{busy ? 'Adding…' : 'Add'}</button>
          {!initial && <button className="btn-text" style={{ alignSelf: 'center' }} onClick={onRescan}>Scan another</button>}
        </>
      )}
    </Sheet>
  )
}

const NUTRIENT_LABEL: Record<NutrientKey, string> = { fiber: 'Fibre', sugar: 'Sugar', sat_fat: 'Saturated fat', salt: 'Salt' }
const NUTRIENTS_OPEN = 'evo-stats.moreNutrients'

/** Scales fibre, sugar, saturated fat and salt; unknown (null) stays unknown. */
function scaleNutrients(n: Nutrients, f: number): Nutrients {
  const out: Nutrients = {}
  for (const k of NUTRIENT_KEYS) {
    const v = n[k]
    out[k] = v === null || v === undefined ? null : Math.round(v * f * (k === 'salt' ? 100 : 10)) / (k === 'salt' ? 100 : 10)
  }
  return out
}

/** "Show more nutrients": the day's fibre, sugar, saturated fat and salt, as on a food label. */
function MoreNutrients({ entries }: { entries: FoodEntry[] }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(NUTRIENTS_OPEN) === '1' } catch { return false } })
  const toggle = () => { setOpen(o => { try { localStorage.setItem(NUTRIENTS_OPEN, o ? '0' : '1') } catch { /* private mode */ } return !o }) }
  const known = entries.filter(e => NUTRIENT_KEYS.some(k => e[k] !== null && e[k] !== undefined))
  const sum = (k: NutrientKey) => known.reduce((t, e) => t + (e[k] ?? 0), 0)
  const missing = entries.length - known.length
  return (
    <>
      <button className="more-nutr-btn" aria-expanded={open} onClick={toggle}>
        {open ? 'Hide' : 'Show'} more nutrients <ChevronDown size={15} strokeWidth={2.4} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      {open && (
        <div className="more-nutr">
          <div className="nutr4">
            {NUTRIENT_KEYS.map(k => (
              <div key={k}>
                <span className="k">{NUTRIENT_LABEL[k]}</span>
                <span className="v">{known.length ? (k === 'salt' ? round2(sum(k)) : round1(sum(k))) : '–'}<span> g</span></span>
              </div>
            ))}
          </div>
          {missing > 0 && entries.length > 0 && (
            <p className="tiny muted">Not known for {missing} of {entries.length} foods (typed in by hand or logged before this was added), so the real totals are higher.</p>
          )}
        </div>
      )}
    </>
  )
}

type PhotoRow = PhotoItem & { key: number; g: string }

/** A meal photo: the AI lists what it sees with grams and macros; you check it, then add it all. */
function PhotoMeal({ api, photo, meal: initialMeal, offset, onClose, onAdded, onRetake }: {
  api: Api; photo: { base64: string; dataUrl: string }; meal: Meal; offset: number
  onClose: () => void; onAdded: (name: string) => void; onRetake: () => void
}) {
  const [meal, setMeal] = useState<Meal>(initialMeal)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'setup'>('loading')
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<PhotoRow[]>([])
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const num = (v: string) => { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }

  async function estimate(h: string) {
    setState('loading')
    try {
      const r = await api.estimatePhoto(photo.base64, h.trim())
      setRows(r.items.map((it, i) => ({ ...it, key: i, g: String(Math.round(it.grams)) })))
      setNote(r.note)
      setState('ready')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not estimate that photo.')
      setState(e instanceof PhotoNotSetUp ? 'setup' : 'error')
    }
  }
  useEffect(() => { estimate('') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Changing the grams scales the item's calories and macros with it.
  const scaled = (r: PhotoRow) => {
    const f = r.grams > 0 ? num(r.g) / r.grams : 1
    return { kcal: Math.round(r.kcal * f), protein: round1(r.protein * f), carbs: round1(r.carbs * f), fat: round1(r.fat * f), ...scaleNutrients(r, f) }
  }
  const kept = rows.filter(r => num(r.g) > 0)
  const total = kept.reduce((t, r) => { const x = scaled(r); return { kcal: t.kcal + x.kcal, protein: t.protein + x.protein, carbs: t.carbs + x.carbs, fat: t.fat + x.fat } }, { kcal: 0, protein: 0, carbs: 0, fat: 0 } as { kcal: number; protein: number; carbs: number; fat: number })

  async function add() {
    if (!kept.length) return
    setBusy(true)
    try {
      for (const r of kept) {
        await api.addFoodEntry(entryFrom({ name: r.name, serving: `${Math.round(num(r.g))} g`, ...scaled(r) }, 1, meal, offset))
      }
      onAdded(kept.length === 1 ? kept[0].name : `${kept.length} items`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not add it. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Sheet title="From a photo" onClose={onClose} tall>
      <img className="photo-preview" src={photo.dataUrl} alt="Your meal" />

      {state === 'loading' && <p className="muted" style={{ textAlign: 'center' }}>Looking at your meal…</p>}

      {state === 'setup' && (
        <div className="card" style={{ gap: 6 }}>
          <h3>Photo estimates aren't available right now</h3>
          <p className="small muted">Try again later, or search for the food instead.</p>
        </div>
      )}

      {state === 'error' && (
        <div className="card" style={{ gap: 10 }}>
          <p className="small">{message}</p>
          <button className="btn" onClick={() => estimate(hint)}>Try again</button>
        </div>
      )}

      {state === 'ready' && (
        <>
          {rows.length === 0 ? <p className="muted">No food found in this photo. Try another angle, or add a hint below.</p> : (
            <section className="group" aria-label="What the AI found">
              {rows.map(r => {
                const x = scaled(r)
                return (
                  <div key={r.key} className="group-row photo-row">
                    <span className="row-text">
                      <span className="row-title">{r.name}</span>
                      <span className="row-sub">{x.kcal} kcal · P {x.protein} · C {x.carbs} · F {x.fat}</span>
                    </span>
                    <label className="photo-g">
                      <input inputMode="decimal" aria-label={`Grams of ${r.name}`} value={r.g} onFocus={e => e.target.select()}
                        onChange={e => setRows(rs => rs.map(y => (y.key === r.key ? { ...y, g: e.target.value.replace(/[^\d.,]/g, '') } : y)))} />
                      <span>g</span>
                    </label>
                    <button className="icon-btn" aria-label={`Remove ${r.name}`} onClick={() => setRows(rs => rs.filter(y => y.key !== r.key))}><X size={18} strokeWidth={2.2} /></button>
                  </div>
                )
              })}
            </section>
          )}
          {note && <p className="tiny muted">{note}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ flex: 1 }} value={hint} onChange={e => setHint(e.target.value)} placeholder="Hint, e.g. 2 eggs, fried in butter" aria-label="Hint for the AI"
              onKeyDown={e => { if (e.key === 'Enter' && hint.trim()) estimate(hint) }} />
            <button className="btn" style={{ width: 'auto', padding: '0 14px' }} onClick={() => estimate(hint)} disabled={!hint.trim()}>Re-estimate</button>
          </div>

          <div className="seg seg-sm" role="group" aria-label="Meal">
            {MEALS.map(m => <button key={m} aria-pressed={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</button>)}
          </div>
          <div className="card" style={{ padding: 14, gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{total.kcal} <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>kcal</span></span>
            <span className="small muted">P {round1(total.protein)} g · C {round1(total.carbs)} g · F {round1(total.fat)} g</span>
          </div>
          {message && state === 'ready' && <p className="error">{message}</p>}
          <button className="btn btn-primary btn-big" onClick={add} disabled={busy || !kept.length}>
            {busy ? 'Adding…' : `Add to ${MEAL_LABEL[meal].toLowerCase()}`}
          </button>
        </>
      )}

      <button className="btn-text" style={{ alignSelf: 'center' }} onClick={onRetake}>Take another photo</button>
      <p className="tiny muted">An estimate, often 20–30 % off. Check the grams before you add it.</p>
    </Sheet>
  )
}

function entryFrom(f: Pick<Food, 'name' | 'serving' | 'kcal' | 'protein' | 'carbs' | 'fat'> & Nutrients & { id?: string }, servings: number, meal: Meal, offset: number) {
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
    ...scaleNutrients(f, servings),
    meal,
    eaten_at,
  } satisfies Omit<FoodEntry, 'id' | 'eaten_at'> & { eaten_at?: string }
}

function AddFood({ api, foods, meal: initialMeal, offset, onClose, onAdded, onScan, onPhoto, onPickProduct }: {
  api: Api; foods: Food[]; meal: Meal; offset: number; onClose: () => void; onAdded: (name: string) => void; onScan: () => void
  onPhoto: (meal: Meal) => void
  onPickProduct: (p: ScannedProduct, meal: Meal) => void
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
  const off = useOffSearch(query)
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
    <Sheet title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} onClose={onClose} tall>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="search" style={{ flex: 1 }}>
              <IconSearch />
              <input autoFocus value={q} onChange={e => { setQ(e.target.value); setCreating(false) }} placeholder="Search food" aria-label="Food name" />
            </div>
            <button className="square-btn" aria-label="Estimate from a photo" onClick={() => onPhoto(meal)}><Camera size={20} strokeWidth={2} /></button>
            <button className="square-btn" aria-label="Scan a barcode" onClick={onScan}><ScanBarcode size={20} strokeWidth={2} /></button>
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
            {!results.length && !query && <p className="small muted">Your foods show up here. Type to search, or scan a barcode.</p>}
          </div>
          {query.length >= 3 && (
            <div className="results" aria-live="polite">
              <p className="tiny muted" style={{ margin: '6px 2px 0', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>More products</p>
              {off.status === 'loading' && <p className="small muted">Searching…</p>}
              {off.status === 'error' && <p className="small muted">{off.message}</p>}
              {off.status === 'ok' && !off.list.length && <p className="small muted">Nothing found for “{q.trim()}”. Try another word, or scan the barcode.</p>}
              {off.status === 'ok' && off.list.map(p => (
                <button key={p.barcode} className="result" onClick={() => onPickProduct(p, meal)}>
                  <span style={{ minWidth: 0 }}><span style={{ fontWeight: 600 }}>{p.name}</span>{p.brand && <span className="small muted"> · {p.brand}</span>}</span>
                  <span className="small" style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>{p.per100!.kcal} kcal<span className="muted" style={{ fontWeight: 400 }}>/100 g</span></span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

export function GoalsSheet({ api, goals, onClose, onSaved, onReplan }: {
  api: Api; goals: Goals; onClose: () => void; onSaved: () => void; onReplan?: () => void
}) {
  const [kcal, setKcal] = useState(String(goals.kcal))
  // The split the user last chose; calorie changes scale from this so rounding never drifts.
  const [base, setBase] = useState({ protein: goals.protein, carbs: goals.carbs, fat: goals.fat })
  const [m, setM] = useState({ protein: String(goals.protein), carbs: String(goals.carbs), fat: String(goals.fat) })
  const [wpw, setWpw] = useState(String(goals.workouts_per_week))
  const [addBurned, setAddBurned] = useState(false)
  const [addBurnedWas, setAddBurnedWas] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api.getAddBurned().then(v => { setAddBurned(v); setAddBurnedWas(v) }, () => undefined) }, [api])
  const n = (s: string) => Math.max(0, Math.round(parseFloat(s.replace(',', '.')) || 0))

  function changeKcal(v: string) {
    setKcal(v)
    const k = n(v)
    if (k < 800) return
    const scaled = scaleMacros({ kcal: kcalFromMacros(base), ...base }, k)
    setM({ protein: String(scaled.protein), carbs: String(scaled.carbs), fat: String(scaled.fat) })
  }
  function changeMacro(key: 'protein' | 'carbs' | 'fat', v: string) {
    const next = { ...m, [key]: v }
    setM(next)
    const nb = { protein: n(next.protein), carbs: n(next.carbs), fat: n(next.fat) }
    setBase(nb)
    setKcal(String(kcalFromMacros(nb)))
  }
  const pct = (g: number, per: number) => { const k = n(kcal); return k ? Math.round((g * per * 100) / k) : 0 }

  return (
    <Sheet title="Daily goals" onClose={onClose}>
      {goals.plan && (
        <p className="small muted">Plan: <b style={{ color: 'var(--text)' }}>{planLabel(goals.plan)}</b>{goals.goal_weight_kg ? ` towards ${goals.goal_weight_kg} kg` : ''}</p>
      )}
      {onReplan && <button className="btn btn-soft" onClick={onReplan}>Work out my calories</button>}
      <label>Calories per day<input inputMode="numeric" value={kcal} onChange={e => changeKcal(e.target.value)} /></label>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <label>Protein g<input inputMode="numeric" value={m.protein} onChange={e => changeMacro('protein', e.target.value)} /><span className="tiny muted">{pct(n(m.protein), 4)}%</span></label>
        <label>Carbs g<input inputMode="numeric" value={m.carbs} onChange={e => changeMacro('carbs', e.target.value)} /><span className="tiny muted">{pct(n(m.carbs), 4)}%</span></label>
        <label>Fat g<input inputMode="numeric" value={m.fat} onChange={e => changeMacro('fat', e.target.value)} /><span className="tiny muted">{pct(n(m.fat), 9)}%</span></label>
      </div>
      <p className="tiny muted">Change calories and the macros scale with them. Change a macro and the calories follow (protein and carbs 4 kcal/g, fat 9 kcal/g).</p>
      <label>Workouts per week<input inputMode="numeric" value={wpw} onChange={e => setWpw(e.target.value)} /></label>
      <label className="check-row">
        <input type="checkbox" checked={addBurned} onChange={e => setAddBurned(e.target.checked)} />
        <span>Add calories burned to the day
          <span className="tiny muted" style={{ display: 'block', marginTop: 2 }}>When steps and workouts burn more than your activity level already counts, the extra is added to the day as carbs. Your goal never goes below what you set here.</span>
        </span>
      </label>
      {err && <p className="error">{err}</p>}
      <button className="btn btn-primary" onClick={async () => {
        setErr(null)
        await api.saveGoals({
          ...goals, kcal: n(kcal) || 2000, protein: n(m.protein), carbs: n(m.carbs), fat: n(m.fat),
          workouts_per_week: Math.min(14, Math.max(1, n(wpw) || 1)),
        })
        if (addBurned !== addBurnedWas) {
          try { await api.setAddBurned(addBurned) } catch (e) { setErr(e instanceof Error ? e.message : 'Could not save that setting'); return }
        }
        onSaved()
      }}>Save</button>
    </Sheet>
  )
}

type OffSearch = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; list: ScannedProduct[] } | { status: 'error'; message: string }

/** Searches Open Food Facts once you stop typing (they allow about 10 searches a minute). */
function useOffSearch(query: string): OffSearch {
  const [state, setState] = useState<OffSearch>({ status: 'idle' })
  useEffect(() => {
    if (query.length < 3) { setState({ status: 'idle' }); return }
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    const t = window.setTimeout(() => {
      searchProducts(query, ctrl.signal).then(
        list => setState({ status: 'ok', list: list.slice(0, 15) }),
        e => {
          if (ctrl.signal.aborted) return
          setState({ status: 'error', message: e instanceof TooManySearches ? e.message : 'Search isn\'t working right now. Check your connection.' })
        },
      )
    }, 700)
    return () => { window.clearTimeout(t); ctrl.abort() }
  }, [query])
  return state
}
