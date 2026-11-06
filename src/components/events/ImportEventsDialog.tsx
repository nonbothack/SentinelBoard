import { useState } from 'react'
import { toast } from 'sonner'
import sampleEvents from '@/data/sample-events.json'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { parseEventsJSON } from '@/lib/parsers/events'
import { supabase } from '@/lib/supabase'

interface ImportEventsDialogProps {
  onImported: () => void
}

export function ImportEventsDialog({ onImported }: ImportEventsDialogProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const { user } = useAuth()

  async function saveEvents(content: string, sample: boolean) {
    if (!user) {
      setError('Sign in before importing events.')
      return
    }
    const parsed = parseEventsJSON(content)
    if (parsed.events.length === 0) {
      setError('No valid events found in the selected data.')
      return
    }
    const rows = parsed.events.map((event) => ({ ...event, user_id: user.id, is_sample: sample }))
    const { error: insertError } = await supabase.from('events').insert(rows)
    if (insertError) throw insertError
    onImported()
    setOpen(false)
    setFile(null)
    setError('')
    if (parsed.invalidCount > 0 || parsed.warningCount > 0) {
      toast.warning(`Imported ${rows.length} events. ${parsed.invalidCount} invalid events skipped; ${parsed.warningCount} fields normalized.`)
    } else {
      toast.success(`Imported ${rows.length} ${sample ? 'sample ' : ''}events.`)
    }
  }

  async function loadSampleData() {
    setBusy(true)
    setError('')
    try {
      const { count, error: lookupError } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('is_sample', true)
      if (lookupError) throw lookupError
      if ((count ?? 0) > 0) {
        toast.info('Sample data is already loaded in this account.')
        setOpen(false)
        return
      }
      await saveEvents(JSON.stringify(sampleEvents), true)
    } catch {
      setError('Sample events could not be saved. Check the connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function importFile() {
    if (!file) {
      setError('Choose a JSON file first.')
      return
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Choose a .json file containing an array of event objects.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const content = await file.text()
      await saveEvents(content, false)
    } catch (cause) {
      const message = cause instanceof Error && cause.message.startsWith('Unable to parse')
        ? cause.message
        : 'Events could not be imported. Check the file and try again.'
      setError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); setError('') }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">Import</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import security events</DialogTitle>
          <DialogDescription>Load clearly marked fictional sample telemetry or import a JSON array of events. Imported records are private to your account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border-default bg-bg-secondary p-3">
            <p className="text-sm font-medium">SAMPLE DATA</p>
            <p className="mt-1 text-xs text-text-secondary">200 fictional events using documentation-only IP addresses. These are not real telemetry.</p>
            <Button className="mt-3" disabled={busy} onClick={() => void loadSampleData()} size="sm" type="button">{busy ? 'Loading…' : 'Load sample data'}</Button>
          </div>
          <label className="block space-y-2 text-sm font-medium" htmlFor="events-json-file">
            Import JSON file
            <input
              accept=".json,application/json"
              className="block w-full rounded-md border border-border-default bg-bg-input p-2 text-xs file:mr-3 file:rounded file:border-0 file:bg-bg-tertiary file:px-2 file:py-1 file:text-text-primary"
              id="events-json-file"
              onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError('') }}
              type="file"
            />
          </label>
          {file && <p className="font-mono text-xs text-text-secondary">{file.name}</p>}
        </div>
        {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm" role="alert">{error}</p>}
        <DialogFooter>
          <Button disabled={busy || !file} onClick={() => void importFile()} size="sm">{busy ? 'Importing…' : 'Import JSON'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
