import { useEffect, useState } from 'react'
import { CENTRES } from '../lib/evoCentres'
import { distanceMeters } from '../lib/stats'
import type { Api } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { SUPABASE_KEY, SUPABASE_URL, supabase } from '../lib/supabaseApi'

function Copy({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [done, setDone] = useState(false)
  const [shown, setShown] = useState(!secret)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Fallback for older iOS: select a temporary textarea.
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

export function Settings({ api, notify }: { api: Api; notify: (m: string) => void }) {
  const key = useLoad(() => api.getShortcutKey(), [api])
  const clubs = useLoad(() => api.listClubs(), [api])
  const base = api.mode === 'demo' ? 'https://YOUR-PROJECT.supabase.co' : SUPABASE_URL.replace(/\/$/, '')
  const pubKey = api.mode === 'demo' ? 'sb_publishable_…' : SUPABASE_KEY
  // The real key is only shown (masked) above, never in the examples below.
  const token = key.data ? 'YOUR-SHORTCUT-KEY' : 'CREATE-A-KEY-FIRST'
  const fav = clubs.data?.find(c => c.is_favorite) ?? null
  const club = fav?.name ?? 'EVO Home club'
  const mainCentre = fav ? CENTRES.find(c => distanceMeters(fav.lat, fav.lng, c.lat, c.lng) < 250) ?? null : null
  const [email, setEmail] = useState<string | null>(null)
  useEffect(() => {
    if (api.mode === 'demo') return
    supabase().auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null))
  }, [api])

  async function rotate() {
    if (key.data && !confirm('Make a new key? Shortcuts using the old key will stop working until you update them.')) return
    await api.rotateShortcutKey()
    key.reload()
    notify('Shortcut key ready')
  }

  return (
    <div className="screen">
      <header className="screen-head"><h1>Settings</h1></header>

      <section className="card">
        <h2>1. Your Shortcut key</h2>
        <p className="muted small">A private key that lets your iPhone's Shortcuts log visits and weight without signing in. Don't share it. If it leaks, make a new one.</p>
        {key.data
          ? <Copy label="Shortcut key" value={key.data} secret />
          : <p className="muted small">No key yet.</p>}
        <button className="btn" onClick={rotate}>{key.data ? 'Make a new key' : 'Create key'}</button>
      </section>

      <section className="card">
        <h2>2. Values you'll paste into Shortcuts</h2>
        <p className="muted small">Every automation uses one <b>Get Contents of URL</b> action: Method <b>POST</b>, a header named <b>apikey</b>, and a <b>JSON</b> request body.</p>
        <Copy label="Header: apikey" value={pubKey} />
        <Copy label="URL: log a visit" value={`${base}/rest/v1/rpc/log_visit`} />
        <Copy label="URL: log weight" value={`${base}/rest/v1/rpc/log_weight`} />
      </section>

      <section className="card guide">
        <h2>3. Auto check-in by location</h2>
        <p className="muted small">Your iPhone watches an area around the gym (a geofence) and checks you in the moment you walk in. It runs in the background through Location Services, so you don't need to open the app.</p>
        <ol>
          <li>Open <b>Shortcuts</b> › <b>Automation</b> › <b>+</b> › <b>Arrive</b>.</li>
          <li>Location: search {mainCentre ? <b>{mainCentre.address}</b> : <>your EVO's address</>}, then drag the circle down to about <b>100 m</b> so it only fires at the door. Time: <b>Any time</b>. Choose <b>Run Immediately</b>.</li>
          <li>New blank automation › add <b>Get Contents of URL</b>. URL: <i>log a visit</i>.</li>
          <li>Tap <b>Show More</b>: Method <b>POST</b>; Headers: <code>apikey</code> = your apikey; Request Body: <b>JSON</b> with three <b>Text</b> fields:</li>
        </ol>
        <pre>{`p_token   ${token}
p_source  arrival
p_club    ${club}`}</pre>
        <p className="muted small">Location Services must be on for Shortcuts (Settings › Privacy &amp; Security › Location Services). Make one automation per centre you use. Visits within 3 hours count once, so passing by twice never double-counts.</p>
      </section>

      <section className="card guide">
        <h2>4. Sync weight from Apple Health daily</h2>
        <ol>
          <li><b>Automation</b> › <b>+</b> › <b>Time of Day</b> (e.g. 09:00, Daily) › <b>Run Immediately</b>.</li>
          <li>Add <b>Find Health Samples</b>: Type <b>Weight</b>, Sort by <b>Start Date</b>, <b>Latest First</b>, Limit <b>1</b>.</li>
          <li>Add <b>Get Details of Health Samples</b> › <b>Value</b>.</li>
          <li>Add <b>Format Date</b> on the sample's <b>Start Date</b> › Date Format <b>ISO 8601</b>.</li>
          <li>Add <b>Get Contents of URL</b>: URL <i>log weight</i>, POST, header <code>apikey</code>, JSON body:</li>
        </ol>
        <pre>{`p_token        ${token}            (Text)
p_kg           [Value]            (Number)
p_measured_at  [Formatted Date]   (Text)`}</pre>
        <p className="muted small">Running daily also keeps the free database awake. Free Supabase projects pause after a week with no activity.</p>
      </section>

      <section className="card">
        <h2>Account</h2>
        <p className="muted small">{api.mode === 'demo' ? 'Demo mode: nothing is saved.' : email ? `Signed in as ${email}` : 'Signed in'}</p>
        <button className="btn" onClick={() => api.signOut()}>{api.mode === 'demo' ? 'Leave demo' : 'Sign out'}</button>
        {api.mode !== 'demo' && (
          <button className="btn btn-danger-quiet" onClick={async () => {
            const typed = prompt('This permanently deletes your account and everything in it: visits, workouts, food, weight and clubs. Type DELETE to confirm.')
            if (typed?.trim().toUpperCase() !== 'DELETE') return
            try {
              await api.deleteAccount()
            } catch (e) {
              notify(e instanceof Error ? `Not deleted: ${e.message}` : 'Not deleted. Try again.')
            }
          }}>Delete account</button>
        )}
      </section>
    </div>
  )
}
