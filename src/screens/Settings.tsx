import { useState } from 'react'
import type { Api } from '../lib/types'
import { useLoad } from '../lib/hooks'
import { SUPABASE_KEY, SUPABASE_URL } from '../lib/supabaseApi'

function Copy({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
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
        <code>{value}</code>
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
  const token = key.data ?? 'CREATE-A-KEY-FIRST'
  const club = clubs.data?.find(c => c.is_favorite)?.name ?? 'EVO Home club'

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
          ? <Copy label="Shortcut key" value={key.data} />
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
        <h2>3. Auto check-in when you arrive</h2>
        <ol>
          <li>Open <b>Shortcuts</b> › <b>Automation</b> › <b>+</b> › <b>Arrive</b>.</li>
          <li>Location: search your EVO's address. Time: <b>Any time</b>. Choose <b>Run Immediately</b>.</li>
          <li>New blank automation › add <b>Get Contents of URL</b>. URL: <i>log a visit</i>.</li>
          <li>Tap <b>Show More</b>: Method <b>POST</b>; Headers: <code>apikey</code> = your apikey; Request Body: <b>JSON</b> with three <b>Text</b> fields:</li>
        </ol>
        <pre>{`p_token   ${token}
p_source  arrival
p_club    ${club}`}</pre>
        <p className="muted small">Make one automation per club you use. Visits within 3 hours count once, so overlapping triggers are fine.</p>
      </section>

      <section className="card guide">
        <h2>4. Tap an NFC sticker (optional)</h2>
        <ol>
          <li><b>Automation</b> › <b>+</b> › <b>NFC</b> › <b>Scan</b> your sticker and name it.</li>
          <li><b>Run Immediately</b>, then the same <b>Get Contents of URL</b> as above, with <code>p_source</code> = <code>nfc</code>.</li>
        </ol>
        <p className="muted small">Also try <b>Automation › + › Transaction</b>. If your EVO pass appears in the card list, use it with <code>p_source</code> = <code>wallet</code> to count every door tap. It usually only lists payment cards.</p>
      </section>

      <section className="card guide">
        <h2>5. Sync weight from Apple Health daily</h2>
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
        <p className="muted small">{api.mode === 'demo' ? 'Demo mode: nothing is saved.' : `Connected to ${base.replace('https://', '')}`}</p>
        <button className="btn" onClick={() => api.signOut()}>{api.mode === 'demo' ? 'Leave demo' : 'Sign out'}</button>
      </section>
    </div>
  )
}
