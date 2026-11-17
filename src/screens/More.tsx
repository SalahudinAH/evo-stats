import { useEffect, useState } from 'react'
import { CalendarCheck, ChevronLeft, LogOut, MapPin, Scale, Smartphone, Target, Trash2 } from 'lucide-react'
import { LargeTitle, Row, Section } from '../components/ui'
import { scrollToTop } from '../lib/scroll'
import type { Nav } from '../App'
import type { Visit } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { fmtDateTime } from '../lib/stats'
import { Clubs } from './Clubs'
import { Shortcuts } from './Shortcuts'
import { supabase } from '../lib/supabaseApi'
import { WeightScreen } from './Weight'
import { GoalsSheet } from './Food'

type Sub = 'clubs' | 'visits' | 'weight' | 'shortcuts' | null

/** Lets another tab open a More sub-screen, e.g. Today → Centres. Read once on the next mount. */
let startSub: Sub = null
export function openMoreSub(s: Exclude<Sub, null>) { startSub = s }

const SOURCE_LABEL: Record<Visit['source'], string> = {
  arrival: 'Arrived', nfc: 'NFC tap', wallet: 'Door tap', shortcut: 'Shortcut', manual: 'Manual',
}

export function More({ nav }: { nav: Nav }) {
  const [sub, setSub] = useState<Sub>(() => { const s = startSub; startSub = null; return s })
  const [goals, setGoals] = useState(false)
  const g = useLoad(() => nav.api.getGoals(), [nav.api])
  const open = (s: Sub) => { setSub(s); scrollToTop() }
  const demo = nav.api.mode === 'demo'
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    if (demo) return
    supabase().auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
  }, [demo])

  async function deleteAccount() {
    const typed = prompt('This permanently deletes your account and everything in it: visits, workouts, food and weight. Type DELETE to confirm.')
    if (typed?.trim().toUpperCase() !== 'DELETE') return
    try { await nav.api.deleteAccount() }
    catch (e) { nav.notify(e instanceof Error ? `Not deleted: ${e.message}` : 'Not deleted. Try again.') }
  }

  if (sub) {
    return (
      <div className="screen">
        <div className="nav-bar"><button className="nav-back" onClick={() => open(null)}><ChevronLeft size={24} strokeWidth={2.2} />More</button></div>
        {sub === 'clubs' && <Clubs api={nav.api} notify={nav.notify} />}
        {sub === 'visits' && <VisitHistory nav={nav} />}
        {sub === 'weight' && <WeightScreen api={nav.api} notify={nav.notify} />}
        {sub === 'shortcuts' && <Shortcuts api={nav.api} notify={nav.notify} />}
      </div>
    )
  }

  return (
    <div className="screen">
      <LargeTitle title="More" />
      <Section title="Gym">
        <Row icon={<MapPin size={18} strokeWidth={2} />} title="EVO centres" sub="Nearest first, with how busy they are" onClick={() => open('clubs')} chevron />
        <Row icon={<CalendarCheck size={18} strokeWidth={2} />} title="Visit history" sub="Your check-ins" onClick={() => open('visits')} chevron />
      </Section>
      <Section title="You">
        <Row icon={<Target size={18} strokeWidth={2} />} iconTone="up" title="Goals" sub={g.data ? `${g.data.kcal.toLocaleString('en-GB')} kcal · ${g.data.protein} g protein · ${g.data.workouts_per_week} workouts a week` : 'Calories, macros and workouts a week'} onClick={() => setGoals(true)} chevron />
        <Row icon={<Scale size={18} strokeWidth={2} />} iconTone="up" title="Weight log" sub="All your weigh-ins" onClick={() => open('weight')} chevron />
      </Section>
      <Section title="iPhone">
        <Row icon={<Smartphone size={18} strokeWidth={2} />} iconTone="warn" title="Shortcuts" sub="Automatic check-in, weight and steps from Apple Health" onClick={() => open('shortcuts')} chevron />
      </Section>
      <Section title="Account">
        <Row icon={<LogOut size={18} strokeWidth={2} />} title={demo ? 'Leave demo' : 'Sign out'} sub={demo ? 'Nothing in the demo is saved' : email ?? undefined} onClick={() => nav.api.signOut()} />
        {!demo && <Row icon={<Trash2 size={18} strokeWidth={2} />} title="Delete account" sub="Removes you and all your data" onClick={deleteAccount} />}
      </Section>
      <p className="tiny muted" style={{ textAlign: 'center', margin: '4px 16px 0' }}>Not affiliated with EVO Fitness. Food data © Open Food Facts contributors.</p>
      {goals && g.data && (
        <GoalsSheet api={nav.api} goals={g.data} onReplan={() => { setGoals(false); nav.openPlanner() }} onClose={() => setGoals(false)} onSaved={() => { setGoals(false); g.reload(); nav.notify('Goals saved') }} />
      )}
    </div>
  )
}

function VisitHistory({ nav }: { nav: Nav }) {
  const visits = useLoad(() => nav.api.listVisits(), [nav.api])
  const list = visits.data ?? []
  async function remove(v: Visit) {
    if (!confirm(`Delete visit on ${fmtDateTime(v.visited_at)}?`)) return
    await nav.api.deleteVisit(v.id)
    visits.reload()
  }
  return (
    <>
      <header className="screen-head"><h1>Visits</h1><span className="small muted">{list.length} in 12 months</span></header>
      {visits.error && <p className="error">{visits.error}</p>}
      <section className="card">
        {visits.data && !list.length && <p className="muted">No visits yet.</p>}
        <ul className="rows">
          {list.slice(0, 100).map(v => (
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
    </>
  )
}
