import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') || ''

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return json({ error: '未登入' }, 401)

  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('id, role')
    .eq('auth_user_id', userData.user.id)
    .single()

  if (profileError || callerProfile?.role !== '小組長') {
    return json({ error: '只有小組長可以新增成員' }, 403)
  }

  const body = await req.json()
  const displayName = String(body.displayName || '').trim()
  const loginKey = String(body.loginKey || '').trim().toLowerCase()
  const birthday = String(body.birthday || '')
  const role = String(body.role || '小組員')
  const joinedAt = body.joinedAt || null

  if (!displayName || !loginKey || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return json({ error: '姓名、登入識別與完整生日為必填' }, 400)
  }
  if (!['小組長', '副組長', '小組員', '已離開'].includes(role)) {
    return json({ error: '角色不正確' }, 400)
  }

  const password = birthday.replaceAll('-', '')
  const email = `${loginKey}@cutesheep.local`

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (createError || !created.user) return json({ error: createError?.message || '建立帳號失敗' }, 400)

  const { error: insertError } = await admin.from('profiles').insert({
    auth_user_id: created.user.id,
    auth_email: email,
    login_key: loginKey,
    display_name: displayName,
    role,
    birthday,
    joined_at: joinedAt,
    must_change_password: true,
  })

  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: insertError.message }, 400)
  }

  return json({
    ok: true,
    loginKey,
    displayName,
    temporaryPassword: password,
  })
})
