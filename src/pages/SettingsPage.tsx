import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, KeyRound, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface IngestToken {
  id: string
  label: string
  token_prefix: string
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
  expired?: boolean
}

export function SettingsPage() {
  const [label, setLabel] = useState('')
  const [newSecret, setNewSecret] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const tokenQuery = useQuery({
    queryKey: ['event-ingest-tokens', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error: invokeError } = await supabase.functions.invoke('manage-ingest-token', { body: { action: 'list' } })
      if (invokeError || !data || !Array.isArray(data.tokens)) throw new Error('Ingest tokens could not be loaded. Apply the latest database migration and deploy the token management function.')
      const now = Date.now()
      return (data.tokens as IngestToken[]).map((token) => ({ ...token, expired: Boolean(token.expires_at && Date.parse(token.expires_at) <= now) }))
    },
  })
  const tokens = tokenQuery.data ?? []

  async function createToken() {
    const normalizedLabel = label.trim()
    if (!normalizedLabel) { setError('Enter a name for this token.'); return }
    setBusy(true)
    setError('')
    setCopied(false)
    const { data, error: invokeError } = await supabase.functions.invoke('manage-ingest-token', { body: { action: 'create', label: normalizedLabel } })
    setBusy(false)
    if (invokeError || !data?.secret || !data?.token) {
      setError(typeof data?.error === 'string' ? data.error : 'Ingest token could not be created.')
      return
    }
    setNewSecret(data.secret as string)
    setLabel('')
    queryClient.setQueryData<IngestToken[]>(['event-ingest-tokens', user?.id], (current = []) => [{ ...(data.token as IngestToken), expired: false }, ...current])
  }

  async function revokeToken(tokenId: string) {
    setBusy(true)
    setError('')
    const { data, error: invokeError } = await supabase.functions.invoke('manage-ingest-token', { body: { action: 'revoke', id: tokenId } })
    setBusy(false)
    if (invokeError || !data?.revoked) {
      setError(typeof data?.error === 'string' ? data.error : 'Token could not be revoked.')
      return
    }
    queryClient.setQueryData<IngestToken[]>(['event-ingest-tokens', user?.id], (current = []) => current.map((token) => token.id === tokenId ? { ...token, revoked_at: new Date().toISOString() } : token))
    if (newSecret) setNewSecret('')
  }

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(newSecret)
      setCopied(true)
    } catch {
      setError('Clipboard access is unavailable. Copy the token from the field manually.')
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 overflow-y-auto p-4" aria-labelledby="settings-title">
      <header className="border-b border-border-panel pb-3">
        <p className="font-mono text-[10px] uppercase tracking-wide text-text-tertiary">Workspace configuration</p>
        <h1 className="mt-1 text-lg font-semibold" id="settings-title">Settings</h1>
        <p className="mt-1 text-xs text-text-secondary">Create and revoke credentials for external event sources.</p>
      </header>

      <section className="space-y-4 rounded-md border border-border-panel bg-bg-surface p-4" aria-labelledby="ingest-token-title">
        <div className="flex items-start gap-3"><KeyRound aria-hidden="true" className="mt-0.5 size-4 text-accent-primary" /><div><h2 className="text-sm font-semibold" id="ingest-token-title">Event ingestion tokens</h2><p className="mt-1 text-xs text-text-secondary">Bearer tokens let a trusted source send security events to your workspace. Tokens expire after 90 days and allow up to 60 requests per minute.</p></div></div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="ingest-token-label">Token name</label>
          <input className="h-9 min-w-0 flex-1 rounded-md border border-border-default bg-bg-input px-3 text-sm" id="ingest-token-label" maxLength={64} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void createToken() } }} placeholder="Token name, e.g. Production SIEM" value={label} />
          <Button disabled={busy || !label.trim()} onClick={() => void createToken()} size="sm"><Plus aria-hidden="true" className="size-3.5" />Create token</Button>
        </div>
        {newSecret && <div className="space-y-2 rounded-md border border-severity-medium bg-bg-secondary p-3" role="status">
          <p className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck aria-hidden="true" className="size-4 text-severity-medium" />Copy this token now. It will not be shown again.</p>
          <div className="flex flex-col gap-2 sm:flex-row"><input aria-label="New event ingestion token" className="h-9 min-w-0 flex-1 rounded-md border border-border-default bg-bg-input px-3 font-mono text-xs" readOnly value={newSecret} /><Button onClick={() => void copySecret()} size="sm" variant="outline">{copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}{copied ? 'Copied' : 'Copy token'}</Button></div>
        </div>}
        {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-3 text-xs" role="alert">{error}</p>}
        {tokenQuery.isPending ? <p className="py-4 text-center text-xs text-text-tertiary" role="status">Loading tokens…</p> : tokenQuery.isError ? <div className="py-3 text-xs text-severity-critical" role="alert"><p>{tokenQuery.error.message}</p><button className="mt-2 underline" onClick={() => void tokenQuery.refetch()} type="button">Retry</button></div> : tokens.length === 0 ? <p className="py-4 text-center text-xs text-text-tertiary">No ingestion tokens have been created.</p> : (
          <ul className="divide-y divide-border-subtle rounded-md border border-border-panel">
            {tokens.map((token) => {
              const inactive = Boolean(token.revoked_at) || Boolean(token.expired)
              return <li className="flex flex-wrap items-center justify-between gap-3 p-3" key={token.id}>
                <div className="min-w-0"><p className="text-xs font-medium">{token.label} {inactive && <span className="ml-2 rounded border border-border-default px-1.5 py-0.5 text-[9px] uppercase text-text-tertiary">{token.revoked_at ? 'Revoked' : 'Expired'}</span>}</p><p className="mt-1 font-mono text-[10px] text-text-secondary">{token.token_prefix}…</p><p className="mt-1 text-[10px] text-text-tertiary">Created {new Date(token.created_at).toLocaleDateString()} · {token.last_used_at ? `Last used ${new Date(token.last_used_at).toLocaleString()}` : 'Never used'}{token.expires_at ? ` · Expires ${new Date(token.expires_at).toLocaleDateString()}` : ''}</p></div>
                {!token.revoked_at && <Button disabled={busy} onClick={() => void revokeToken(token.id)} size="sm" variant="outline">Revoke</Button>}
              </li>
            })}
          </ul>
        )}
      </section>
      <section className="rounded-md border border-border-panel bg-bg-surface p-4" aria-labelledby="external-ingest-title">
        <h2 className="text-sm font-semibold" id="external-ingest-title">Endpoint</h2>
        <code className="mt-2 block overflow-x-auto rounded bg-bg-primary p-3 font-mono text-xs text-text-secondary">POST {import.meta.env.VITE_SUPABASE_URL}/functions/v1/ingest-event</code>
        <p className="mt-2 text-xs text-text-secondary">Send a JSON event, an array of up to 100 events, CEF, or RFC 5424 syslog with the Supabase public <code>apikey</code> and your <code>X-Ingest-Token</code>. Request limit: 1 MB. See the repository README for payload details.</p>
      </section>
    </main>
  )
}
