import { validateIOC } from '@/lib/validators/ioc'
import type { EventCategory, EventSource, Json, Severity } from '@/types/database'

export interface NormalizedEvent {
  source: EventSource
  severity: Severity
  category: EventCategory | null
  title: string
  description: string | null
  raw_data: Json | null
  source_ip: string | null
  dest_ip: string | null
  hostname: string | null
  event_time: string
}

export interface EventNormalizationResult {
  event: NormalizedEvent | null
  warnings: string[]
  error?: string
}

const sources: EventSource[] = ['syslog', 'windows_event', 'firewall', 'ids', 'manual', 'sample_dataset', 'webhook']
const categories: EventCategory[] = ['authentication', 'network', 'malware', 'policy', 'system', 'application']
const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function validJson(value: unknown): Json | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((item) => validJson(item) ?? null)
  if (isRecord(value)) {
    const result: Record<string, Json> = {}
    for (const [key, item] of Object.entries(value)) result[key] = validJson(item) ?? null
    return result
  }
  return null
}

function normalizeIP(value: unknown, field: string, warnings: string[]) {
  if (value === undefined || value === null || value === '') return null
  const candidate = text(value)
  if (!candidate || !validateIOC('ip', candidate).valid) {
    warnings.push(`${field} was not a valid IP address and was skipped.`)
    return null
  }
  return candidate
}

export function normalizeEvent(rawEvent: unknown, now = new Date()): EventNormalizationResult {
  if (!isRecord(rawEvent)) return { event: null, warnings: [], error: 'Event must be a JSON object.' }
  const warnings: string[] = []
  const title = text(rawEvent.title)
  if (!title) return { event: null, warnings, error: 'Event title is required.' }

  const sourceValue = text(rawEvent.source)
  const source = sources.includes(sourceValue as EventSource) ? sourceValue as EventSource : 'manual'
  if (sourceValue && source !== sourceValue) warnings.push('Unknown event source was replaced with manual.')

  const severityValue = text(rawEvent.severity).toLowerCase()
  const severity = severities.includes(severityValue as Severity) ? severityValue as Severity : 'info'
  if (!severityValue || severity !== severityValue) warnings.push('Missing or unknown severity defaulted to info.')

  const categoryValue = text(rawEvent.category).toLowerCase()
  const category = categories.includes(categoryValue as EventCategory) ? categoryValue as EventCategory : null
  if (categoryValue && !category) warnings.push('Unknown event category was skipped.')

  const eventTimeValue = text(rawEvent.event_time)
  const parsedTime = eventTimeValue ? new Date(eventTimeValue) : now
  const validTime = Number.isFinite(parsedTime.getTime())
  const eventTime = validTime ? parsedTime : now
  if (!validTime) warnings.push('Invalid event timestamp was replaced with the import time.')
  if (eventTime.getTime() > now.getTime()) warnings.push('Event timestamp is in the future.')

  const rawData = rawEvent.raw_data === undefined ? rawEvent : rawEvent.raw_data
  return {
    event: {
      source,
      severity,
      category,
      title: title.slice(0, 200),
      description: text(rawEvent.description) || null,
      raw_data: validJson(rawData),
      source_ip: normalizeIP(rawEvent.source_ip, 'Source IP', warnings),
      dest_ip: normalizeIP(rawEvent.dest_ip, 'Destination IP', warnings),
      hostname: text(rawEvent.hostname) || null,
      event_time: eventTime.toISOString(),
    },
    warnings,
  }
}

export function parseEventsJSON(content: string, now = new Date()) {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('Unable to parse file. Ensure it contains valid JSON.')
  }
  if (!Array.isArray(parsed)) throw new Error('Event JSON must contain an array of event objects.')

  const events: NormalizedEvent[] = []
  let invalidCount = 0
  let warningCount = 0
  for (const item of parsed) {
    const normalized = normalizeEvent(item, now)
    if (!normalized.event) {
      invalidCount += 1
      continue
    }
    events.push(normalized.event)
    warningCount += normalized.warnings.length
  }
  return { events, invalidCount, warningCount, total: parsed.length }
}
