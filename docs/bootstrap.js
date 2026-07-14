const loginSelect = document.querySelector('#loginMember');

function timeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function loginEmail(loginKey) {
  return loginKey === 'zachary'
    ? 'rockkevin654@gmail.com'
    : `${loginKey}@cutesheep.local`;
}

async function loadLoginDirectory() {
  loginSelect.innerHTML = '<option value="zachary">Zachary</option>';
  try {
    const result = await timeout(db.rpc('list_login_members'), 5000, '名單載入逾時');
    if (result.error) throw result.error;
    if (result.data?.length) {
      loginSelect.innerHTML = result.data
        .map((member) => `<option value="${esc(member.login_key)}">${esc(member.display_name)}</option>`)
        .join('');
      if (result.data.some((member) => member.login_key === 'zachary')) {
        loginSelect.value = 'zachary';
      }
    }
  } catch (error) {
    console.warn('使用備援登入名單', error);
  }
}

async function enterCleanApp(userId) {
  const profileResult = await timeout(
    db.from('profiles').select('*').eq('auth_user_id', userId).single(),
    10000,
    '讀取帳號資料逾時',
  );
  if (profileResult.error) throw profileResult.error;
  if (!profileResult.data) throw new Error('找不到成員資料');
  if (profileResult.data.role === '已離開') throw new Error('此帳號已停用');

  state.profile = profileResult.data;
  document.querySelector('#who').textContent = `${state.profile.display_name}｜${state.profile.role}`;
  document.querySelector('#loginMsg').textContent = '';
  document.querySelector('#loginView').hidden = true;
  document.querySelector('#app').hidden = false;
  render();

  try {
    await timeout(loadAll(), 12000, '資料載入逾時');
    render();
  } catch (error) {
    console.error(error);
    toast('已登入；部分資料稍後重新整理即可');
  }
}

async function cleanLogin(event) {
  event.preventDefault();
  const message = document.querySelector('#loginMsg');
  const submit = document.querySelector('#loginForm button[type="submit"]');
  const loginKey = loginSelect.value;
  const password = document.querySelector('#password').value;

  if (!loginKey || !password) {
    message.textContent = '請選擇成員並輸入密碼。';
    return;
  }

  submit.disabled = true;
  message.textContent = '登入中…';
  try {
    const result = await timeout(
      db.auth.signInWithPassword({ email: loginEmail(loginKey), password }),
      12000,
      '登入逾時，請檢查網路後重試。',
    );
    if (result.error) throw new Error('密碼錯誤，請重新輸入。');
    document.querySelector('#password').value = '';
    await enterCleanApp(result.data.user.id);
  } catch (error) {
    await db.auth.signOut().catch(() => {});
    document.querySelector('#loginView').hidden = false;
    document.querySelector('#app').hidden = true;
    message.textContent = error.message || '登入失敗，請稍後再試。';
  } finally {
    submit.disabled = false;
  }
}

async function cleanLogout() {
  await db.auth.signOut();
  state.profile = null;
  document.querySelector('#loginView').hidden = false;
  document.querySelector('#app').hidden = true;
  document.querySelector('#loginMsg').textContent = '你已安全登出。';
  await loadLoginDirectory();
}

async function cleanInit() {
  document.querySelector('#loginForm').addEventListener('submit', cleanLogin);
  document.querySelector('#logoutBtn').addEventListener('click', cleanLogout);
  document.querySelector('#nav').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-page]');
    if (!button) return;
    state.page = button.dataset.page;
    render();
  });
  document.querySelector('#actionBtn').addEventListener('click', primaryAction);

  const sessionResult = await db.auth.getSession();
  if (sessionResult.data.session) {
    try {
      await enterCleanApp(sessionResult.data.session.user.id);
      return;
    } catch (error) {
      await db.auth.signOut();
      document.querySelector('#loginMsg').textContent = error.message;
    }
  }
  document.querySelector('#loginView').hidden = false;
  document.querySelector('#app').hidden = true;
  await loadLoginDirectory();
}

document.addEventListener('DOMContentLoaded', cleanInit);
