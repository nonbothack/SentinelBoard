import { useMemo, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { incidentPlaybooks, derivePlaybookProgress, type PlaybookId } from '@/lib/incident-playbooks'
import { recordIncidentActivity, type TimelineEntry } from '@/lib/incidents'
import { useAuth } from '@/contexts/AuthContext'

interface IncidentPlaybookProps {
  incidentId: string
  entries: TimelineEntry[]
  onChanged: () => void
}

export function IncidentPlaybook({ incidentId, entries, onChanged }: IncidentPlaybookProps) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completionOverrides, setCompletionOverrides] = useState<Record<string, boolean>>({})
  const progress = useMemo(() => derivePlaybookProgress(entries), [entries])
  const activePlaybook = progress.playbook

  async function selectPlaybook(playbookId: PlaybookId) {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      await recordIncidentActivity({ incidentId, actorId: user.id, action: 'playbook_selected', details: { playbook_id: playbookId } })
      setCompletionOverrides({})
      onChanged()
    } catch {
      setError('The playbook selection could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleStep(stepId: string, completed: boolean) {
    if (!user || !progress.playbook) return
    setBusy(true)
    setError('')
    try {
      await recordIncidentActivity({ incidentId, actorId: user.id, action: 'playbook_step_toggled', details: { playbook_id: progress.playbook.id, step_id: stepId, completed } })
      setCompletionOverrides((current) => ({ ...current, [`${progress.playbook!.id}:${stepId}`]: completed }))
      onChanged()
    } catch {
      setError('Checklist progress could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="incident-playbook-title" className="space-y-3 rounded-md border border-border-panel bg-bg-surface p-3">
      <header className="flex items-center gap-2">
        <ClipboardCheck aria-hidden="true" className="size-4 text-accent-primary" />
        <div><h3 className="text-xs font-semibold" id="incident-playbook-title">Response playbook</h3><p className="text-[10px] text-text-tertiary">Analyst-guided checklist aligned to NIST SP 800-61 Rev. 3.</p></div>
      </header>
      <label className="block space-y-1 text-xs font-medium" htmlFor="incident-playbook-select">
        Playbook
        <select className="h-9 w-full rounded-md border border-border-default bg-bg-input px-3 text-xs" disabled={busy} id="incident-playbook-select" onChange={(event) => { if (event.target.value) void selectPlaybook(event.target.value as PlaybookId) }} value={progress.playbook?.id ?? ''}>
          <option value="">Choose a playbook…</option>
          {incidentPlaybooks.map((playbook) => <option key={playbook.id} value={playbook.id}>{playbook.title}</option>)}
        </select>
      </label>
      {activePlaybook && <>
        <p className="text-xs text-text-secondary">{activePlaybook.description}</p>
        <ol className="space-y-2">
          {activePlaybook.steps.map((step) => <li className="rounded border border-border-subtle p-2" key={step.id}>
            <label className="flex cursor-pointer items-start gap-2 text-xs">
              <input checked={completionOverrides[`${activePlaybook.id}:${step.id}`] ?? progress.completed[step.id] ?? false} className="mt-0.5 size-4 accent-[var(--accent-primary)]" disabled={busy} onChange={(event) => void toggleStep(step.id, event.target.checked)} type="checkbox" />
              <span><span className="mb-0.5 block font-mono text-[9px] uppercase tracking-wide text-text-tertiary">{step.function}</span>{step.title}</span>
            </label>
          </li>)}
        </ol>
        <p className="text-[10px] text-text-tertiary">Checklist entries are recorded in the incident timeline. Adapt them to your organization; no containment or recovery action is executed automatically.</p>
      </>}
      {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-xs" role="alert">{error}</p>}
    </section>
  )
}
