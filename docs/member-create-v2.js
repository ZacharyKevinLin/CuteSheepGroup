const memberActionButton=document.querySelector('#actionBtn');

function openCreateMemberModal(){
  modal(`<div class="modal-head"><h2>新增成員與登入帳號</h2></div>
  <div class="form-grid">
    <label>姓名<input name="name" required></label>
    <label>登入識別<input name="login" required placeholder="例如 peter"></label>
    <label>生日<input name="birthday" type="date" required></label>
    <label>角色<select name="role"><option>小組員</option><option>副組長</option><option>小組長</option><option>已離開</option></select></label>
    <label>加入日期<input name="joined" type="date"></label>
  </div>
  <p class="login-help">初始密碼會自動設為生日 YYYYMMDD，首次登入後需更改。</p>
  <div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" id="createMemberAccountBtn">建立成員</button></div>`);
  document.querySelector('#createMemberAccountBtn').addEventListener('click',createMemberAccount);
}

async function createMemberAccount(){
  const form=new FormData(document.querySelector('#modalForm'));
  const name=String(form.get('name')||'').trim();
  const login=String(form.get('login')||'').trim();
  const birthday=String(form.get('birthday')||'');
  const role=String(form.get('role')||'小組員');
  const joined=String(form.get('joined')||'');
  if(!name||!login||!birthday)return alert('請填寫姓名、登入識別與生日');
  const button=document.querySelector('#createMemberAccountBtn');
  button.disabled=true;button.textContent='建立中…';
  const {data,error}=await db.functions.invoke('create-member',{body:{display_name:name,login_key:login,birthday,role,joined_at:joined||null}});
  if(error){button.disabled=false;button.textContent='建立成員';return alert(`建立失敗：${error.message}`)}
  if(data?.error){button.disabled=false;button.textContent='建立成員';return alert(`建立失敗：${data.error}`)}
  closeModal();
  await refresh('成員與登入帳號已建立');
}

memberActionButton.addEventListener('click',event=>{
  if(state.page==='members'&&isLeader()){
    event.preventDefault();
    event.stopImmediatePropagation();
    openCreateMemberModal();
  }
},true);
