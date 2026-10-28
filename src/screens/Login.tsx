import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseApi'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message)
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <div className="logo" aria-hidden="true">ES</div>
        <h1>EVO Stats</h1>
        <p className="muted small">Sign in with the account you created in Supabase.</p>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  )
}

export function NotConfigured() {
  return (
    <div className="center-screen">
      <div className="card login">
        <div className="logo" aria-hidden="true">ES</div>
        <h1>Almost there</h1>
        <p className="muted">This build has no database connected yet. Add <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> as repository variables on GitHub (see the README), then re-run the deploy.</p>
        <a className="btn btn-primary btn-big" href="?demo">Try the demo</a>
      </div>
    </div>
  )
}
