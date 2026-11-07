import { withSupabase } from 'npm:@supabase/server@1'
import { parseEventIngestPayload, type NormalizedIngestEvent } from '../_shared/ingest-events.ts'

const maxBodyBytes = 1_048_576
const maxBatchSize = 100

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status })
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return bytesToHex(new Uint8Array(digest))
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function readLimitedBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > maxBodyBytes) return null
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBodyBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

const handler = withSupabase({ auth: 'none' }, async (request, context) => {
  if (request.method !== 'POST') return jsonError('Method not allowed.', 405)
  // Supabase's gateway reserves Authorization for its own JWT/API-key auth.
  // Keep the workspace credential in a separate header so it can be combined
  // with the project's public `apikey` header by external senders.
  const match = request.headers.get('x-ingest-token')?.trim().match(/^(sb_ingest_[0-9a-f]{64})$/i)
  if (!match) return jsonError('A valid X-Ingest-Token header is required.', 401)

  let body: string | null
  try { body = await readLimitedBody(request) } catch { return jsonError('Request body must be valid UTF-8.', 400) }
  if (body === null) return jsonError(`Request body exceeds ${maxBodyBytes} bytes.`, 413)
  if (!body.trim()) return jsonError('Request body is empty.', 400)

  const tokenHash = await sha256(match[1])
  const { data: quotaRows, error: quotaError } = await context.supabaseAdmin.rpc('consume_event_ingest_quota', { p_token_hash: tokenHash })
  if (quotaError) {
    console.error('ingest-event: token validation failed', quotaError.code ?? 'database_error')
    return jsonError('Token validation is unavailable.', 503)
  }
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows
  if (!quota?.owner_id) return jsonError('Invalid, expired, or revoked ingest token.', 401)
  if (!quota.allowed) return jsonError('Token rate limit exceeded (60 requests per minute).', 429)

  const parsed = parseEventIngestPayload(body)
  if (parsed.events.length === 0) return jsonError('No valid events found. Supported formats are normalized JSON, Suricata EVE, Wazuh, CEF, and RFC 5424 syslog.', 422)
  if (parsed.events.length > maxBatchSize) return jsonError(`A request may contain at most ${maxBatchSize} events.`, 413)

  const rows = await Promise.all(parsed.events.map(async (event: NormalizedIngestEvent) => {
    const sourceEventId = event.external_id ?? `sha256:${await sha256(stableJson(event.raw_data))}`
    return {
      user_id: quota.owner_id,
      source: 'webhook',
      external_id: `${quota.token_id}:${sourceEventId}`,
      severity: event.severity,
      category: event.category,
      title: event.title,
      description: event.description,
      raw_data: event.raw_data,
      source_ip: event.source_ip,
      dest_ip: event.dest_ip,
      hostname: event.hostname,
      event_time: event.event_time,
      is_sample: false,
    }
  }))

  const { data, error } = await context.supabaseAdmin.from('events')
    .upsert(rows, { onConflict: 'user_id,source,external_id', ignoreDuplicates: true })
    .select('id')
  if (error) {
    console.error('ingest-event: event persistence failed', error.code ?? 'database_error')
    return jsonError('Events could not be saved.', 500)
  }
  return Response.json({
    accepted: data?.length ?? 0,
    duplicates: rows.length - (data?.length ?? 0),
    invalid_count: parsed.invalidCount,
    format: parsed.format,
  }, { status: 202 })
})

export default { fetch: handler }
