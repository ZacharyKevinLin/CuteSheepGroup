async function openAppAfterLoginV5(userId){
  const msg=document.querySelector('#loginMsg');
  msg.textContent='讀取帳號資料…';
  const profileRequest=db.from('profiles').select('*').eq('auth_user_id',userId).single();
  const timeout=new Promise((_,reject)=>setTimeout(()=>reject(new Error('讀取帳號資料逾時')),8000));
  const result=await Promise.race([profileRequest,timeout]);
  if(result.error) throw result.error;
  const profile=result.data;
  if(!profile) throw new Error('找不到對應的成員資料');
  if(profile.role==='已離開') throw new Error('此帳號已停用');

  state.profile=profile;
  state.profiles=[profile];
  state.meetings=[];
  state.attendance=[];
  state.prayers=[];
  state.interviews=[];

  document.querySelector('#who').textContent=`${profile.display_name}｜${profile.role}`;
  document.querySelector('#loginView').hidden=true;
  document.querySelector('#app').hidden=false;
  state.page='dashboard';
  render();
  msg.textContent='';

  Promise.race([
    loadAll(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('背景資料載入逾時')),10000))
  ]).then(()=>render()).catch(err=>toast(err.message));
}

async function loginByMemberV5(event){
  event.preventDefault();
  const msg=document.querySelector('#loginMsg');
  const select=document.querySelector('#loginMember');
  const passwordInput=document.querySelector('#password');
  const loginKey=select.value;
  const password=passwordInput.value;
  if(!loginKey){msg.textContent='請先選擇成員。';return;}
  if(!password){msg.textContent='請輸入密碼。';return;}

  msg.textContent='登入中…';
  const email=loginKey==='zachary'?'rockkevin654@gmail.com':`${loginKey}@cutesheep.local`;
  try{
    const authResult=await Promise.race([
      db.auth.signInWithPassword({email,password}),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('登入逾時，請稍後重試。')),10000))
    ]);
    if(authResult.error) throw new Error('密碼錯誤，請重新輸入。');
    passwordInput.value='';
    await openAppAfterLoginV5(authResult.data.user.id);
  }catch(error){
    msg.textContent=error.message||'登入失敗，請稍後再試。';
  }
}

(function installLoginV5(){
  const form=document.querySelector('#loginForm');
  const replacement=form.cloneNode(true);
  form.replaceWith(replacement);
  replacement.addEventListener('submit',loginByMemberV5);
})();