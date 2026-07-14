const loginSelect=document.querySelector('#loginMember');

function setLoginOptions(rows){
  loginSelect.innerHTML='<option value="" disabled>請選擇成員</option>'+rows.map(m=>`<option value="${esc(m.login_key)}">${esc(m.display_name)}</option>`).join('');
  if(rows.length) loginSelect.value=rows[0].login_key;
}

async function loadLoginMembersV2(){
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

function emailForLoginKey(loginKey){
  if(loginKey==='zachary') return 'rockkevin654@gmail.com';
  return `${loginKey}@cutesheep.local`;
}

async function loginByMember(e){
  e.preventDefault();
  const msg=document.querySelector('#loginMsg');
  msg.textContent='登入中…';
  const loginKey=loginSelect.value;
  const password=document.querySelector('#password').value;
  if(!loginKey)return showLogin('請先選擇成員。');

  const email=emailForLoginKey(loginKey);
  try{
    const loginRequest=db.auth.signInWithPassword({email,password});
    const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('登入逾時，請檢查網路後重試。')),10000));
    const {data,error}=await Promise.race([loginRequest,timeout]);
    if(error)return showLogin('密碼錯誤，請重新輸入。');
    document.querySelector('#password').value='';
    await enterApp(data.user.id);
  }catch(err){
    await db.auth.signOut().catch(()=>{});
    showLogin(err?.message||'登入失敗，請稍後再試。');
  }
}

function initializeMemberLogin(){
  const form=document.querySelector('#loginForm');
  form.removeEventListener('submit',login);
  form.addEventListener('submit',loginByMember);
  db.auth.getSession().then(({data:{session}})=>{if(!session)loadLoginMembersV2()});
}

initializeMemberLogin();
