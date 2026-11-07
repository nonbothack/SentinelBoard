type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'
type EventCategory = 'authentication' | 'network' | 'malware' | 'policy' | 'system' | 'application'
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface NormalizedIngestEvent {
  external_id: string | null
  severity: Severity
  category: EventCategory | null
  title: string
  description: string | null
  raw_data: Json
  source_ip: string | null
  dest_ip: string | null
  hostname: string | null
  event_time: string
}

export interface EventIngestParseResult {
  events: NormalizedIngestEvent[]
  invalidCount: number
  format: 'json' | 'cef' | 'syslog'
}

const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info']
const categories: EventCategory[] = ['authentication', 'network', 'malware', 'policy', 'system', 'application']

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
}

function boundedString(value: unknown, maximum: number) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, maximum) : null
}

function severityFrom(value: unknown, fallback: Severity = 'info'): Severity {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (severities.includes(normalized as Severity)) return normalized as Severity
    const numeric = Number(normalized)
    if (Number.isFinite(numeric)) return numeric >= 8 ? 'critical' : numeric >= 5 ? 'high' : numeric >= 3 ? 'medium' : numeric > 0 ? 'low' : 'info'
    if (['emergency', 'alert', 'fatal', 'error'].includes(normalized)) return normalized === 'error' ? 'high' : 'critical'
    if (['warning', 'warn'].includes(normalized)) return 'medium'
    if (['notice', 'debug', 'informational'].includes(normalized)) return normalized === 'informational' ? 'info' : 'low'
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value >= 8 ? 'critical' : value >= 5 ? 'high' : value >= 3 ? 'medium' : value > 0 ? 'low' : 'info'
  return fallback
}

function categoryFrom(value: unknown, title: string): EventCategory | null {
  const text = `${typeof value === 'string' ? value : ''} ${title}`.toLowerCase()
  if (categories.includes((typeof value === 'string' ? value.toLowerCase() : '') as EventCategory)) return (value as string).toLowerCase() as EventCategory
  if (/auth|login|logon|credential|password|brute.?force/.test(text)) return 'authentication'
  if (/network|connection|traffic|firewall|dns|flow|port scan/.test(text)) return 'network'
  if (/malware|ransom|virus|trojan|exploit|cve-\d{4}-\d+/.test(text)) return 'malware'
  if (/policy|blocked|denied|compliance/.test(text)) return 'policy'
  if (/application|http|web|api|service/.test(text)) return 'application'
  if (/system|kernel|process|host|agent/.test(text)) return 'system'
  return null
}

function validIP(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
  const octets = candidate.split('.')
  if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part) && (part.length === 1 || !part.startsWith('0')) && Number(part) <= 255)) return candidate
  if (!candidate.includes(':') || candidate.includes('%')) return null
  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname
    return hostname.startsWith('[') && hostname.endsWith(']') ? candidate : null
  } catch {
    return null
  }
}

function validTimestamp(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return new Date().toISOString()
  const timestamp = typeof value === 'number' ? new Date(value < 100_000_000_000 ? value * 1000 : value).getTime() : Date.parse(value)
  if (!Number.isFinite(timestamp) || timestamp < Date.UTC(2000, 0, 1) || timestamp > Date.now() + 366 * 24 * 60 * 60 * 1000) return new Date().toISOString()
  return new Date(timestamp).toISOString()
}

function asJson(value: unknown): Json {
  try { return JSON.parse(JSON.stringify(value)) as Json } catch { return null }
}

function normalizeRecord(input: unknown): NormalizedIngestEvent | null {
  const row = object(input)
  if (!row) return null
  const wazuhData = object(row.data) ?? {}
  const wazuhRule = object(row.rule) ?? object(row.alert) ?? {}
  const wazuhAgent = object(row.agent) ?? {}
  const title = firstString(row.title, row.name, row.message, row.signature, wazuhRule.description, wazuhRule.signature, row.event_type, row.action, row.msg)
  if (!title) return null
  const alertSeverity = row.alert && typeof wazuhRule.severity === 'number'
    ? (wazuhRule.severity <= 1 ? 'high' : wazuhRule.severity === 2 ? 'medium' : 'low')
    : undefined
  const severityValue = row.severity ?? row.level ?? wazuhRule.level ?? alertSeverity ?? wazuhRule.severity ?? (object(wazuhRule.severity)?.level)
  const sourceIp = validIP(row.source_ip ?? row.src_ip ?? row.src ?? wazuhData.srcip ?? row.client_ip)
  const destIp = validIP(row.dest_ip ?? row.dst_ip ?? row.destination_ip ?? row.dest ?? wazuhData.dstip ?? row.server_ip)
  const hostname = boundedString(row.hostname ?? row.host ?? wazuhAgent.name ?? row.computer, 253)
  const timestamp = row.event_time ?? row.timestamp ?? row['@timestamp'] ?? row.time
  const externalId = boundedString(row.external_id ?? row.event_id ?? row.id, 200)
  const description = boundedString(row.description ?? row.details ?? row.msg ?? row.message, 4000)
  return {
    external_id: externalId,
    severity: severityFrom(severityValue),
    category: categoryFrom(row.category ?? wazuhRule.category ?? row.event_type, `${title} ${description ?? ''}`),
    title: title.slice(0, 250),
    description,
    raw_data: asJson(input),
    source_ip: sourceIp,
    dest_ip: destIp,
    hostname,
    event_time: validTimestamp(timestamp),
  }
}

function parseCEFLine(line: string): NormalizedIngestEvent | null {
  const cefIndex = line.indexOf('CEF:')
  if (cefIndex < 0) return null
  const fields: string[] = []
  let currentField = ''
  const rawFields = line.slice(cefIndex + 4)
  for (let index = 0; index < rawFields.length; index += 1) {
    const character = rawFields[index]
    if (character === '\\' && index + 1 < rawFields.length) {
      currentField += character + rawFields[index + 1]
      index += 1
    } else if (character === '|') {
      fields.push(currentField)
      currentField = ''
    } else {
      currentField += character
    }
  }
  fields.push(currentField)
  if (fields.length < 7) return null
  const [version, vendor, product, deviceVersion, signatureId, rawName, cefSeverity, ...extensionParts] = fields
  if (!/^\d{1,2}$/.test(version)) return null
  const name = rawName.replaceAll('\\|', '|').replaceAll('\\\\', '\\')
  const extension = extensionParts.join('|')
  const values: Record<string, string> = {}
  for (const match of extension.matchAll(/(?:^|\s)(src|dst|shost|dhost|externalId|rt|cs1|cs2|msg)=((?:\\.|[^\s])*)/g)) {
    values[match[1]] = match[2].replaceAll('\\=', '=').replaceAll('\\\\', '\\')
  }
  const date = values.rt ? (/^\d{13}$/.test(values.rt) ? Number(values.rt) : values.rt) : undefined
  return normalizeRecord({
    external_id: values.externalId,
    title: name || `${vendor} ${product} ${signatureId}`,
    description: values.msg || `${vendor} ${product} ${deviceVersion}`,
    severity: (() => { const score = Number(cefSeverity); return Number.isFinite(score) ? score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low' : cefSeverity })(),
    category: values.cs1,
    source_ip: values.src,
    dest_ip: values.dst,
    hostname: values.shost || values.dhost,
    event_time: date,
    raw: line,
  })
}

function parseSyslogLine(line: string): NormalizedIngestEvent | null {
  const match = line.match(/^<([0-9]{1,3})>1\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(?:\[.*?\]|-)\s*(.*)$/)
  if (!match) return null
  const priority = Number(match[1])
  const [timestamp, hostname, appName, procId, messageId, message] = match.slice(2)
  const syslogSeverity: Severity[] = ['critical', 'critical', 'critical', 'high', 'medium', 'low', 'info', 'info']
  return normalizeRecord({
    title: `${appName}${messageId !== '-' ? ` · ${messageId}` : ''}`,
    description: message || null,
    severity: syslogSeverity[priority % 8],
    hostname: hostname === '-' ? null : hostname,
    event_time: timestamp,
    raw: line,
    process_id: procId,
  })
}

export function parseEventIngestPayload(content: string): EventIngestParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    let sawCEF = false
    let sawSyslog = false
    const results = lines.map((line) => {
      try { return normalizeRecord(JSON.parse(line)) } catch { /* Parse a supported line-oriented text format. */ }
      if (line.includes('CEF:')) { sawCEF = true; return parseCEFLine(line) }
      sawSyslog = true
      return parseSyslogLine(line)
    })
    const events = results.filter((item): item is NormalizedIngestEvent => Boolean(item))
    const format = sawCEF && !sawSyslog ? 'cef' : sawSyslog && !sawCEF ? 'syslog' : 'json'
    return { events, invalidCount: results.length - events.length, format }
  }

  const root = object(parsed)
  const records = Array.isArray(parsed) ? parsed : Array.isArray(root?.events) ? root.events : [parsed]
  const events = records.map(normalizeRecord).filter((item): item is NormalizedIngestEvent => Boolean(item))
  return { events, invalidCount: records.length - events.length, format: 'json' }
}
