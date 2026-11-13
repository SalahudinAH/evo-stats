import { useMemo, useState } from 'react'
import type { Activity, Api, Goals, PlanId, Sex } from '../lib/types'
import { ACTIVITY, ageFrom, macrosFor, maintenance, planOptions, restingBurn } from '../lib/nutrition'

/**
 * First sign-in (and "Work out my calories" later): body stats → maintenance
 * calories → pick a plan → daily calorie and macro goals.
 */
export function PlanSetup({ api, goals, latestWeight, firstTime, onDone, onSkip }: {
  api: Api
  goals: Goals
  latestWeight: number | null
  firstTime: boolean
  onDone: () => void
  onSkip: () => void
}) {
  const [step, setStep] = useState<1 | 2>(1)
  const [sex, setSex] = useState<Sex | null>(goals.sex)
  const [birthYear, setBirthYear] = useState(goals.birth_year ? String(goals.birth_year) : '')
  const [height, setHeight] = useState(goals.height_cm ? String(goals.height_cm) : '')
  const [weight, setWeight] = useState(latestWeight ? String(latestWeight) : '')
  const [goal, setGoal] = useState(goals.goal_weight_kg ? String(goals.goal_weight_kg) : '')
  const [activity, setActivity] = useState<Activity>(goals.activity ?? 'moderate')
  const [plan, setPlan] = useState<PlanId | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const num = (s: string) => parseFloat(s.replace(',', '.'))
  const kg = num(weight), goalKg = num(goal), cm = parseInt(height, 10), year = parseInt(birthYear, 10)
  const age = Number.isFinite(year) ? ageFrom(year) : NaN
  const valid = !!sex && kg >= 30 && kg <= 300 && goalKg >= 30 && goalKg <= 300 && cm >= 100 && cm <= 250 && age >= 13 && age <= 100

  const calc = useMemo(() => {
    if (!valid || !sex) return null
    const rest = restingBurn(sex, kg, cm, age)
    const maint = maintenance(sex, kg, cm, age, activity)
    return { maint, options: planOptions(sex, maint, rest, kg, goalKg) }
  }, [valid, sex, kg, cm, age, activity, goalKg])

  const chosen = calc?.options.find(o => o.id === plan) ?? calc?.options[0] ?? null
  const macros = chosen ? macrosFor(chosen.kcal, kg, chosen.id) : null

  function next(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) { setError(age < 13 ? 'This setup is for ages 13 and up.' : 'Fill in all the fields.'); return }
    setError(null)
    setPlan(p => p ?? calc?.options[0].id ?? null)
    setStep(2)
    document.querySelector('main')?.scrollTo({ top: 0 })
  }

  async function save() {
    if (!chosen || !macros || !sex) return
    setSaving(true)
    try {
      await api.saveGoals({
        ...goals, ...macros, sex, birth_year: year, height_cm: cm, activity,
        goal_weight_kg: Math.round(goalKg * 10) / 10, plan: chosen.id, onboarded: true,
      })
      if (latestWeight === null || Math.abs(latestWeight - kg) >= 0.05) await api.addWeight(Math.round(kg * 10) / 10)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
      setSaving(false)
    }
  }

  if (step === 1) {
    return (
      <form className="screen" onSubmit={next}>
        <header className="screen-head">
          <div>
            <h1>{firstTime ? 'Welcome' : 'Your calories'}</h1>
            <p className="sub">{firstTime ? "A few details to work out your daily calories. You can change them later." : 'Update your details to recalculate.'}</p>
          </div>
        </header>

        <section className="card">
          <div className="seg" role="radiogroup" aria-label="Sex">
            {(['male', 'female'] as const).map(s => (
              <button type="button" key={s} role="radio" aria-checked={sex === s} aria-pressed={sex === s} onClick={() => setSex(s)}>
                {s === 'male' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>Birth year<input inputMode="numeric" value={birthYear} onChange={e => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2004" /></label>
            <label>Height (cm)<input inputMode="numeric" value={height} onChange={e => setHeight(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="180" /></label>
            <label>Weight now (kg)<input inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="80" /></label>
            <label>Goal weight (kg)<input inputMode="decimal" value={goal} onChange={e => setGoal(e.target.value)} placeholder="76" /></label>
          </div>
        </section>

        <section className="card" style={{ gap: 0, padding: '6px 14px' }} role="radiogroup" aria-label="How active are you?">
          {(Object.keys(ACTIVITY) as Activity[]).map((a, i) => (
            <button type="button" key={a} role="radio" aria-checked={activity === a} onClick={() => setActivity(a)} className="choice"
              style={{ borderTop: i ? '1px solid var(--line)' : 0 }}>
              <span className="grow"><span className="t">{ACTIVITY[a].label}</span><span className="d">{ACTIVITY[a].detail}</span></span>
              <span className={`radio ${activity === a ? 'on' : ''}`} aria-hidden="true" />
            </button>
          ))}
        </section>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big">See my calories</button>
        <button type="button" className="btn-text" style={{ alignSelf: 'center' }} onClick={onSkip}>{firstTime ? 'Skip for now' : 'Cancel'}</button>
      </form>
    )
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={() => setStep(1)}>‹ Details</button>
      </header>
      <div className="detail-title">
        <h1>Pick a plan</h1>
        <p className="sub">From {kg} kg to {goalKg} kg</p>
      </div>

      {calc && (
        <section className="card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="small muted">Your maintenance</div>
            <div className="num" style={{ fontSize: 30 }}>{calc.maint.toLocaleString('en-GB')} <span className="small muted" style={{ fontFamily: 'inherit' }}>kcal a day</span></div>
          </div>
        </section>
      )}

      <section className="card" style={{ gap: 0, padding: '6px 14px' }} role="radiogroup" aria-label="Plan">
        {calc?.options.map((o, i) => {
          const on = chosen?.id === o.id
          const rate = o.kgPerWeek === 0 ? 'Keep your weight' : `${o.kgPerWeek > 0 ? '+' : '−'}${Math.abs(o.kgPerWeek).toFixed(2)} kg a week`
          return (
            <button type="button" key={o.id} role="radio" aria-checked={on} onClick={() => setPlan(o.id)} className="choice"
              style={{ borderTop: i ? '1px solid var(--line)' : 0 }}>
              <span className="grow">
                <span className="t">{o.label} <span className="muted" style={{ fontWeight: 500 }}>· {o.kcal.toLocaleString('en-GB')} kcal</span></span>
                <span className="d">{rate}{o.weeks ? ` · about ${o.weeks} week${o.weeks === 1 ? '' : 's'} to ${goalKg} kg` : ''}</span>
                {o.note && <span className="d text-warn">{o.note}</span>}
              </span>
              <span className={`radio ${on ? 'on' : ''}`} aria-hidden="true" />
            </button>
          )
        })}
      </section>

      {macros && (
        <section className="card">
          <h2>Daily targets</h2>
          <div className="macro-tiles">
            <div className="macro-tile"><span className="tiny" style={{ color: 'var(--protein)', fontWeight: 650 }}>Protein</span><span style={{ fontWeight: 700 }}>{macros.protein} g</span></div>
            <div className="macro-tile"><span className="tiny" style={{ color: 'var(--carbs)', fontWeight: 650 }}>Carbs</span><span style={{ fontWeight: 700 }}>{macros.carbs} g</span></div>
            <div className="macro-tile"><span className="tiny" style={{ color: 'var(--fat)', fontWeight: 650 }}>Fat</span><span style={{ fontWeight: 700 }}>{macros.fat} g</span></div>
          </div>
          <p className="tiny muted">Protein is based on your weight (more when cutting, to keep muscle). Fat is about a quarter of your calories; carbs fill the rest. You can fine-tune these under Goals.</p>
        </section>
      )}

      <p className="tiny muted footnote">These are estimates. Watch your weight trend for 2–3 weeks and adjust if it moves faster or slower than expected.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-big" onClick={save} disabled={saving || !chosen}>{saving ? 'Saving…' : `Use ${chosen?.label ?? 'plan'}`}</button>
    </div>
  )
}
