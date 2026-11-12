import { useState, type FormEvent } from 'react'
import { keepSignedIn, setKeepSignedIn, supabase } from '../lib/supabaseApi'

type Mode = 'signin' | 'signup' | 'forgot'

/** Where links in Supabase emails send people back to: this app's own address. */
const appUrl = () => `${window.location.origin}${window.location.pathname}`

function friendly(message: string): string {
  if (message === 'Invalid login credentials') return 'Wrong email or password.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent you.'
  if (/already registered|already been registered/i.test(message)) return 'There is already an account with that email. Sign in instead.'
  if (/signups? not allowed|signup.*disabled/i.test(message)) return 'New accounts are turned off right now.'
  if (/rate limit|only request this/i.test(message)) return 'Too many attempts. Wait a minute and try again.'
  if (/not authorized/i.test(message)) return "We couldn't send the email to that address yet. Ask the app owner."
  return message
}

export function Login({ initialError = null }: { initialError?: string | null }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(initialError)
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [remember, setRemember] = useState(keepSignedIn)

  const switchTo = (m: Mode) => { setMode(m); setError(null); setInfo(null); setPassword(''); setPassword2('') }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    const addr = email.trim()
    if (mode === 'signup') {
      if (password.length < 8) { setError('Use at least 8 characters for your password.'); return }
      if (password !== password2) { setError("The passwords don't match."); return }
    }
    setBusy(true)
    setKeepSignedIn(remember)
    try {
      const auth = supabase().auth
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email: addr, password })
        if (error) setError(friendly(error.message))
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email: addr, password, options: { emailRedirectTo: appUrl() } })
        if (error) setError(friendly(error.message))
        else if (!data.session) {
          // Email confirmation is on: the account exists but needs the link first.
          setInfo(`Almost done. We sent a link to ${addr}. Open it to confirm your email, then come back here and sign in.`)
          setMode('signin')
          setPassword('')
          setPassword2('')
        }
        // With confirmation off, Supabase signs you straight in and the app opens.
      } else {
        const { error } = await auth.resetPasswordForEmail(addr, { redirectTo: appUrl() })
        if (error) setError(friendly(error.message))
        else setInfo(`If ${addr} has an account, we've sent a link to set a new password.`)
      }
    } catch {
      setError('No connection. Check your internet and try again.')
    } finally {
      setBusy(false)
    }
  }

  const title = mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'EVO Stats'
  const button = mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <div className="logo" aria-hidden="true">ES</div>
        <h1>{title}</h1>
        <p className="muted small">
          {mode === 'signup' && 'Track your gym visits, workouts, food and weight. Only you can see your data.'}
          {mode === 'signin' && 'Sign in to your account.'}
          {mode === 'forgot' && "Enter your email and we'll send you a link to choose a new password."}
        </p>
        {info && <p className="small" role="status" style={{ color: 'var(--up)' }}>{info}</p>}
        <label>
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        {mode !== 'forgot' && (
          <label>
            <span>Password</span>
            <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password}
              onChange={e => setPassword(e.target.value)} required minLength={mode === 'signup' ? 8 : undefined} />
          </label>
        )}
        {mode === 'signup' && (
          <label>
            <span>Repeat password</span>
            <input type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} required />
          </label>
        )}
        {mode !== 'forgot' && (
          <label className="check-row">
            <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
            <span>Keep me signed in</span>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>{busy ? 'Please wait…' : button}</button>

        {mode === 'signin' && (
          <>
            <button type="button" className="btn-text" style={{ alignSelf: 'center' }} onClick={() => switchTo('forgot')}>Forgot password?</button>
            <p className="small muted" style={{ textAlign: 'center' }}>
              New here? <button type="button" className="btn-text" style={{ minHeight: 0 }} onClick={() => switchTo('signup')}>Create an account</button>
            </p>
          </>
        )}
        {mode !== 'signin' && (
          <p className="small muted" style={{ textAlign: 'center' }}>
            {mode === 'signup' ? 'Already have an account? ' : ''}
            <button type="button" className="btn-text" style={{ minHeight: 0 }} onClick={() => switchTo('signin')}>
              {mode === 'signup' ? 'Sign in' : '‹ Back to sign in'}
            </button>
          </p>
        )}
        {mode === 'signup' && (
          <p className="tiny muted">
            You can delete your account and all your data any time in More › Settings.
          </p>
        )}
      </form>
    </div>
  )
}

/** Shown after opening a "reset password" email link. */
export function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Use at least 8 characters for your password.'); return }
    if (password !== password2) { setError("The passwords don't match."); return }
    setBusy(true)
    const { error } = await supabase().auth.updateUser({ password })
    setBusy(false)
    if (error) setError(friendly(error.message))
    else onDone()
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <div className="logo" aria-hidden="true">ES</div>
        <h1>New password</h1>
        <p className="muted small">Choose a new password for your account.</p>
        <label>
          <span>New password</span>
          <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
        </label>
        <label>
          <span>Repeat password</span>
          <input type="password" autoComplete="new-password" value={password2} onChange={e => setPassword2(e.target.value)} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-big" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
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
        <p className="muted">This build has no database connected yet. Add <code>SUPABASE_URL</code> and <code>SUPABASE_PUBLISHABLE_KEY</code> as repository variables on GitHub, then re-run the deploy.</p>
        <a className="btn btn-primary btn-big" href="?demo">Try the demo</a>
      </div>
    </div>
  )
}
