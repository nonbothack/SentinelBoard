import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CommandBar } from '@/components/CommandBar'
import { supabase } from '@/lib/supabase'
import { validateIOC } from '@/lib/validators/ioc'
import type { IOC, IOCEnrichment, IOCType, Severity } from '@/types/database'

export interface EnrichmentResponse {
  cached: boolean
  cachedHoursAgo?: number
  ioc: IOC
  enrichments: IOCEnrichment[]
  suggestedSeverity: Severity
  allProvidersFailed: boolean
  message?: string
}

interface IOCFormProps {
  onEnriched?: (result: EnrichmentResponse) => void
}

const iocTypes: Array<{ value: IOCType; label: string }> = [
  { value: 'ip', label: 'IP' },
  { value: 'domain', label: 'Domain' },
  { value: 'url', label: 'URL' },
  { value: 'hash_md5', label: 'MD5' },
  { value: 'hash_sha256', label: 'SHA256' },
]

export function IOCForm({ onEnriched }: IOCFormProps) {
  const [type, setType] = useState<IOCType>('ip')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [overridePrivate, setOverridePrivate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  function resetValidation() {
    setError('')
    setWarning('')
    setOverridePrivate(false)
    setMessage('')
  }

  async function submitIOC(rawValue: string) {
    resetValidation()
    const result = validateIOC(type, rawValue)
    if (!result.valid) {
      setError(result.error)
      return
    }

    if (result.requiresOverride && !overridePrivate) {
      setWarning(result.warning ?? 'This IP is private or reserved. Confirm before continuing.')
      return
    }

    if (result.warning) setWarning(result.warning)
    setSubmitting(true)
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('enrich-ioc', {
        body: { type, value: result.normalizedValue, force: false },
      })
      if (invokeError || !data || typeof data !== 'object' || !('ioc' in data)) {
        setError('The enrichment request could not be completed. Check the connection and try again.')
        return
      }
      setValue(result.normalizedValue)
      const response = data as EnrichmentResponse
      setMessage(response.cached
        ? 'Showing cached enrichment results.'
        : 'Enrichment request completed.')
      onEnriched?.(response)
    } catch {
      setError('The enrichment request could not be completed. Check the connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const leadingSlot = (
    <Select
      onValueChange={(nextType) => {
        setType(nextType as IOCType)
        resetValidation()
      }}
      value={type}
    >
      <SelectTrigger aria-label="IOC type" className="h-8 w-28 shrink-0 bg-bg-input">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {iocTypes.map((option) => (
          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="shrink-0 border-b border-border-panel">
      <CommandBar
        ariaLabel="Indicator of compromise value"
        disabled={submitting}
        leadingSlot={leadingSlot}
        onSubmit={(nextValue) => void submitIOC(nextValue)}
        onValueChange={(nextValue) => {
          setValue(nextValue)
          resetValidation()
        }}
        placeholder="Enter IOC value and press Enter..."
        showSearchIcon={false}
        trailingSlot={<Button disabled={submitting} size="sm" type="submit">{submitting ? 'Checking…' : 'Enrich'}</Button>}
        value={value}
      />
      {(error || warning || message) && (
        <div className="space-y-2 px-4 py-2">
          {error && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-sm text-text-primary" role="alert">{error}</p>}
          {warning && <p className="border-l-4 border-severity-medium bg-bg-secondary p-2 text-sm text-text-primary" role="status">{warning}</p>}
          {warning && warning.includes('private or reserved') && (
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input
                checked={overridePrivate}
                className="mt-0.5 size-4 rounded border border-border-default accent-[var(--accent-primary)]"
                onChange={(event) => setOverridePrivate(event.target.checked)}
                type="checkbox"
              />
              <span>I understand and want to continue with this private or reserved IP.</span>
            </label>
          )}
          {message && <p className="text-xs text-status-success" role="status">{message}</p>}
        </div>
      )}
    </div>
  )
}
