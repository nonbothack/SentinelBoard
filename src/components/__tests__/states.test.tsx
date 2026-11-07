import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EventList } from '@/components/events/EventList'
import { StatCard } from '@/components/dashboard/StatCard'
import type { Event } from '@/types/database'
import { Activity } from 'lucide-react'

const event: Event = {
  id: '11111111-1111-4111-8111-111111111111',
  user_id: '22222222-2222-4222-8222-222222222222',
  source: 'manual',
  severity: 'critical',
  category: 'system',
  title: 'Suspicious service activity',
  description: null,
  raw_data: null,
  external_id: null,
  source_ip: null,
  dest_ip: null,
  hostname: null,
  event_time: '2026-01-01T10:00:00.000Z',
  is_sample: false,
  created_at: '2026-01-01T10:01:00.000Z',
  updated_at: '2026-01-01T10:01:00.000Z',
}

describe('workbench component states', () => {
  it('renders the event list loading skeleton', () => {
    render(<EventList events={[]} loading error={false} onRetry={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByLabelText('Loading security events')).toBeTruthy()
  })

  it('renders an inline error and invokes retry for the event list', () => {
    const onRetry = vi.fn()
    render(<EventList events={[]} loading={false} error onRetry={onRetry} onSelect={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByRole('alert').textContent).toContain('Events could not be loaded.')
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders an actionable empty event state and a populated event row', () => {
    render(<EventList events={[]} loading={false} error={false} onRetry={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText('No security events yet.')).toBeTruthy()
    expect(screen.getByText(/Import a JSON event file/)).toBeTruthy()
    render(<EventList events={[event]} loading={false} error={false} onRetry={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText('Suspicious service activity')).toBeTruthy()
  })

  it('renders StatCard loading, unavailable, and populated values', () => {
    const loading = render(<StatCard icon={Activity} label="Events" loading />)
    expect(screen.getByLabelText('Events')).toBeTruthy()
    expect(loading.container.querySelector('.animate-pulse')).toBeTruthy()
    loading.rerender(<StatCard icon={Activity} label="Events" error />)
    expect(screen.getByLabelText('Unavailable')).toBeTruthy()
    loading.rerender(<StatCard icon={Activity} label="Events" value={42} />)
    expect(screen.getByText('42')).toBeTruthy()
  })
})
