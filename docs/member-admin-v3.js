function openCreateMemberV3(){
  modal(`<div class="modal-head"><h2>新增成員</h2></div>
    <div class="form-grid">
      <label>姓名<input name="displayName" required></label>
      <label>登入識別<input name="loginKey" required placeholder="例如 peter"></label>
      <label>生日<input name="birthday" type="date" required></label>
      <label>角色<select name="role"><option>小組員</option><option>副組長</option><option>小組長</option><option>已離開</option></select></label>
      <label>加入日期<input name="joinedAt" type="date"></label>
    </div>
    <p class="login-help">儲存後會自動建立登入帳號；初始密碼為生日 YYYYMMDD，首次登入後需更改。</p>
    <div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" id="createMemberV3Btn">建立成員與帳號</button></div>`)
  document.querySelector('#createMemberV3Btn').addEventListener('click',saveCreateMemberV3)
}

async function saveCreateMemberV3(){
  const button=document.querySelector('#createMemberV3Btn')
  const form=new FormData(document.querySelector('#modalForm'))
  const payload={
    displayName:String(form.get('displayName')||'').trim(),
    loginKey:String(form.get('loginKey')||'').trim().toLowerCase(),
    birthday:String(form.get('birthday')||''),
    role:String(form.get('role')||'小組員'),
    joinedAt:String(form.get('joinedAt')||'')||null,
  }
  if(!payload.displayName||!payload.loginKey||!payload.birthday)return alert('請填寫姓名、登入識別與生日')
  button.disabled=true;button.textContent='建立中…'
  const {data,error}=await db.functions.invoke('create-member',{body:payload})
  button.disabled=false;button.textContent='建立成員與帳號'
  if(error)return alert(`建立失敗：${error.message}`)
  if(data?.error)return alert(`建立失敗：${data.error}`)
  closeModal()
  await refresh(`${payload.displayName} 的帳號已建立`)
  alert(`${payload.displayName} 已建立完成。\n登入名稱：${payload.displayName}\n初始密碼：${String(data.temporaryPassword||'')}\n請提醒本人首次登入後更改密碼。`)
}

document.addEventListener('DOMContentLoaded',()=>{
  const action=document.querySelector('#actionBtn')
  action?.addEventListener('click',event=>{
    if(state?.page!=='members'||!isLeader())return
    event.preventDefault();event.stopImmediatePropagation();openCreateMemberV3()
  },true)
})
