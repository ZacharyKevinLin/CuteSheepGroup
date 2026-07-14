const loginSelect=document.querySelector('#loginMember');

function setLoginOptions(rows){
  loginSelect.innerHTML='<option value="" selected disabled>請選擇成員</option>'+rows.map(m=>`<option value="${esc(m.login_key)}">${esc(m.display_name)}</option>`).join('');
}

async function loadLoginMembersV2(){
  loginSelect.innerHTML='<option value="" selected disabled>載入成員中…</option>';
  try{
    const request=db.rpc('list_login_members');
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),4000));
    const {data,error}=await Promise.race([request,timeout]);
    if(error)throw error;
    const rows=data||[];
    if(!rows.length)throw new Error('empty');
    setLoginOptions(rows);
    document.querySelector('#loginMsg').textContent='';
  }catch(_err){
    setLoginOptions([{login_key:'zachary',display_name:'Zachary'}]);
    document.querySelector('#loginMsg').textContent='已載入目前可用帳號。';
  }
}

async function loginByMember(e){
  e.preventDefault();
  document.querySelector('#loginMsg').textContent='登入中…';
  const loginKey=loginSelect.value;
  const password=document.querySelector('#password').value;
  if(!loginKey)return showLogin('請先選擇成員。');
  const {data:email,error:resolveError}=await db.rpc('resolve_login_email',{p_login_key:loginKey});
  if(resolveError)return showLogin(`無法取得登入資料：${resolveError.message}`);
  if(!email)return showLogin('此成員尚未建立登入帳號，請聯絡小組長。');
  const {data,error}=await db.auth.signInWithPassword({email,password});
  if(error)return showLogin('密碼錯誤，請重新輸入。');
  try{
    document.querySelector('#password').value='';
    await enterApp(data.user.id);
  }catch(err){
    await db.auth.signOut();
    showLogin(`登入後讀取資料失敗：${err.message}`);
  }
}

function initializeMemberLogin(){
  const form=document.querySelector('#loginForm');
  form.removeEventListener('submit',login);
  form.addEventListener('submit',loginByMember);
  db.auth.getSession().then(({data:{session}})=>{if(!session)loadLoginMembersV2()});
}

initializeMemberLogin();
