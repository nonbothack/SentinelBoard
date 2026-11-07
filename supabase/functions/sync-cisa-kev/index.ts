import { withSupabase } from 'npm:@supabase/server@1'
import { parseCisaKevCatalog } from '../../../src/lib/cisa-kev.ts'

const catalogUrl = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
const maximumCatalogBytes = 8 * 1024 * 1024
const batchSize = 250

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

const handler = withSupabase({ auth: 'secret' }, async (request, context) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(catalogUrl, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      signal: controller.signal,
    })
    if (!response.ok) return json({ error: `CISA KEV returned HTTP ${response.status}.` }, 502)

    const content = await response.text()
    if (new TextEncoder().encode(content).byteLength > maximumCatalogBytes) {
      return json({ error: 'CISA KEV response exceeded the configured size limit.' }, 502)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      return json({ error: 'CISA KEV returned invalid JSON.' }, 502)
    }

    const catalog = parseCisaKevCatalog(parsed)
    const syncedAt = new Date().toISOString()
    const rows = catalog.vulnerabilities.map((entry) => ({ ...entry, synced_at: syncedAt }))
    const database = context.supabaseAdmin as any

    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const { error } = await database
        .from('cisa_kev_entries')
        .upsert(rows.slice(offset, offset + batchSize), { onConflict: 'cve_id' })
      if (error) {
        console.error('sync-cisa-kev: batch upsert failed', error.code ?? 'database_error')
        return json({ error: 'CISA KEV catalog could not be stored.' }, 500)
      }
    }

    const { error: cleanupError } = await database
      .from('cisa_kev_entries')
      .delete()
      .neq('synced_at', syncedAt)
    if (cleanupError) {
      console.error('sync-cisa-kev: stale entry cleanup failed', cleanupError.code ?? 'database_error')
      return json({ error: 'CISA KEV catalog was synced but stale entries could not be removed.' }, 500)
    }

    return json({
      ok: true,
      catalogVersion: catalog.catalogVersion,
      dateReleased: catalog.dateReleased,
      count: catalog.count,
      syncedAt,
    })
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'CISA KEV request timed out.'
      : error instanceof Error
        ? error.message
        : 'CISA KEV sync failed.'
    console.error('sync-cisa-kev: request failed', error instanceof Error ? error.name : 'unknown_error')
    return json({ error: message }, 502)
  } finally {
    clearTimeout(timeout)
  }
})

export default { fetch: handler }
