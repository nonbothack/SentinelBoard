import { withSupabase } from 'npm:@supabase/server@1'
import { calculateSeverity } from '../_shared/severity.ts'

type IOCType = 'ip' | 'domain' | 'url' | 'hash_md5' | 'hash_sha256'
type Provider = 'virustotal' | 'abuseipdb' | 'otx'
type EnrichmentStatus = 'pending' | 'success' | 'error' | 'rate_limited' | 'not_found'

interface IOCInput {
  type: IOCType
  value: string
  force?: boolean
}

interface ProviderOutcome {
  provider: Provider
  status: EnrichmentStatus
  rawResponse: unknown | null
  summary: Record<string, unknown> | null
  errorMessage: string | null
}

interface Stats {
  malicious: number
  suspicious: number
  harmless: number
  undetected: number
  total_engines: number
  detection_ratio: string
  reputation: number
}

class ProviderError extends Error {
  constructor(
    readonly status: EnrichmentStatus,
    message: string,
    readonly rawResponse: unknown | null = null,
  ) {
    super(message)
  }
}

const rateLimit = new Map<string, number[]>()
const maxRequestsPerMinute = 10
const windowMs = 60_000
const requestTimeoutMs = 10_000
const knownProviders: Provider[] = ['virustotal', 'abuseipdb', 'otx']

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status })
}

function permitRequest(userId: string) {
  const now = Date.now()
  const recent = (rateLimit.get(userId) ?? []).filter((time) => now - time < windowMs)
  if (recent.length >= maxRequestsPerMinute) {
    rateLimit.set(userId, recent)
    return false
  }
  recent.push(now)
  rateLimit.set(userId, recent)
  return true
}

function parseIPv4(value: string) {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith('0'))) return Number.NaN
    const number = Number(part)
    return number <= 255 ? number : Number.NaN
  })
  return octets.every(Number.isInteger) ? octets : null
}

function isValidIPv6(value: string) {
  if (!value.includes(':') || value.includes('%')) return false
  try {
    const parsed = new URL(`http://[${value}]/`)
    return parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
  } catch {
    return false
  }
}

function validateInput(type: unknown, rawValue: unknown): { type: IOCType; value: string } | { error: string } {
  const allowedTypes: IOCType[] = ['ip', 'domain', 'url', 'hash_md5', 'hash_sha256']
  if (typeof type !== 'string' || !allowedTypes.includes(type as IOCType)) return { error: 'Unsupported IOC type.' }
  if (typeof rawValue !== 'string' || !rawValue.trim()) return { error: 'IOC value is required.' }

  const selectedType = type as IOCType
  const value = rawValue.trim()

  if (selectedType === 'ip') {
    if (!parseIPv4(value) && !isValidIPv6(value)) return { error: 'Enter a valid IPv4 or IPv6 address.' }
    return { type: selectedType, value: value.toLowerCase() }
  }

  if (selectedType === 'domain') {
    const normalized = value.replace(/^https?:\/\//i, '').toLowerCase().replace(/\.$/, '')
    const labels = normalized.split('.')
    const validDomain = normalized.length <= 253 && labels.length >= 2 && labels.every((label) =>
      label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    ) && labels[labels.length - 1].length >= 2
    if (!validDomain) return { error: 'Enter a valid domain name.' }
    return { type: selectedType, value: normalized }
  }

  if (selectedType === 'url') {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
      return { error: 'Use an HTTP or HTTPS URL.' }
    }
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value.replace(/^\/\//, '')}`
    try {
      const parsed = new URL(candidate)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
        return { error: 'Enter a valid HTTP or HTTPS URL.' }
      }
      return { type: selectedType, value: parsed.toString() }
    } catch {
      return { error: 'Enter a valid HTTP or HTTPS URL.' }
    }
  }

  const expectedLength = selectedType === 'hash_md5' ? 32 : 64
  if (value.length !== expectedLength || !/^[\da-f]+$/i.test(value)) {
    return { error: `${selectedType === 'hash_md5' ? 'MD5' : 'SHA-256'} hashes must contain exactly ${expectedLength} hexadecimal characters.` }
  }
  return { type: selectedType, value: value.toLowerCase() }
}

function providersFor(type: IOCType): Provider[] {
  if (type === 'ip') return knownProviders
  if (type === 'url') return ['virustotal']
  return ['virustotal', 'otx']
}

function missingKeys(providers: Provider[]) {
  const variables: Record<Provider, string> = {
    virustotal: 'VT_API_KEY',
    abuseipdb: 'ABUSEIPDB_API_KEY',
    otx: 'OTX_API_KEY',
  }
  return providers.map((provider) => variables[provider]).filter((name) => !Deno.env.get(name))
}

async function fetchJson(url: string, init: RequestInit, deadline: number): Promise<any> {
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) throw new ProviderError('error', 'Request timed out')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), remainingMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const bodyText = await response.text()
    let raw: unknown = null
    if (bodyText) {
      try {
        raw = JSON.parse(bodyText)
      } catch {
        throw new ProviderError('error', 'Provider returned an unreadable response.')
      }
    }

    if (response.status === 429) throw new ProviderError('rate_limited', 'Rate limited — try again in 60 seconds.', raw)
    if (response.status === 404) throw new ProviderError('not_found', 'No public data found for this IOC.', raw)
    if (!response.ok) {
      const message = response.status >= 500
        ? `Provider returned HTTP ${response.status}.`
        : `Provider request failed with HTTP ${response.status}.`
      throw new ProviderError('error', message, raw)
    }
    return raw
  } catch (error) {
    if (error instanceof ProviderError) throw error
    if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new ProviderError('error', 'Request timed out')
    }
    throw new ProviderError('error', 'Provider request failed.')
  } finally {
    clearTimeout(timer)
  }
}

function summarizeVirusTotal(attributes: Record<string, any>): Stats {
  const source = attributes.last_analysis_stats ?? attributes.stats ?? {}
  const malicious = Number(source.malicious ?? 0)
  const suspicious = Number(source.suspicious ?? 0)
  const harmless = Number(source.harmless ?? 0)
  const undetected = Number(source.undetected ?? 0)
  const timeout = Number(source.timeout ?? 0)
  const total = malicious + suspicious + harmless + undetected + timeout
  return {
    malicious,
    suspicious,
    harmless,
    undetected,
    total_engines: total,
    detection_ratio: `${malicious}/${total}`,
    reputation: Number(attributes.reputation ?? 0),
  }
}

async function fetchVirusTotal(input: IOCInput): Promise<ProviderOutcome> {
  const key = Deno.env.get('VT_API_KEY')!
  const deadline = Date.now() + requestTimeoutMs
  const headers = { 'x-apikey': key, accept: 'application/json' }

  if (input.type === 'url') {
    const submitted = await fetchJson('https://www.virustotal.com/api/v3/urls', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: input.value }),
    }, deadline)
    const analysisId = submitted?.data?.id
    if (typeof analysisId !== 'string' || !analysisId) {
      throw new ProviderError('error', 'VirusTotal did not return an analysis ID.', submitted)
    }

    let analysis: any = null
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 800 : 1600))
      analysis = await fetchJson(`https://www.virustotal.com/api/v3/analyses/${encodeURIComponent(analysisId)}`, {
        method: 'GET',
        headers,
      }, deadline)
      if (analysis?.data?.attributes?.status === 'completed') break
    }

    const attributes = analysis?.data?.attributes ?? {}
    if (attributes.status !== 'completed') {
      return {
        provider: 'virustotal',
        status: 'pending',
        rawResponse: { submission: submitted, analysis },
        summary: null,
        errorMessage: 'Analysis is still processing. Try again shortly.',
      }
    }

    return {
      provider: 'virustotal',
      status: 'success',
      rawResponse: { submission: submitted, analysis },
      summary: summarizeVirusTotal(attributes),
      errorMessage: null,
    }
  }

  const endpointType = input.type === 'ip'
    ? 'ip_addresses'
    : input.type === 'domain'
      ? 'domains'
      : 'files'
  const raw = await fetchJson(`https://www.virustotal.com/api/v3/${endpointType}/${encodeURIComponent(input.value)}`, {
    method: 'GET',
    headers,
  }, deadline)
  const attributes = raw?.data?.attributes ?? {}
  return {
    provider: 'virustotal',
    status: 'success',
    rawResponse: raw,
    summary: summarizeVirusTotal(attributes),
    errorMessage: null,
  }
}

async function fetchAbuseIPDB(input: IOCInput): Promise<ProviderOutcome> {
  const key = Deno.env.get('ABUSEIPDB_API_KEY')!
  const parameters = new URLSearchParams({ ipAddress: input.value, maxAgeInDays: '90' })
  const raw = await fetchJson(`https://api.abuseipdb.com/api/v2/check?${parameters.toString()}`, {
    method: 'GET',
    headers: { Key: key, Accept: 'application/json' },
  }, Date.now() + requestTimeoutMs)
  const data = raw?.data ?? {}
  return {
    provider: 'abuseipdb',
    status: 'success',
    rawResponse: raw,
    summary: {
      confidence_score: Number(data.abuseConfidenceScore ?? 0),
      total_reports: Number(data.totalReports ?? 0),
      country_code: String(data.countryCode ?? ''),
      is_tor: Boolean(data.isTor),
      is_public: Boolean(data.isPublic),
      usage_type: String(data.usageType ?? ''),
    },
    errorMessage: null,
  }
}

async function fetchOTX(input: IOCInput): Promise<ProviderOutcome> {
  const key = Deno.env.get('OTX_API_KEY')!
  let indicatorType: string
  if (input.type === 'ip') indicatorType = input.value.includes(':') ? 'IPv6' : 'IPv4'
  else if (input.type === 'domain') indicatorType = 'domain'
  else indicatorType = 'file'

  const raw = await fetchJson(`https://otx.alienvault.com/api/v1/indicators/${indicatorType}/${encodeURIComponent(input.value)}/general`, {
    method: 'GET',
    headers: { 'X-OTX-API-KEY': key, accept: 'application/json' },
  }, Date.now() + requestTimeoutMs)
  const pulseInfo = raw?.pulse_info ?? {}
  const pulses = Array.isArray(pulseInfo.pulses) ? pulseInfo.pulses : []
  const tags = new Set<string>(Array.isArray(raw?.tags) ? raw.tags.filter((tag: unknown) => typeof tag === 'string') : [])
  for (const pulse of pulses) {
    if (Array.isArray(pulse?.tags)) {
      for (const tag of pulse.tags) if (typeof tag === 'string') tags.add(tag)
    }
  }

  return {
    provider: 'otx',
    status: 'success',
    rawResponse: raw,
    summary: {
      pulse_count: Number(pulseInfo.count ?? pulses.length),
      reputation: Number(raw?.reputation ?? 0),
      country: String(raw?.country_name ?? raw?.country ?? ''),
      tags: [...tags],
    },
    errorMessage: null,
  }
}

async function safelyRun(provider: Provider, request: () => Promise<ProviderOutcome>): Promise<ProviderOutcome> {
  try {
    return await request()
  } catch (error) {
    if (error instanceof ProviderError) {
      return {
        provider,
        status: error.status,
        rawResponse: error.rawResponse,
        summary: null,
        errorMessage: error.message,
      }
    }
    return {
      provider,
      status: 'error',
      rawResponse: null,
      summary: null,
      errorMessage: 'Provider request failed.',
    }
  }
}

function isAllProvidersUnavailable(outcomes: ProviderOutcome[]) {
  return outcomes.length > 0 && outcomes.every((outcome) => outcome.status === 'error' || outcome.status === 'rate_limited')
}

const handler = withSupabase({ auth: 'user' }, async (request, context) => {
  try {
    if (request.method !== 'POST') return jsonError('Method not allowed.', 405)
    const userId = context.userClaims?.id
    if (!userId) return jsonError('Authentication required.', 401)
    if (!permitRequest(userId)) return jsonError('Rate limit exceeded. Try again in one minute.', 429)

    const contentLength = Number(request.headers.get('content-length') ?? 0)
    if (contentLength > 8_192) return jsonError('Request is too large.', 413)

    let body: Partial<IOCInput>
    try {
      body = await request.json()
    } catch {
      return jsonError('Send a valid JSON request.', 400)
    }

    const validated = validateInput(body.type, body.value)
    if ('error' in validated) return jsonError(validated.error, 400)
    const input: IOCInput = { ...validated, force: body.force === true }
    const expectedProviders = providersFor(input.type)
    const database = context.supabase as any

    const { data: existingIOC, error: findError } = await database
      .from('iocs')
      .select('id, user_id, type, value, severity, created_at, updated_at')
      .eq('user_id', userId)
      .eq('type', input.type)
      .eq('value', input.value)
      .maybeSingle()
    if (findError) {
      console.error('enrich-ioc: IOC lookup failed', findError.code ?? 'database_error')
      return jsonError('Could not read IOC history.', 500)
    }

    if (existingIOC && !input.force) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: recentRows, error: cacheError } = await database
        .from('ioc_enrichments')
        .select('*')
        .eq('ioc_id', existingIOC.id)
        .gte('queried_at', cutoff)
        .order('queried_at', { ascending: false })
        .limit(expectedProviders.length)
      if (cacheError) {
        console.error('enrich-ioc: cache lookup failed', cacheError.code ?? 'database_error')
        return jsonError('Could not read cached enrichment results.', 500)
      }

      const cached = recentRows ?? []
      const cachedProviders = new Set(cached.map((row: any) => row.provider))
      const cacheComplete = expectedProviders.every((provider) => cachedProviders.has(provider))
        && cached.every((row: any) => row.status !== 'pending')
      if (cacheComplete) {
        const latestQuery = cached.reduce((latest: number, row: any) => Math.max(latest, new Date(row.queried_at).getTime()), 0)
        const cachedHoursAgo = Math.max(0, Math.floor((Date.now() - latestQuery) / 3_600_000))
        const outcomes = cached.map((row: any) => ({ provider: row.provider as Provider, status: row.status, summary: row.summary }))
        return Response.json({
          cached: true,
          cachedHoursAgo,
          ioc: existingIOC,
          enrichments: cached,
          suggestedSeverity: calculateSeverity(outcomes),
          allProvidersFailed: isAllProvidersUnavailable(cached),
        })
      }
    }

    const absentKeys = missingKeys(expectedProviders)
    if (absentKeys.length > 0) {
      console.error(`enrich-ioc: provider configuration missing ${absentKeys.join(', ')}`)
      return jsonError('Provider configuration error', 500)
    }

    let ioc = existingIOC
    if (!ioc) {
      const { data, error: insertIOCError } = await database
        .from('iocs')
        .insert({ user_id: userId, type: input.type, value: input.value })
        .select('id, user_id, type, value, severity, created_at, updated_at')
        .single()
      if (insertIOCError || !data) {
        console.error('enrich-ioc: IOC insert failed', insertIOCError?.code ?? 'database_error')
        return jsonError('Could not save this IOC.', 500)
      }
      ioc = data
    }

    const tasks: Array<Promise<ProviderOutcome>> = expectedProviders.map((provider) => {
      if (provider === 'virustotal') return safelyRun(provider, () => fetchVirusTotal(input))
      if (provider === 'abuseipdb') return safelyRun(provider, () => fetchAbuseIPDB(input))
      return safelyRun(provider, () => fetchOTX(input))
    })
    const settled = await Promise.allSettled(tasks)
    const outcomes = settled.map((result, index) => result.status === 'fulfilled'
      ? result.value
      : {
          provider: expectedProviders[index],
          status: 'error' as const,
          rawResponse: null,
          summary: null,
          errorMessage: 'Provider request failed.',
        })

    const rows = await Promise.all(outcomes.map(async (outcome) => {
      const { data, error: saveError } = await database
        .from('ioc_enrichments')
        .insert({
          ioc_id: ioc.id,
          provider: outcome.provider,
          status: outcome.status,
          raw_response: outcome.rawResponse,
          summary: outcome.summary,
          error_message: outcome.errorMessage,
        })
        .select('*')
        .single()
      if (saveError || !data) throw new Error('Enrichment persistence failed')
      return data
    }))

    const suggestedSeverity = calculateSeverity(outcomes)
    const allProvidersFailed = isAllProvidersUnavailable(outcomes)
    return Response.json({
      cached: false,
      ioc,
      enrichments: rows,
      suggestedSeverity,
      allProvidersFailed,
      message: allProvidersFailed
        ? 'All threat intelligence providers are currently unavailable. The IOC is saved; try again later.'
        : undefined,
    })
  } catch (error) {
    console.error('enrich-ioc: request failed', error instanceof Error ? error.name : 'unknown_error')
    return jsonError('The enrichment request could not be completed.', 500)
  }
})

export default { fetch: handler }
