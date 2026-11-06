import { useState } from 'react'
import { toast } from 'sonner'
import { TechniqueSearch } from '@/components/attack/TechniqueSearch'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import type { BundledAttackTechnique } from '@/lib/attack'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

export function TechniqueTagButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const { user } = useAuth()
  const queryClient = useQueryClient()

  async function tagTechnique(technique: BundledAttackTechnique) {
    if (!user) return
    setErrorMessage('')
    setSaving(true)
    const { error } = await supabase.from('event_techniques').upsert({
      event_id: eventId,
      technique_id: technique.id,
      confidence: 'confirmed',
      assigned_by: user.id,
    }, { onConflict: 'event_id,technique_id' })
    setSaving(false)
    if (error) {
      setErrorMessage('The ATT&CK technique could not be tagged. Try again.')
      return
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['event-techniques', eventId] }),
      queryClient.invalidateQueries({ queryKey: ['attack-observations', user.id] }),
    ])
    setOpen(false)
    toast.success(`${technique.id} ${technique.name} tagged to this event.`)
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => setOpen((value) => !value)} size="sm" variant="outline" aria-expanded={open}>
        {open ? 'Close technique search' : 'Tag ATT&CK technique'}
      </Button>
      {errorMessage && <p className="border-l-4 border-severity-critical bg-bg-secondary p-2 text-xs" role="alert">{errorMessage}</p>}
      {open && <TechniqueSearch disabled={saving} onSelect={(technique) => void tagTechnique(technique)} />}
    </div>
  )
}
