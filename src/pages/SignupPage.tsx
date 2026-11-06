import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

export function SignupPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      })
      if (authError) {
        setError('Account creation failed. Check your details and try again.')
        return
      }
      if (data.session) {
        navigate('/dashboard', { replace: true })
        return
      }
      setMessage('Your account was created. Check your email for the confirmation link before signing in.')
    } catch {
      setError('Account creation failed. Check your details and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-primary px-4 py-10 text-text-primary">
      <section className="w-full max-w-sm border border-border-default bg-bg-secondary p-6" aria-labelledby="signup-title">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck aria-hidden="true" className="size-6 text-accent-primary" />
          <span className="font-semibold">SentinelBoard</span>
        </div>
        <p className="mb-2 font-mono text-xs uppercase tracking-wide text-text-tertiary">SOC analyst workbench</p>
        <h1 id="signup-title" className="text-xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-text-secondary">Set up an analyst account to start investigating.</p>

        {error && <div className="mt-4 border-l-4 border-severity-critical bg-bg-primary p-3 text-sm text-text-primary" role="alert">{error}</div>}
        {message && (
          <div className="mt-4 border-l-4 border-status-success bg-bg-primary p-3 text-sm text-text-primary" role="status">
            {message} <Link className="text-accent-primary hover:underline" to="/login">Go to sign in</Link>
          </div>
        )}

        <form className="mt-5 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="signup-name">Display name</Label>
            <Input id="signup-name" autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input id="signup-email" autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input id="signup-password" autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </div>
          <Button className="w-full" disabled={submitting} type="submit">
            {submitting ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-text-secondary">
          Already registered? <Link className="text-accent-primary hover:underline" to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  )
}
