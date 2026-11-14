import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChartLine, Dumbbell, Ellipsis, House, Utensils } from 'lucide-react'
import { scrollToTop } from './lib/scroll'
import type { Session } from '@supabase/supabase-js'
import type { Api } from './lib/types'
import { askToKeepStorage, createSupabaseApi, isConfigured, keepSignedIn, supabase } from './lib/supabaseApi'
import { createDemoApi } from './lib/demoApi'
import { loadDraft, storeDraft, type Draft } from './lib/draft'
import { Today } from './screens/Today'
import { Train } from './screens/Train'
import { ActiveWorkout } from './screens/ActiveWorkout'
import { WorkoutSummary } from './screens/WorkoutSummary'
import { FoodScreen } from './screens/Food'
import { Progress } from './screens/Progress'
import { More } from './screens/More'
import { PlanSetup } from './screens/Plan'
import { useLoad } from './lib/hooks'
import { Login, NewPassword, NotConfigured } from './screens/Login'

export type Tab = 'today' | 'train' | 'food' | 'progress' | 'more'

const isDemo = new URLSearchParams(window.location.search).has('demo')

export default function App() {
  if (isDemo) return <DemoShell />
  if (!isConfigured) return <NotConfigured />
  return <AuthGate />
}

function DemoShell() {
  const api = useMemo(createDemoApi, [])
  return <Shell api={api} owner="demo" />
}

/** An expired or used email link comes back as #error_description=… */
const linkError = (() => {
  const p = new URLSearchParams(window.location.hash.slice(1))
  const msg = p.get('error_description')
  if (msg) history.replaceState(null, '', window.location.pathname + window.location.search)
  return msg ? `That link didn't work (${msg.replace(/\+/g, ' ')}). Request a new one.` : null
})()

function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  useEffect(() => {
    const sb = supabase()
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  const api = useMemo(() => (session ? createSupabaseApi() : null), [session?.user.id])
  useEffect(() => { if (session && keepSignedIn()) askToKeepStorage() }, [session?.user.id])
  if (session === undefined) return <div className="center-screen muted">Loading…</div>
  if (session && recovering) return <NewPassword onDone={() => setRecovering(false)} />
  if (!session || !api) return <Login initialError={linkError} />
  // key: a different account gets a completely fresh app state.
  return <Shell key={session.user.id} api={api} owner={session.user.id} />
}

const OLD_HASHES: Record<string, Tab> = { home: 'today', strength: 'train', weight: 'progress', clubs: 'more', settings: 'more' }

function readTab(): Tab {
  const h = window.location.hash.replace('#', '')
  if (['today', 'train', 'food', 'progress', 'more'].includes(h)) return h as Tab
  return OLD_HASHES[h] ?? 'today'
}

/** What every screen gets. */
export interface Nav {
  api: Api
  notify: (m: string) => void
  go: (t: Tab) => void
  draft: Draft | null
  /** Start a workout (replaces nothing if one is already running). */
  startWorkout: (d: Draft) => void
  openWorkout: () => void
  /** Open the calorie planner (body stats → maintenance → plan). */
  openPlanner: () => void
  /** Bumps when goals change, so screens showing them reload. */
  goalsVersion: number
  /** The signed-in user's id ("demo" in the demo), for things kept on this phone. */
  owner: string
}

function Shell({ api, owner }: { api: Api; owner: string }) {
  const [tab, setTab] = useState<Tab>(readTab)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraftState] = useState<Draft | null>(() => loadDraft(owner))
  const [workoutOpen, setWorkoutOpen] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [goalsVersion, setGoalsVersion] = useState(0)
  const goals = useLoad(() => api.getGoals(), [api, goalsVersion])
  const weights = useLoad(() => api.listWeights(), [api, goalsVersion])
  const timer = useRef<number>()

  const notify = useCallback((m: string) => {
    setToast(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  useEffect(() => {
    const onHash = () => setTab(readTab())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const setDraft = useCallback((d: Draft | null | ((cur: Draft) => Draft)) => {
    setDraftState(cur => {
      const next = typeof d === 'function' ? (cur ? d(cur) : null) : d
      storeDraft(owner, next)
      return next
    })
  }, [owner])

  const go = useCallback((t: Tab) => {
    window.location.hash = t
    setTab(t)
    setWorkoutOpen(false)
    scrollToTop()
  }, [])

  const nav: Nav = {
    api, notify, go, draft,
    startWorkout: d => {
      if (draft) { notify('Finish or discard your current workout first'); setWorkoutOpen(true); return }
      setDraft(d)
      setWorkoutOpen(true)
      scrollToTop()
    },
    openWorkout: () => { setWorkoutOpen(true); scrollToTop() },
    openPlanner: () => { setPlanning(true); scrollToTop() },
    goalsVersion,
    owner,
  }
  // First sign-in: ask for body stats before anything else.
  const needsSetup = !!goals.data && !goals.data.onboarded
  const showPlanner = (planning || needsSetup) && !!goals.data && !!weights.data
  const latestWeight = weights.data?.length ? weights.data[weights.data.length - 1].kg : null
  const closePlanner = () => { setPlanning(false); setGoalsVersion(v => v + 1); scrollToTop() }

  const inWorkout = workoutOpen && draft && !showPlanner
  const endWorkout = (savedTab: Tab | null) => {
    setDraft(null)
    setWorkoutOpen(false)
    if (savedTab) go(savedTab)
  }

  return (
    <div className="app">
      {api.mode === 'demo' && <div className="demo-banner">Demo data · nothing is saved</div>}
      <main className={inWorkout || showPlanner ? 'no-tabbar' : undefined}>
        {showPlanner && (
          <PlanSetup api={api} goals={goals.data!} latestWeight={latestWeight} firstTime={needsSetup}
            onDone={() => { closePlanner(); notify('Daily goals set') }}
            onSkip={async () => {
              if (needsSetup) await api.saveGoals({ ...goals.data!, onboarded: true }).catch(() => undefined)
              closePlanner()
            }} />
        )}
        {inWorkout && !draft.finished_at && (
          <ActiveWorkout nav={nav} draft={draft} setDraft={setDraft}
            onMinimise={() => setWorkoutOpen(false)}
            onDiscard={() => { endWorkout(null); notify('Workout discarded') }} />
        )}
        {inWorkout && draft.finished_at && (
          <WorkoutSummary nav={nav} draft={draft} setDraft={setDraft}
            onSaved={() => { endWorkout('train'); notify('Workout saved') }}
            onDiscard={() => { endWorkout(null); notify('Workout discarded') }} />
        )}
        {!inWorkout && !showPlanner && tab === 'today' && <Today nav={nav} />}
        {!inWorkout && !showPlanner && tab === 'train' && <Train nav={nav} />}
        {!inWorkout && !showPlanner && tab === 'food' && <FoodScreen nav={nav} />}
        {!inWorkout && !showPlanner && tab === 'progress' && <Progress nav={nav} />}
        {!inWorkout && !showPlanner && tab === 'more' && <More nav={nav} />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
      {!inWorkout && !showPlanner && (
        <nav className="tabbar" aria-label="Sections">
          <TabBtn active={tab === 'today'} onClick={() => go('today')} label="Today" icon={<IconHome />} />
          <TabBtn active={tab === 'train'} onClick={() => go('train')} label="Train" icon={<IconDumbbell />} />
          <TabBtn active={tab === 'food'} onClick={() => go('food')} label="Food" icon={<IconFood />} />
          <TabBtn active={tab === 'progress'} onClick={() => go('progress')} label="Progress" icon={<IconChart />} />
          <TabBtn active={tab === 'more'} onClick={() => go('more')} label="More" icon={<IconMore />} />
        </nav>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: ReactNode }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

const ICON = { size: 25, strokeWidth: 1.8, 'aria-hidden': true } as const
const IconHome = () => <House {...ICON} />
export const IconDumbbell = () => <Dumbbell {...ICON} />
const IconFood = () => <Utensils {...ICON} />
const IconChart = () => <ChartLine {...ICON} />
const IconMore = () => <Ellipsis {...ICON} strokeWidth={2.4} />
