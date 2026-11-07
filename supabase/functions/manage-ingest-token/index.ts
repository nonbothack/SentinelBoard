import { withSupabase } from 'npm:@supabase/server@1'

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

const handler = withSupabase({ auth: 'user' }, async (request, context) => {
  if (request.method !== 'POST') return jsonError('Method not allowed.', 405)
  const userId = context.userClaims?.id
  if (!userId) return jsonError('Sign in is required.', 401)

  let body: unknown
  try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('Invalid request body.', 400)
  const input = body as Record<string, unknown>
  const database = context.supabaseAdmin

  if (input.action === 'list') {
    const { data, error } = await database.from('event_ingest_tokens')
      .select('id, user_id, label, token_prefix, created_at, last_used_at, expires_at, revoked_at')
      .eq('user_id', userId).order('created_at', { ascending: false })
    if (error) return jsonError('Ingest tokens could not be loaded.', 500)
    return Response.json({ tokens: data ?? [] })
  }

  if (input.action === 'create') {
    const label = typeof input.label === 'string' ? input.label.trim() : ''
    if (label.length < 1 || label.length > 64) return jsonError('Token label must contain 1 to 64 characters.', 400)
    const currentTime = new Date().toISOString()
    const { count, error: countError } = await database.from('event_ingest_tokens')
      .select('id', { count: 'exact', head: true }).eq('user_id', userId).is('revoked_at', null)
      .or(`expires_at.is.null,expires_at.gt.${currentTime}`)
    if (countError) return jsonError('Active token limit could not be checked.', 500)
    if ((count ?? 0) >= 10) return jsonError('Revoke an unused token before creating another (maximum 10 active tokens).', 409)

    const random = crypto.getRandomValues(new Uint8Array(32))
    const token = `sb_ingest_${bytesToHex(random)}`
    const prefix = token.slice(0, 18)
    const tokenHash = await sha256(token)
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await database.from('event_ingest_tokens').insert({
      user_id: userId, label, token_prefix: prefix, token_hash: tokenHash, expires_at: expiresAt,
    }).select('id, label, token_prefix, created_at, expires_at').single()
    if (error || !data) return jsonError('Ingest token could not be created.', 500)
    return Response.json({ token: data, secret: token }, { status: 201 })
  }

  if (input.action === 'revoke') {
    if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id)) return jsonError('A valid token ID is required.', 400)
    const { data, error } = await database.from('event_ingest_tokens')
      .update({ revoked_at: new Date().toISOString() }).eq('id', input.id).eq('user_id', userId).is('revoked_at', null)
      .select('id').maybeSingle()
    if (error) return jsonError('Ingest token could not be revoked.', 500)
    if (!data) return jsonError('Active ingest token was not found.', 404)
    return Response.json({ revoked: true })
  }

  return jsonError('Unsupported action.', 400)
})

export default { fetch: handler }
