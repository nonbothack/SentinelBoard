import { describe, expect, it } from 'vitest'
import { derivePlaybookProgress } from '@/lib/incident-playbooks'
import type { TimelineEntry } from '@/lib/incidents'
import type { Json } from '@/types/database'

function entry(id: string, action: string, details: Record<string, unknown>): TimelineEntry {
  return { id, incident_id: 'incident-1', actor_id: 'user-1', action, details: details as Json, created_at: `2026-01-01T00:00:0${id}Z` }
}

describe('derivePlaybookProgress', () => {
  it('reconstructs the selected playbook and latest per-step state from the append-only timeline', () => {
    const progress = derivePlaybookProgress([
      entry('1', 'playbook_selected', { playbook_id: 'ransomware' }),
      entry('2', 'playbook_step_toggled', { playbook_id: 'ransomware', step_id: 'scope', completed: true }),
      entry('3', 'playbook_step_toggled', { playbook_id: 'ransomware', step_id: 'scope', completed: false }),
      entry('4', 'playbook_step_toggled', { playbook_id: 'ransomware', step_id: 'unknown', completed: true }),
    ])
    expect(progress.playbook?.id).toBe('ransomware')
    expect(progress.completed.scope).toBe(false)
    expect(progress.completed.unknown).toBeUndefined()
  })

  it('starts a new checklist when the selected playbook changes', () => {
    const progress = derivePlaybookProgress([
      entry('1', 'playbook_selected', { playbook_id: 'phishing' }),
      entry('2', 'playbook_step_toggled', { playbook_id: 'phishing', step_id: 'scope', completed: true }),
      entry('3', 'playbook_selected', { playbook_id: 'account-compromise' }),
    ])
    expect(progress.playbook?.id).toBe('account-compromise')
    expect(progress.completed).toEqual({})
  })
})
