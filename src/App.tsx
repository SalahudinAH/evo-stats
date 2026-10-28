import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Api } from './lib/types'
import { createSupabaseApi, isConfigured, supabase } from './lib/supabaseApi'
import { createDemoApi } from './lib/demoApi'
import { Dashboard } from './screens/Dashboard'
import { Strength } from './screens/Strength'
import { WeightScreen } from './screens/Weight'
import { Clubs } from './screens/Clubs'
import { Settings } from './screens/Settings'
import { Login, NotConfigured } from './screens/Login'

type Tab = 'home' | 'strength' | 'weight' | 'clubs' | 'settings'

const isDemo = new URLSearchParams(window.location.search).has('demo')

export default function App() {
  if (isDemo) return <DemoShell />
  if (!isConfigured) return <NotConfigured />
  return <AuthGate />
}

function DemoShell() {
  const api = useMemo(createDemoApi, [])
  return <Shell api={api} />
}

function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    const sb = supabase()
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  const api = useMemo(() => (session ? createSupabaseApi() : null), [session?.user.id])
  if (session === undefined) return <div className="center-screen muted">Loading…</div>
  if (!session || !api) return <Login />
  return <Shell api={api} />
}

function readTab(): Tab {
  const h = window.location.hash.replace('#', '') as Tab
  return ['home', 'strength', 'weight', 'clubs', 'settings'].includes(h) ? h : 'home'
}

function Shell({ api }: { api: Api }) {
  const [tab, setTab] = useState<Tab>(readTab)
  const [toast, setToast] = useState<string | null>(null)
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

  function go(t: Tab) {
    window.location.hash = t
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      {api.mode === 'demo' && <div className="demo-banner">Demo data · nothing is saved</div>}
      <main>
        {tab === 'home' && <Dashboard api={api} notify={notify} />}
        {tab === 'strength' && <Strength api={api} notify={notify} />}
        {tab === 'weight' && <WeightScreen api={api} notify={notify} />}
        {tab === 'clubs' && <Clubs api={api} notify={notify} />}
        {tab === 'settings' && <Settings api={api} notify={notify} />}
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
      <nav className="tabbar" aria-label="Sections">
        <TabBtn active={tab === 'home'} onClick={() => go('home')} label="Visits" icon={<IconCalendar />} />
        <TabBtn active={tab === 'strength'} onClick={() => go('strength')} label="Strength" icon={<IconDumbbell />} />
        <TabBtn active={tab === 'weight'} onClick={() => go('weight')} label="Weight" icon={<IconScale />} />
        <TabBtn active={tab === 'clubs'} onClick={() => go('clubs')} label="Clubs" icon={<IconPin />} />
        <TabBtn active={tab === 'settings'} onClick={() => go('settings')} label="Settings" icon={<IconGear />} />
      </nav>
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

const svg = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

const IconCalendar = () => (
  <svg {...svg}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="m9 14.5 2 2 4-4" /></svg>
)
const IconDumbbell = () => (
  <svg {...svg}><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" /></svg>
)
const IconScale = () => (
  <svg {...svg}><rect x="3.5" y="3.5" width="17" height="17" rx="4" /><path d="M8 9a5 5 0 0 1 8 0l-3 3.5" /></svg>
)
const IconPin = () => (
  <svg {...svg}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>
)
const IconGear = () => (
  <svg {...svg}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" /></svg>
)
