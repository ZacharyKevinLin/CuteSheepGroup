// Hotfix: enter the app immediately after authentication, then load dashboard data in background.
function withTimeoutV4(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

enterApp = async function(uid) {
  const profileRequest = db.from('profiles').select('*').eq('auth_user_id', uid).single();
  const { data, error } = await withTimeoutV4(profileRequest, 8000, '讀取帳號資料逾時，請稍後重試。');
  if (error) throw error;
  if (!data) throw new Error('找不到成員資料');
  if (data.role === '已離開') throw new Error('此帳號已停用');

  state.profile = data;
  document.querySelector('#who').textContent = `${data.display_name}｜${data.role}`;
  document.querySelector('#loginMsg').textContent = '';
  document.querySelector('#loginView').hidden = true;
  document.querySelector('#app').hidden = false;
  render();

  try {
    await withTimeoutV4(loadAll(), 12000, '部分資料載入較慢');
    render();
  } catch (error) {
    console.error('Background data load failed:', error);
    toast('已登入；部分資料暫時載入失敗，可稍後重新整理');
  }
};
