import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { CENTRES } from '../lib/evoCentres'
import { distanceMeters } from '../lib/stats'
import type { Api } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabaseApi'

function Copy({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false)
  const [shown, setShown] = useState(!secret)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Older iOS: copy through a temporary textarea.
      const t = document.createElement('textarea')
      t.value = value
      document.body.appendChild(t)
      t.select()
      document.execCommand('copy')
      t.remove()
    }
    setDone(true)
    setTimeout(() => setDone(false), 1500)
  }
  return (
    <div className="copy">
      <div className="copy-label">{label}</div>
      <div className="copy-row">
        <code>{shown ? value : `••••••••••••${value.slice(-4)}`}</code>
        {secret && <button className="btn btn-small" onClick={() => setShown(v => !v)}>{shown ? 'Hide' : 'Show'}</button>}
        <button className="btn btn-small" onClick={copy}>{done ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  )
}

/** A guide that folds open, so the screen stays short. */
function Guide({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="card guide">
      <button className="guide-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span><b>{title}</b><span className="muted small">{sub}</span></span>
        <ChevronDown size={20} strokeWidth={2.2} style={{ transform: open ? 'rotate(180deg)' : undefined, flex: 'none' }} />
      </button>
      {open && <div className="guide-body">{children}</div>}
    </section>
  )
}

/** iPhone Shortcuts that log visits, weight and steps for you in the background. */
export function Shortcuts({ api, notify }: { api: Api; notify: (m: string) => void }) {
  const key = useLoad(() => api.getShortcutKey(), [api])
  const clubs = useLoad(() => api.listClubs(), [api])
  const demo = api.mode === 'demo'
  const base = demo ? 'https://example.supabase.co' : SUPABASE_URL.replace(/\/$/, '')
  const header = demo ? 'demo-header-value' : SUPABASE_KEY
  const fav = clubs.data?.find(c => c.is_favorite) ?? null
  const club = fav?.name ?? 'EVO'
  const centre = fav ? CENTRES.find(c => distanceMeters(fav.lat, fav.lng, c.lat, c.lng) < 250) ?? null : null

  async function makeKey() {
    if (key.data && !confirm('Make a new key? Shortcuts that use the old one stop working until you paste the new one in.')) return
    await api.rotateShortcutKey()
    key.reload()
    notify('Key ready')
  }

  // What every guide pastes into its "Get Contents of URL" action.
  const request = (rpc: string) => (
    <>
      <Copy label="URL" value={`${base}/rest/v1/rpc/${rpc}`} />
      <Copy label="Header: apikey" value={header} />
      {key.data ? <Copy label="p_token (your key)" value={key.data} secret /> : <p className="small muted">Create your key at the top first.</p>}
    </>
  )

  return (
    <div className="screen">
      <header className="screen-head"><h1>Shortcuts</h1></header>
      <p className="muted small" style={{ marginTop: -6 }}>Let your iPhone log things for you in the background, without opening the app. Each one takes a few minutes to set up in the Shortcuts app, once.</p>

      <section className="card">
        <h2>Your key</h2>
        <p className="muted small">Your Shortcuts use this private key instead of signing in. Keep it to yourself; if it leaks, make a new one.</p>
        {key.data ? <Copy label="Key" value={key.data} secret /> : <p className="muted small">No key yet.</p>}
        <button className="btn" onClick={makeKey}>{key.data ? 'Make a new key' : 'Create key'}</button>
      </section>

      <Guide title="Check in at the gym" sub="Logs a visit when you arrive at your EVO">
        <ol>
          <li>In <b>Shortcuts</b>: <b>Automation</b> › <b>+</b> › <b>Arrive</b>.</li>
          <li>Location: {centre ? <b>{centre.address}</b> : <>your EVO's address</>}. Drag the circle down to about <b>100 m</b>, then choose <b>Run Immediately</b>.</li>
          <li>Add the action <b>Get Contents of URL</b> and paste the URL below.</li>
          <li>Tap <b>Show More</b>: Method <b>POST</b>. Add a header named <code>apikey</code> with the value below. Request Body <b>JSON</b> with three <b>Text</b> fields:</li>
        </ol>
        <pre>{`p_token   your key
p_source  arrival
p_club    ${club}`}</pre>
        {request('log_visit')}
        <p className="muted small">Location Services must be on for Shortcuts. Visits within 3 hours count once, so walking past twice won't count twice.</p>
      </Guide>

      <Guide title="Weight from Apple Health" sub="Copies your latest weight once a day">
        <ol>
          <li><b>Automation</b> › <b>+</b> › <b>Time of Day</b>, e.g. 09:00, Daily, <b>Run Immediately</b>.</li>
          <li><b>Find Health Samples</b>: Type <b>Weight</b>, sort by <b>Start Date</b>, <b>Latest First</b>, limit <b>1</b>.</li>
          <li><b>Get Details of Health Samples</b> › <b>Value</b>.</li>
          <li><b>Format Date</b> on the sample's <b>Start Date</b>, format <b>ISO 8601</b>.</li>
          <li><b>Get Contents of URL</b> with the values below, Method <b>POST</b>, header <code>apikey</code>, Request Body <b>JSON</b>:</li>
        </ol>
        <pre>{`p_token        your key          (Text)
p_kg           Value             (Number)
p_measured_at  Formatted Date    (Text)`}</pre>
        {request('log_weight')}
      </Guide>

      <Guide title="Steps from Apple Health" sub="So Food can add the calories you burn">
        <ol>
          <li>Make a new shortcut named <b>EVO steps</b>. Use exactly that name: the Sync button on Food runs it.</li>
          <li><b>Find Health Samples</b>: Type <b>Steps</b>, Start Date <b>is today</b>.</li>
          <li><b>Calculate Statistics</b> › <b>Sum</b>.</li>
          <li>With an Apple Watch (optional): the same for <b>Active Energy</b>.</li>
          <li><b>Get Contents of URL</b> with the values below, Method <b>POST</b>, header <code>apikey</code>, Request Body <b>JSON</b>:</li>
        </ol>
        <pre>{`p_token        your key            (Text)
p_steps        Sum of steps        (Number)
p_active_kcal  Sum of energy       (Number, optional)`}</pre>
        {request('log_activity')}
        <p className="muted small">Then let it run by itself: <b>Automation</b> › <b>+</b> › <b>Time of Day</b>, a few times a day (e.g. 12:00, 17:00, 21:00, 23:30), action <b>Run Shortcut › EVO steps</b>. For the newest number, tap <b>Sync</b> on Food.</p>
        <p className="muted small">Turn on <b>Add calories burned to the day</b> in Food › Calorie &amp; macro goals.</p>
      </Guide>
    </div>
  )
}
