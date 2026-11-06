import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

interface LoginLocationState {
  from?: { pathname?: string }
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as LoginLocationState | null)?.from?.pathname ?? '/dashboard'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) {
        setError(authError.code === 'email_not_confirmed'
          ? 'Your email is not verified yet. Open the confirmation link we sent before signing in, and check your spam folder if you cannot find it.'
          : 'Sign in failed. Check your email and password, then try again.')
        return
      }
      navigate(destination.startsWith('/') ? destination : '/dashboard', { replace: true })
    } catch {
      setError('Sign in failed. Check your email and password, then try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-4 py-10 text-text-primary">
      <section className="w-full max-w-sm border border-border-default bg-bg-secondary p-6" aria-labelledby="login-title">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck aria-hidden="true" className="size-6 text-accent-primary" />
          <span className="font-semibold">SentinelBoard</span>
        </div>
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-text-tertiary">SOC analyst workbench</p>
        <h1 id="login-title" className="text-xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-text-secondary">Use your SentinelBoard account to continue.</p>

        {error && <div className="mt-4 border-l-4 border-severity-critical bg-bg-primary p-3 text-sm text-text-primary" role="alert">{error}</div>}

        <form className="mt-5 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input id="login-email" autoComplete="email" autoFocus onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-password">Password</Label>
            <Input id="login-password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-text-secondary">
          No account yet? <Link className="text-accent-primary hover:underline" to="/signup">Create one</Link>
        </p>
      </section>
    </main>
  )
}
