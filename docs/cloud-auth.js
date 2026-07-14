(() => {
  'use strict';

  const config = window.CUTE_SHEEP_SUPABASE;
  const message = document.querySelector('#message');
  const loginForm = document.querySelector('#loginForm');
  const account = document.querySelector('#account');
  const logoutButton = document.querySelector('#logoutButton');

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  if (!config?.url || !config?.publishableKey || !window.supabase) {
    setMessage('Supabase 設定載入失敗。', true);
    loginForm.hidden = true;
    return;
  }

  const client = window.supabase.createClient(config.url, config.publishableKey);

  async function loadProfile() {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user) {
      loginForm.hidden = false;
      account.hidden = true;
      return;
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('login_key, display_name, role, must_change_password')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (profileError) {
      setMessage(`已登入，但讀取 profile 失敗：${profileError.message}`, true);
      loginForm.hidden = true;
      account.hidden = true;
      return;
    }

    document.querySelector('#displayName').textContent = profile.display_name;
    document.querySelector('#role').textContent = profile.role;
    document.querySelector('#loginKey').textContent = profile.login_key;
    document.querySelector('#mustChange').textContent = profile.must_change_password ? '是' : '否';
    loginForm.hidden = true;
    account.hidden = false;
    setMessage('Supabase Auth 與 profiles/RLS 連線正常。');
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('登入中…');

    const email = document.querySelector('#email').value.trim();
    const password = document.querySelector('#password').value;
    const { error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      setMessage(`登入失敗：${error.message}`, true);
      return;
    }

    document.querySelector('#password').value = '';
    await loadProfile();
  });

  logoutButton.addEventListener('click', async () => {
    await client.auth.signOut();
    account.hidden = true;
    loginForm.hidden = false;
    setMessage('已登出。');
  });

  client.auth.onAuthStateChange(() => {
    window.setTimeout(loadProfile, 0);
  });

  loadProfile().catch((error) => setMessage(`初始化失敗：${error.message}`, true));
})();
