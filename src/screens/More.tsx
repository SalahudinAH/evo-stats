import { useState } from 'react'
import { CalendarCheck, ChevronLeft, MapPin, Scale, Settings as SettingsIcon, Target } from 'lucide-react'
import { LargeTitle, Row, Section } from '../components/ui'
import { scrollToTop } from '../lib/scroll'
import type { Nav } from '../App'
import type { Visit } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { fmtDateTime } from '../lib/stats'
import { Clubs } from './Clubs'
import { Settings } from './Settings'
import { WeightScreen } from './Weight'
import { GoalsSheet } from './Food'

type Sub = 'clubs' | 'visits' | 'weight' | 'settings' | null

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

  if (sub) {
    return (
      <div className="screen">
        <div className="nav-bar"><button className="nav-back" onClick={() => open(null)}><ChevronLeft size={24} strokeWidth={2.2} />More</button></div>
        {sub === 'clubs' && <Clubs api={nav.api} notify={nav.notify} />}
        {sub === 'visits' && <VisitHistory nav={nav} />}
        {sub === 'weight' && <WeightScreen api={nav.api} notify={nav.notify} />}
        {sub === 'settings' && <Settings api={nav.api} notify={nav.notify} />}
      </div>
    )
  }

  return (
    <div className="screen">
      <LargeTitle title="More" />
      <Section title="Gym">
        <Row icon={<MapPin size={18} strokeWidth={2} />} title="EVO centres" sub="All 92 in Norway, nearest first, and how busy they are" onClick={() => open('clubs')} chevron />
        <Row icon={<CalendarCheck size={18} strokeWidth={2} />} title="Visit history" sub="Every check-in, and delete mistakes" onClick={() => open('visits')} chevron />
      </Section>
      <Section title="You">
        <Row icon={<Scale size={18} strokeWidth={2} />} iconTone="up" title="Weight log" sub="All entries, add or delete" onClick={() => open('weight')} chevron />
        <Row icon={<Target size={18} strokeWidth={2} />} iconTone="up" title="Goals" sub={g.data ? `${g.data.kcal.toLocaleString('en-GB')} kcal · ${g.data.protein} g protein · ${g.data.workouts_per_week} workouts a week` : 'Calories, macros and workouts per week'} onClick={() => setGoals(true)} chevron />
      </Section>
      <Section>
        <Row icon={<SettingsIcon size={18} strokeWidth={2} />} iconTone="warn" title="Settings & Shortcuts" sub="Auto check-in, weight sync, sign out" onClick={() => open('settings')} chevron />
      </Section>
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
