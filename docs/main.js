(() => {
  'use strict';

  const cfg = window.CUTE_SHEEP_CONFIG;
  if (!cfg || !window.supabase) throw new Error('Supabase 設定未載入');

  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const $ = (selector) => document.querySelector(selector);
  const state = { profile: null, page: 'dashboard', profiles: [], meetings: [], attendance: [], prayers: [], interviews: [] };
  const titles = {
    dashboard: ['首頁', '掌握小組近況'], members: ['成員', '成員資料與角色'],
    meetings: ['聚會', '聚會與出席紀錄'], prayers: ['代禱', '代禱事項'],
    interviews: ['一對一', '關懷與陪伴紀錄'], account: ['帳號', '登入與密碼設定']
  };

  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const fmt = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('zh-TW') : '—';
  const isLeader = () => state.profile?.role === '小組長';
  const canManage = () => ['小組長', '副組長'].includes(state.profile?.role);
  const withTimeout = (promise, ms, message) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))]);

  function showMessage(message = '') { $('#loginMsg').textContent = message; }
  function showLogin(message = '') { $('#loginView').hidden = false; $('#app').hidden = true; showMessage(message); }
  function showApp() { $('#loginView').hidden = true; $('#app').hidden = false; showMessage(''); }
  function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2200); }
  function modal(html) { $('#modalBody').innerHTML = html; $('#modal').showModal(); }
  function closeModal() { $('#modal').close(); }

  function loginEmail(loginKey) {
    return loginKey === 'zachary' ? 'rockkevin654@gmail.com' : `${loginKey}@cutesheep.local`;
  }

  async function loadLoginDirectory() {
    const select = $('#loginMember');
    select.innerHTML = '<option value="zachary">Zachary</option>';
    try {
      const result = await withTimeout(db.rpc('list_login_members'), 6000, '名單載入逾時');
      if (result.error) throw result.error;
      if (result.data?.length) {
        select.innerHTML = result.data.map((member) => `<option value="${esc(member.login_key)}">${esc(member.display_name)}</option>`).join('');
        if (result.data.some((member) => member.login_key === 'zachary')) select.value = 'zachary';
      }
    } catch (error) {
      console.warn('使用備援登入名單', error);
    }
  }

  async function loadAll() {
    const requests = [
      db.from('profiles').select('*').order('display_name'),
      db.from('meetings').select('*').order('meeting_date', { ascending: false }),
      db.from('attendance').select('*'),
      db.from('prayer_records').select('*').order('created_at', { ascending: false }),
      db.from('interviews').select('*').order('interview_date', { ascending: false })
    ];
    const results = await Promise.all(requests.map((request) => withTimeout(request, 10000, '資料讀取逾時')));
    for (const result of results) if (result.error) throw result.error;
    [state.profiles, state.meetings, state.attendance, state.prayers, state.interviews] = results.map((result) => result.data || []);
  }

  async function enterApp(userId) {
    const profileResult = await withTimeout(db.from('profiles').select('*').eq('auth_user_id', userId).single(), 10000, '讀取帳號資料逾時');
    if (profileResult.error) throw profileResult.error;
    if (!profileResult.data) throw new Error('找不到成員資料');
    if (profileResult.data.role === '已離開') throw new Error('此帳號已停用');

    state.profile = profileResult.data;
    $('#who').textContent = `${state.profile.display_name}｜${state.profile.role}`;
    showApp();
    render();
    try { await loadAll(); render(); } catch (error) { console.error(error); toast('已登入；部分資料暫時無法載入'); }
  }

  async function login(event) {
    event.preventDefault();
    const button = $('#loginForm button[type="submit"]');
    const loginKey = $('#loginMember').value;
    const password = $('#password').value;
    if (!loginKey || !password) return showMessage('請選擇成員並輸入密碼。');

    button.disabled = true;
    showMessage('登入中…');
    try {
      const result = await withTimeout(db.auth.signInWithPassword({ email: loginEmail(loginKey), password }), 12000, '登入逾時，請檢查網路後重試。');
      if (result.error) throw new Error('密碼錯誤，請重新輸入。');
      $('#password').value = '';
      await enterApp(result.data.user.id);
    } catch (error) {
      await db.auth.signOut().catch(() => {});
      showLogin(error.message || '登入失敗，請稍後再試。');
    } finally {
      button.disabled = false;
    }
  }

  async function logout() {
    await db.auth.signOut();
    state.profile = null;
    showLogin('你已安全登出。');
    await loadLoginDirectory();
  }

  function render() {
    const [title, subtitle] = titles[state.page];
    $('#title').textContent = title;
    $('#subtitle').textContent = subtitle;
    document.querySelectorAll('#nav button').forEach((button) => button.classList.toggle('active', button.dataset.page === state.page));
    const action = $('#actionBtn');
    action.hidden = !((state.page === 'members' && isLeader()) || (state.page === 'meetings' && canManage()) || state.page === 'prayers' || (state.page === 'interviews' && isLeader()));
    action.textContent = { members: '新增成員', meetings: '新增聚會', prayers: '新增代禱', interviews: '新增一對一' }[state.page] || '新增';
    ({ dashboard: renderDashboard, members: renderMembers, meetings: renderMeetings, prayers: renderPrayers, interviews: renderInterviews, account: renderAccount }[state.page] || renderDashboard)();
  }

  function renderDashboard() {
    const active = state.profiles.filter((profile) => profile.role !== '已離開').length;
    $('#content').innerHTML = `<div class="grid"><div class="card stat"><span>在組成員</span><strong>${active}</strong></div><div class="card stat"><span>聚會紀錄</span><strong>${state.meetings.length}</strong></div><div class="card stat"><span>代禱紀錄</span><strong>${state.prayers.length}</strong></div></div>`;
  }

  function renderMembers() {
    $('#content').innerHTML = state.profiles.length ? `<div class="table-wrap"><table><thead><tr><th>姓名</th><th>角色</th><th>加入日期</th><th>登入識別</th></tr></thead><tbody>${state.profiles.map((profile) => `<tr><td>${esc(profile.display_name)}</td><td>${esc(profile.role)}</td><td>${fmt(profile.joined_at)}</td><td>${esc(profile.login_key)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">尚無成員資料</div>';
  }

  function renderMeetings() {
    $('#content').innerHTML = state.meetings.length ? state.meetings.map((meeting) => `<div class="card panel"><h2>${fmt(meeting.meeting_date)}｜${esc(meeting.topic || meeting.meeting_type)}</h2><p>${esc(meeting.location || '未填地點')}</p></div>`).join('') : '<div class="empty">尚無聚會紀錄</div>';
  }

  function renderPrayers() {
    $('#content').innerHTML = state.prayers.length ? state.prayers.map((record) => `<div class="card panel"><p>${esc(record.content)}</p></div>`).join('') : '<div class="empty">尚無代禱紀錄</div>';
  }

  function renderInterviews() {
    $('#content').innerHTML = state.interviews.length ? state.interviews.map((record) => `<div class="card panel"><h2>${fmt(record.interview_date)}</h2><p>${esc(record.summary || '')}</p></div>`).join('') : '<div class="empty">尚無一對一紀錄</div>';
  }

  function renderAccount() {
    $('#content').innerHTML = `<div class="card panel"><h2>${esc(state.profile.display_name)}</h2><p>角色：${esc(state.profile.role)}</p><p>登入識別：${esc(state.profile.login_key)}</p><button id="changePasswordBtn">變更密碼</button></div>`;
    $('#changePasswordBtn').addEventListener('click', openChangePassword);
  }

  function openCreateMember() {
    modal(`<div class="modal-head"><h2>新增成員</h2></div><div class="form-grid"><label>姓名<input name="displayName" required></label><label>登入識別<input name="loginKey" required></label><label>生日<input name="birthday" type="date" required></label><label>角色<select name="role"><option>小組員</option><option>副組長</option><option>小組長</option><option>已離開</option></select></label><label>加入日期<input name="joinedAt" type="date"></label></div><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" id="saveMemberBtn">建立成員與帳號</button></div>`);
    $('#saveMemberBtn').addEventListener('click', saveMember);
  }

  async function saveMember() {
    const form = new FormData($('#modalForm'));
    const payload = { displayName: String(form.get('displayName') || '').trim(), loginKey: String(form.get('loginKey') || '').trim().toLowerCase(), birthday: String(form.get('birthday') || ''), role: String(form.get('role') || '小組員'), joinedAt: String(form.get('joinedAt') || '') || null };
    if (!payload.displayName || !payload.loginKey || !payload.birthday) return alert('請填寫姓名、登入識別與生日');
    const result = await db.functions.invoke('create-member', { body: payload });
    if (result.error) return alert(`建立失敗：${result.error.message}`);
    if (result.data?.error) return alert(`建立失敗：${result.data.error}`);
    closeModal();
    await loadAll(); render();
    alert(`${payload.displayName} 已建立完成。\n初始密碼：${result.data.temporaryPassword}`);
  }

  function openChangePassword() {
    modal(`<div class="modal-head"><h2>變更密碼</h2></div><label>新密碼<input name="password" type="password" minlength="8" required></label><label>再次輸入<input name="confirm" type="password" minlength="8" required></label><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" id="savePasswordBtn">更新密碼</button></div>`);
    $('#savePasswordBtn').addEventListener('click', savePassword);
  }

  async function savePassword() {
    const form = new FormData($('#modalForm'));
    const password = String(form.get('password') || '');
    const confirm = String(form.get('confirm') || '');
    if (password.length < 8) return alert('密碼至少 8 個字元');
    if (password !== confirm) return alert('兩次密碼不同');
    const result = await db.auth.updateUser({ password });
    if (result.error) return alert(result.error.message);
    await db.from('profiles').update({ must_change_password: false }).eq('id', state.profile.id);
    closeModal(); toast('密碼已更新');
  }

  function primaryAction() {
    if (state.page === 'members' && isLeader()) return openCreateMember();
    toast('此功能正在整理中');
  }

  async function init() {
    $('#loginForm').addEventListener('submit', login);
    $('#logoutBtn').addEventListener('click', logout);
    $('#nav').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-page]');
      if (!button) return;
      state.page = button.dataset.page;
      render();
    });
    $('#actionBtn').addEventListener('click', primaryAction);

    const sessionResult = await db.auth.getSession();
    if (sessionResult.data.session) {
      try { await enterApp(sessionResult.data.session.user.id); return; }
      catch (error) { await db.auth.signOut(); showMessage(error.message); }
    }
    showLogin();
    await loadLoginDirectory();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
