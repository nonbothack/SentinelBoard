import { expect, test, type Page, type Route } from '@playwright/test'

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'analyst@example.test',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
}

function session(expiresAt = Math.floor(Date.now() / 1000) + 3600) {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: expiresAt - Math.floor(Date.now() / 1000),
    expires_at: expiresAt,
    user,
  }
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222', user_id: user.id, source: 'ids', severity: 'high', category: 'authentication',
    title: 'SSH login failure', description: 'Repeated failed authentication', raw_data: { sensor: 'ids-01' }, source_ip: '203.0.113.8', dest_ip: '192.0.2.10', hostname: 'edge-01',
    event_time: '2026-01-01T12:00:00.000Z', is_sample: false, created_at: '2026-01-01T12:00:00.000Z', updated_at: '2026-01-01T12:00:00.000Z', external_id: null,
    ...overrides,
  }
}

function incidentRow() {
  return {
    id: '33333333-3333-4333-8333-333333333333', user_id: user.id, title: 'Suspicious authentication activity', description: 'Review the affected account', severity: 'high', status: 'investigating',
    created_at: '2026-01-01T12:00:00.000Z', updated_at: '2026-01-01T12:00:00.000Z',
  }
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: body === null ? '' : JSON.stringify(body) })
}

async function mockSupabase(page: Page, options: { seedSession?: boolean; events?: ReturnType<typeof eventRow>[]; onTable?: (table: string, route: Route) => Promise<boolean> } = {}) {
  if (options.seedSession) {
    await page.addInitScript((value) => localStorage.setItem('sb-sentinelboard-test-auth-token', JSON.stringify(value)), session())
  }
  const events = options.events ?? []
  let scanUpload: Record<string, unknown> | null = null
  let tagged = false
  let ingestToken: Record<string, unknown> | null = null
  const incidentActivities: Array<Record<string, unknown>> = []

  await page.route('https://sentinelboard-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url())
    const method = route.request().method()
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'password') return fulfill(route, session())
      if (url.pathname.endsWith('/token') && url.searchParams.get('grant_type') === 'refresh_token') return fulfill(route, session())
      if (url.pathname.endsWith('/user')) return fulfill(route, user)
      return fulfill(route, {})
    }
    if (url.pathname.startsWith('/functions/v1/')) {
      if (url.pathname.endsWith('/enrich-ioc')) {
        const now = new Date().toISOString()
        return fulfill(route, {
          cached: false, allProvidersFailed: false, suggestedSeverity: 'high',
          ioc: { id: '44444444-4444-4444-8444-444444444444', user_id: user.id, type: 'ip', value: '8.8.8.8', severity: null, tags: [], notes: null, created_at: now, updated_at: now },
          enrichments: [{ id: '55555555-5555-4555-8555-555555555555', ioc_id: '44444444-4444-4444-8444-444444444444', provider: 'virustotal', status: 'success', raw_response: {}, summary: { malicious: 3, suspicious: 1, harmless: 50, undetected: 20, total_engines: 74, detection_ratio: '3/74', reputation: 0 }, error_message: null, queried_at: now }],
        })
      }
      if (url.pathname.endsWith('/manage-ingest-token')) {
        const input = route.request().postDataJSON() as Record<string, unknown>
        if (input.action === 'create') {
          ingestToken = { id: '99999999-9999-4999-8999-999999999999', label: input.label, token_prefix: 'sb_ingest_abcdef', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), last_used_at: null, revoked_at: null }
          return fulfill(route, { token: ingestToken, secret: 'sb_ingest_abcdefghijklmnopqrstuvwxyz0123456789abcdef0123456789abcdef' }, 201)
        }
        if (input.action === 'revoke') return fulfill(route, { revoked: true })
        return fulfill(route, { tokens: ingestToken ? [ingestToken] : [] })
      }
      return fulfill(route, {})
    }
    if (url.pathname.startsWith('/storage/v1/')) return fulfill(route, { Key: url.pathname.split('/object/')[1] ?? 'scan-files' })

    const table = decodeURIComponent(url.pathname.split('/rest/v1/')[1]?.split('/')[0] ?? '')
    if (options.onTable && await options.onTable(table, route)) return
    if (table === 'events' && method === 'GET') return fulfill(route, events)
    if (table === 'event_techniques' && method === 'GET') return fulfill(route, tagged ? [{ id: '66666666-6666-4666-8666-666666666666', event_id: events[0]?.id, technique_id: 'T1059', confidence: 'suggested', assigned_by: user.id, created_at: new Date().toISOString() }] : [])
    if (table === 'event_techniques' && (method === 'POST' || method === 'PATCH')) { tagged = true; return fulfill(route, null, 204) }
    if (table === 'ioc_enrichments') return fulfill(route, [{ id: '55555555-5555-4555-8555-555555555555', ioc_id: '44444444-4444-4444-8444-444444444444', provider: 'virustotal', status: 'success', raw_response: {}, summary: { malicious: 3, suspicious: 1, harmless: 50, undetected: 20, total_engines: 74, detection_ratio: '3/74', reputation: 0 }, error_message: null, queried_at: new Date().toISOString() }])
    if (table === 'scan_uploads') {
      if (method === 'GET') return fulfill(route, scanUpload ? [scanUpload] : [])
      const input = route.request().postDataJSON() as Record<string, unknown>
      if (method === 'POST') scanUpload = { ...input, id: input.id ?? '77777777-7777-4777-8777-777777777777', created_at: new Date().toISOString(), total_findings: 0, parse_status: 'pending' }
      if (method === 'PATCH' && scanUpload) scanUpload = { ...scanUpload, ...input }
      const response = scanUpload ?? {}
      return (route.request().headers().accept ?? '').includes('vnd.pgrst.object') ? fulfill(route, response) : fulfill(route, [response])
    }
    if (table === 'scan_findings' && method === 'GET') return fulfill(route, [{ id: '88888888-8888-4888-8888-888888888888', scan_upload_id: '77777777-7777-4777-8777-777777777777', host: 'app.example.test', port: 443, severity: 'critical', title: 'Apache Log4j RCE', description: 'Remote code execution vulnerability', cve_ids: ['CVE-2021-44228'], reference_urls: [], matched_at: 'https://app.example.test/', raw_finding: {}, created_at: new Date().toISOString() }])
    if (table === 'cisa_kev_entries') return fulfill(route, [{ cve_id: 'CVE-2021-44228', vendor_project: 'Apache', product: 'Log4j', vulnerability_name: 'Apache Log4j remote code execution', date_added: '2021-12-10', short_description: 'Remote code execution', required_action: 'Apply updates.', due_date: '2021-12-24', known_ransomware_campaign_use: 'Known', notes: null, cwes: ['CWE-917'], catalog_version: 'test', catalog_released: '2026-01-01', synced_at: new Date().toISOString() }])
    if (table === 'incidents' && method === 'GET') return fulfill(route, [incidentRow()])
    if (table === 'incidents' && method === 'PATCH') return fulfill(route, incidentRow())
    if (table === 'incident_activity' && method === 'GET') return fulfill(route, incidentActivities)
    if (table === 'incident_activity' && method === 'POST') {
      const input = route.request().postDataJSON() as Record<string, unknown> | Array<Record<string, unknown>>
      for (const row of Array.isArray(input) ? input : [input]) incidentActivities.push({ id: crypto.randomUUID(), ...row, created_at: new Date().toISOString() })
      return fulfill(route, null, 204)
    }
    if (table === 'incident_iocs' || table === 'incident_events' || table === 'ioc_enrichments') return fulfill(route, [])
    if (method === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '0-0/0' } })
    return fulfill(route, [])
  })
}

test('signs in and restores the authenticated session after reload', async ({ page }) => {
  let passwordGrant = false
  await mockSupabase(page, { onTable: async () => false })
  await page.route('https://sentinelboard-test.supabase.co/auth/v1/token?grant_type=password', async (route) => {
    passwordGrant = true
    await fulfill(route, session())
  })
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill('not-a-real-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  expect(passwordGrant).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
})

test('refreshes an expired session before showing the protected event feed', async ({ page }) => {
  await page.addInitScript((value) => localStorage.setItem('sb-sentinelboard-test-auth-token', JSON.stringify(value)), session(Math.floor(Date.now() / 1000) - 10))
  let refreshed = false
  await mockSupabase(page)
  await page.route('https://sentinelboard-test.supabase.co/auth/v1/token?grant_type=refresh_token', async (route) => {
    refreshed = true
    await fulfill(route, session())
  })
  await page.goto('/events')
  await expect(page.getByRole('heading', { name: 'Security events' })).toBeVisible()
  expect(refreshed).toBe(true)
})

test('enriches an IOC and renders provider results', async ({ page }) => {
  await mockSupabase(page, { seedSession: true })
  await page.goto('/ioc')
  await page.getByLabel('Indicator of compromise value').fill('8.8.8.8')
  await page.getByRole('button', { name: 'Enrich' }).click()
  await expect(page.getByRole('heading', { name: '8.8.8.8' })).toBeVisible()
  await expect(page.getByText('VirusTotal', { exact: false }).first()).toBeVisible()
})

test('uploads scan results and displays the CISA KEV match', async ({ page }) => {
  await mockSupabase(page, { seedSession: true })
  await page.goto('/scans')
  await page.getByRole('button', { name: 'Upload scan' }).click()
  await page.locator('#nuclei-scan-file').setInputFiles({
    name: 'nuclei.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ host: 'https://app.example.test', 'template-id': 'CVE-2021-44228', info: { name: 'Apache Log4j RCE', severity: 'critical', classification: { 'cve-id': ['CVE-2021-44228'] } } })),
  })
  await page.getByRole('button', { name: 'Parse and upload' }).click()
  await page.locator('summary').filter({ hasText: 'app.example.test' }).click()
  await expect(page.getByText('Known exploited · CISA KEV')).toBeVisible()
  await expect(page.getByText('CISA notes known ransomware campaign use.')).toBeVisible()
})

test('tags an event with an ATT&CK technique', async ({ page }) => {
  const event = eventRow()
  await mockSupabase(page, { seedSession: true, events: [event] })
  await page.goto('/events')
  await page.getByRole('button', { name: /SSH login failure/ }).click()
  await page.getByRole('button', { name: 'Tag ATT&CK technique' }).click()
  await page.getByRole('combobox', { name: 'Search ATT&CK techniques by ID or name' }).fill('T1059')
  await page.getByRole('option').getByRole('button', { name: /T1059 Command and Scripting/ }).click()
  await expect(page.getByRole('link', { name: /T1059/ })).toBeVisible()
})

test('recovers recent event data when the tab receives focus', async ({ page }) => {
  let eventReads = 0
  const event = eventRow()
  await mockSupabase(page, {
    seedSession: true, events: [event],
    onTable: async (table, route) => {
      if (table === 'events' && route.request().method() === 'GET') eventReads += 1
      return false
    },
  })
  await page.goto('/events')
  await expect(page.getByRole('button', { name: /SSH login failure/ })).toBeVisible()
  const initialReads = eventReads
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => eventReads).toBeGreaterThan(initialReads)
})

test('exports an incident investigation report', async ({ page }) => {
  await mockSupabase(page, { seedSession: true })
  await page.goto('/incidents')
  await page.getByRole('button', { name: /Suspicious authentication activity/ }).click()
  await expect(page.getByRole('heading', { name: 'Suspicious authentication activity' })).toBeVisible()
  await page.locator('#incident-playbook-select').selectOption('phishing')
  await page.getByRole('checkbox').first().click()
  await expect(page.getByRole('checkbox').first()).toBeChecked()
  await page.getByRole('tab', { name: 'Report' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Generate & download/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/incident-.*\.md/)
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Report download stream is unavailable.')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  const markdown = Buffer.concat(chunks).toString('utf8')
  expect(markdown).toContain('Selected response playbook: Phishing or credential theft')
  expect(markdown).toContain('Completed response checklist: Assign an incident lead')
})

test('creates and revokes a one-time event ingestion token', async ({ page }) => {
  await mockSupabase(page, { seedSession: true })
  await page.goto('/settings')
  await page.getByLabel('Token name').fill('Production SIEM')
  await page.getByRole('button', { name: 'Create token' }).click()
  await expect(page.getByLabel('New event ingestion token')).toHaveValue(/^sb_ingest_/)
  await expect(page.getByText('Copy this token now. It will not be shown again.')).toBeVisible()
  await page.getByRole('button', { name: 'Revoke' }).click()
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible()
})
