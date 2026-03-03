import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_FALLBACK_EMAILS = new Set(['estudiovic@gmail.com'])
const ROLE_OPTIONS = new Set(['admin', 'operador', 'lector'])

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

async function assertAdmin(sb: ReturnType<typeof createClient>, jwt: string) {
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt)
  if (userErr || !userData?.user) throw new Error('invalid_session')

  const requesterEmail = normalizeEmail(userData.user.email)
  if (!requesterEmail) throw new Error('invalid_session_email')

  if (ADMIN_FALLBACK_EMAILS.has(requesterEmail)) {
    return { requesterEmail, requesterId: userData.user.id }
  }

  const { data: roleRow, error: roleErr } = await sb
    .from('user_roles')
    .select('role')
    .eq('email', requesterEmail)
    .maybeSingle()

  if (roleErr) throw new Error(`role_check_failed:${roleErr.message || 'error'}`)
  if (roleRow?.role !== 'admin') throw new Error('forbidden_admin_only')

  return { requesterEmail, requesterId: userData.user.id }
}

async function listUsers(sb: ReturnType<typeof createClient>) {
  const users: Array<Record<string, unknown>> = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`list_users_failed:${error.message || 'error'}`)

    const rows = data?.users || []
    users.push(...rows)
    if (rows.length < perPage) break
    page += 1
  }

  const emails = users
    .map((u) => normalizeEmail(u.email))
    .filter(Boolean)

  let roleMap = new Map<string, string>()
  if (emails.length > 0) {
    const { data: roleRows, error: roleErr } = await sb
      .from('user_roles')
      .select('email, role')
      .in('email', emails)
    if (roleErr) throw new Error(`roles_fetch_failed:${roleErr.message || 'error'}`)
    roleMap = new Map((roleRows || []).map((r) => [normalizeEmail(r.email), String(r.role || 'lector')]))
  }

  const result = users.map((u) => {
    const email = normalizeEmail(u.email)
    return {
      id: u.id,
      email,
      role: roleMap.get(email) || 'lector',
      created_at: u.created_at || null,
      last_sign_in_at: u.last_sign_in_at || null,
      email_confirmed_at: u.email_confirmed_at || null,
    }
  })

  result.sort((a, b) => String(a.email).localeCompare(String(b.email)))
  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ ok: false, error: 'missing_supabase_env' }, 500)
    }

    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return jsonResponse({ ok: false, error: 'missing_authorization' }, 401)

    const sb = createClient(supabaseUrl, serviceRoleKey)
    const { requesterEmail, requesterId } = await assertAdmin(sb, jwt)
    const payload = await req.json()
    const action = String(payload?.action || '').trim()

    if (action === 'list_users') {
      const users = await listUsers(sb)
      return jsonResponse({ ok: true, users })
    }

    if (action === 'create_user') {
      const email = normalizeEmail(payload?.email)
      const password = String(payload?.password || '')
      const role = String(payload?.role || 'lector')

      if (!email) return jsonResponse({ ok: false, error: 'email_required' }, 400)
      if (password.length < 6) return jsonResponse({ ok: false, error: 'password_min_6' }, 400)
      if (!ROLE_OPTIONS.has(role)) return jsonResponse({ ok: false, error: 'invalid_role' }, 400)

      const { data, error } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) return jsonResponse({ ok: false, error: error.message || 'create_user_failed' }, 400)

      const { error: roleErr } = await sb
        .from('user_roles')
        .upsert({
          email,
          role,
          updated_by: requesterEmail,
        }, { onConflict: 'email' })
      if (roleErr) return jsonResponse({ ok: false, error: roleErr.message || 'role_upsert_failed' }, 400)

      return jsonResponse({
        ok: true,
        user: {
          id: data.user?.id || null,
          email,
          role,
        },
      })
    }

    if (action === 'update_role') {
      const email = normalizeEmail(payload?.email)
      const role = String(payload?.role || 'lector')
      if (!email) return jsonResponse({ ok: false, error: 'email_required' }, 400)
      if (!ROLE_OPTIONS.has(role)) return jsonResponse({ ok: false, error: 'invalid_role' }, 400)

      const { error } = await sb
        .from('user_roles')
        .upsert({
          email,
          role,
          updated_by: requesterEmail,
        }, { onConflict: 'email' })

      if (error) return jsonResponse({ ok: false, error: error.message || 'update_role_failed' }, 400)
      return jsonResponse({ ok: true })
    }

    if (action === 'delete_user') {
      const userId = String(payload?.user_id || '').trim()
      const email = normalizeEmail(payload?.email)
      if (!userId || !email) return jsonResponse({ ok: false, error: 'user_id_and_email_required' }, 400)

      if (userId === requesterId || email === requesterEmail) {
        return jsonResponse({ ok: false, error: 'cannot_delete_current_admin' }, 400)
      }

      const { error: delErr } = await sb.auth.admin.deleteUser(userId, false)
      if (delErr) return jsonResponse({ ok: false, error: delErr.message || 'delete_user_failed' }, 400)

      await sb.from('user_roles').delete().eq('email', email)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ ok: false, error: 'invalid_action' }, 400)
  } catch (e) {
    return jsonResponse({ ok: false, error: e?.message || 'unknown_error' }, 400)
  }
})
