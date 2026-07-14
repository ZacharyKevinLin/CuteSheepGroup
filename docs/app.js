const SUPABASE_URL='https://pctrxkixknoauonqhyji.supabase.co';
const SUPABASE_KEY='sb_publishable_oZ4mNa4Aow4tdnY6oIGiHA_0ZYERfTF';
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const state={profile:null,page:'dashboard',profiles:[],meetings:[],attendance:[],prayers:[],interviews:[]};
const titles={dashboard:['首頁','掌握小組近況'],members:['成員','成員資料與角色'],meetings:['聚會','聚會與出席紀錄'],prayers:['代禱','代禱事項'],interviews:['一對一','關懷與陪伴紀錄'],account:['帳號','登入與密碼設定']};
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function isLeader(){return state.profile?.role==='小組長'}
function canManage(){return ['小組長','副組長'].includes(state.profile?.role)}
function fmt(d){return d?new Date(`${d}T00:00:00`).toLocaleDateString('zh-TW'):'—'}
function modal(html){$('#modalBody').innerHTML=html;$('#modal').showModal()}
function closeModal(){ $('#modal').close() }

async function loadAll(){
  const queries=[
    db.from('profiles').select('*').order('display_name'),
    db.from('meetings').select('*').order('meeting_date',{ascending:false}),
    db.from('attendance').select('*'),
    db.from('prayer_records').select('*').order('created_at',{ascending:false}),
    db.from('interviews').select('*').order('interview_date',{ascending:false})
  ];
  const [p,m,a,r,i]=await Promise.all(queries);
  for(const x of [p,m,a,r,i]) if(x.error) throw x.error;
  state.profiles=p.data||[];state.meetings=m.data||[];state.attendance=a.data||[];state.prayers=r.data||[];state.interviews=i.data||[];
}

async function init(){
  $('#loginForm').addEventListener('submit',login);
  $('#logoutBtn').addEventListener('click',logout);
  $('#nav').addEventListener('click',e=>{const b=e.target.closest('button[data-page]');if(!b)return;state.page=b.dataset.page;render()});
  $('#actionBtn').addEventListener('click',primaryAction);
  const {data:{session}}=await db.auth.getSession();
  if(session) await enterApp(session.user.id); else showLogin();
  db.auth.onAuthStateChange((_event,session)=>{if(!session)showLogin()});
}
function showLogin(msg=''){$('#loginView').hidden=false;$('#app').hidden=true;$('#loginMsg').textContent=msg}
async function login(e){
  e.preventDefault();$('#loginMsg').textContent='登入中…';
  const email=$('#email').value.trim(),password=$('#password').value;
  const {data,error}=await db.auth.signInWithPassword({email,password});
  if(error)return showLogin(error.message);
  try{await enterApp(data.user.id)}catch(err){await db.auth.signOut();showLogin(`登入後讀取資料失敗：${err.message}`)}
}
async function enterApp(uid){
  const {data,error}=await db.from('profiles').select('*').eq('auth_user_id',uid).single();
  if(error)throw error;if(data.role==='已離開')throw new Error('此帳號已停用');
  state.profile=data;await loadAll();
  $('#who').textContent=`${data.display_name}｜${data.role}`;$('#loginView').hidden=true;$('#app').hidden=false;render();
}
async function logout(){await db.auth.signOut();state.profile=null;showLogin('你已安全登出。')}

function render(){
  const [title,sub]=titles[state.page];$('#title').textContent=title;$('#subtitle').textContent=sub;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===state.page));
  const action=$('#actionBtn');action.hidden=!((state.page==='members'&&isLeader())||(state.page==='meetings'&&canManage())||state.page==='prayers'||(state.page==='interviews'&&isLeader()));
  action.textContent={members:'新增成員',meetings:'新增聚會',prayers:'新增代禱',interviews:'新增一對一'}[state.page]||'新增';
  ({dashboard:renderDashboard,members:renderMembers,meetings:renderMeetings,prayers:renderPrayers,interviews:renderInterviews,account:renderAccount}[state.page]||renderDashboard)();
}
function renderDashboard(){
  const active=state.profiles.filter(x=>x.role!=='已離開').length;
  const recent=state.meetings[0];const present=recent?state.attendance.filter(x=>x.meeting_id===recent.id&&x.status==='出席').length:0;
  $('#content').innerHTML=`<div class="grid"><div class="card stat"><span>在組成員</span><strong>${active}</strong></div><div class="card stat"><span>聚會紀錄</span><strong>${state.meetings.length}</strong></div><div class="card stat"><span>待關心代禱</span><strong>${state.prayers.length}</strong></div></div><div class="card panel" style="margin-top:16px"><h2>最近聚會</h2>${recent?`<p><strong>${fmt(recent.meeting_date)}｜${esc(recent.topic||recent.meeting_type)}</strong></p><p>地點：${esc(recent.location||'—')}　出席：${present} 人</p>`:'<div class="empty">尚無聚會紀錄</div>'}</div>`;
}
function renderMembers(){
  $('#content').innerHTML=state.profiles.length?`<div class="table-wrap"><table><thead><tr><th>姓名</th><th>角色</th><th>加入日期</th><th>登入識別</th>${isLeader()?'<th>操作</th>':''}</tr></thead><tbody>${state.profiles.map(p=>`<tr><td>${esc(p.display_name)}</td><td><span class="pill">${esc(p.role)}</span></td><td>${fmt(p.joined_at)}</td><td>${esc(p.login_key)}</td>${isLeader()?`<td><button class="secondary" onclick="editMember('${p.id}')">編輯</button></td>`:''}</tr>`).join('')}</tbody></table></div>`:'<div class="empty">尚無成員資料</div>';
}
function renderMeetings(){
  $('#content').innerHTML=state.meetings.length?state.meetings.map(m=>{const rows=state.attendance.filter(a=>a.meeting_id===m.id);return `<div class="card panel"><h2>${fmt(m.meeting_date)}｜${esc(m.topic||m.meeting_type)}</h2><p>${esc(m.location||'未填地點')} · 出席 ${rows.filter(x=>x.status==='出席').length} 人</p>${canManage()?`<button class="secondary" onclick="manageAttendance('${m.id}')">管理出席</button>`:''}</div>`}).join(''):'<div class="empty">尚無聚會紀錄</div>';
}
function renderPrayers(){
  $('#content').innerHTML=state.prayers.length?state.prayers.map(r=>{const p=state.profiles.find(x=>x.id===r.profile_id);const mine=r.profile_id===state.profile.id;return `<div class="card panel"><strong>${esc(p?.display_name||'成員')}</strong><p>${esc(r.content)}</p><small>${new Date(r.created_at).toLocaleString('zh-TW')}</small>${(mine||isLeader())?`<div style="margin-top:12px"><button class="danger" onclick="deletePrayer('${r.id}')">刪除</button></div>`:''}</div>`}).join(''):'<div class="empty">尚無代禱紀錄</div>';
}
function renderInterviews(){
  $('#content').innerHTML=state.interviews.length?state.interviews.map(i=>{const p=state.profiles.find(x=>x.id===i.profile_id);return `<div class="card panel"><h2>${fmt(i.interview_date)}｜${esc(p?.display_name||'成員')}</h2><p>${esc(i.summary||'')}</p>${isLeader()&&i.private_note?`<small>私密備註：${esc(i.private_note)}</small>`:''}</div>`}).join(''):'<div class="empty">尚無一對一紀錄</div>';
}
function renderAccount(){
  $('#content').innerHTML=`<div class="card panel"><h2>${esc(state.profile.display_name)}</h2><p>角色：${esc(state.profile.role)}</p><p>登入識別：${esc(state.profile.login_key)}</p><button onclick="changePassword()">變更密碼</button></div>`;
}
function primaryAction(){({members:addMember,meetings:addMeeting,prayers:addPrayer,interviews:addInterview}[state.page]||(()=>{}))()}

function addMember(){modal(`<div class="modal-head"><h2>新增成員</h2></div><div class="form-grid"><label>姓名<input name="name" required></label><label>登入識別<input name="login" required></label><label>角色<select name="role"><option>小組員</option><option>副組長</option><option>小組長</option><option>已離開</option></select></label><label>加入日期<input name="joined" type="date"></label></div><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" onclick="saveMember()">儲存</button></div>`)}
async function saveMember(){const f=new FormData($('#modalForm'));const {error}=await db.from('profiles').insert({display_name:f.get('name'),login_key:f.get('login'),role:f.get('role'),joined_at:f.get('joined')||null,must_change_password:true});if(error)return alert(error.message);closeModal();await refresh('成員已新增')}
function editMember(id){const p=state.profiles.find(x=>x.id===id);modal(`<div class="modal-head"><h2>編輯成員</h2></div><div class="form-grid"><label>姓名<input name="name" value="${esc(p.display_name)}"></label><label>角色<select name="role">${['小組長','副組長','小組員','已離開'].map(r=>`<option ${p.role===r?'selected':''}>${r}</option>`).join('')}</select></label><label>加入日期<input name="joined" type="date" value="${p.joined_at||''}"></label></div><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" onclick="saveEditMember('${id}')">儲存</button></div>`)}
async function saveEditMember(id){const f=new FormData($('#modalForm'));const {error}=await db.from('profiles').update({display_name:f.get('name'),role:f.get('role'),joined_at:f.get('joined')||null}).eq('id',id);if(error)return alert(error.message);closeModal();await refresh('成員已更新')}
function addMeeting(){modal(`<div class="modal-head"><h2>新增聚會</h2></div><div class="form-grid"><label>日期<input name="date" type="date" required></label><label>類型<select name="type"><option>實體聚會</option><option>線上聚會</option><option>家庭聚會</option><option>其他</option></select></label><label class="full">主題<input name="topic"></label><label class="full">地點<input name="location"></label><label class="full">備註<textarea name="notes"></textarea></label></div><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" onclick="saveMeeting()">儲存</button></div>`)}
async function saveMeeting(){const f=new FormData($('#modalForm'));const {error}=await db.from('meetings').insert({meeting_date:f.get('date'),meeting_type:f.get('type'),topic:f.get('topic'),location:f.get('location'),notes:f.get('notes'),created_by:state.profile.id});if(error)return alert(error.message);closeModal();await refresh('聚會已新增')}
function manageAttendance(mid){const rows=state.profiles.filter(p=>p.role!=='已離開').map(p=>{const a=state.attendance.find(x=>x.meeting_id===mid&&x.profile_id===p.id);return `<label>${esc(p.display_name)}<select name="${p.id}">${['出席','請假','未到','新朋友'].map(s=>`<option ${a?.status===s?'selected':''}>${s}</option>`).join('')}</select></label>`}).join('');modal(`<div class="modal-head"><h2>管理出席</h2></div><div class="form-grid">${rows}</div><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" onclick="saveAttendance('${mid}')">儲存</button></div>`)}
async function saveAttendance(mid){const f=new FormData($('#modalForm'));const rows=state.profiles.filter(p=>p.role!=='已離開').map(p=>({meeting_id:mid,profile_id:p.id,status:f.get(p.id)}));const {error}=await db.from('attendance').upsert(rows,{onConflict:'meeting_id,profile_id'});if(error)return alert(error.message);closeModal();await refresh('出席已更新')}
function addPrayer(){const opts=state.profiles.map(p=>`<option value="${p.id}" ${p.id===state.profile.id?'selected':''}>${esc(p.display_name)}</option>`).join('');modal(`<div class="modal-head"><h2>新增代禱</h2></div><label>成員<select name="profile">${opts}</select></label><label>內容<textarea name="content" required></textarea></label><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" onclick="savePrayer()">儲存</button></div>`)}
async function savePrayer(){const f=new FormData($('#modalForm'));const {error}=await db.from('prayer_records').insert({profile_id:f.get('profile'),content:f.get('content')});if(error)return alert(error.message);closeModal();await refresh('代禱已新增')}
async function deletePrayer(id){if(!confirm('確定刪除？'))return;const {error}=await db.from('prayer_records').delete().eq('id',id);if(error)return alert(error.message);await refresh('代禱已刪除')}
function addInterview(){const opts=state.profiles.map(p=>`<option value="${p.id}">${esc(p.display_name)}</option>`).join('');modal(`<div class="modal-head"><h2>新增一對一</h2></div><div class="form-grid"><label>成員<select name="profile">${opts}</select></label><label>日期<input name="date" type="date" required></label><label class="full">摘要<textarea name="summary"></textarea></label><label class="full">私密備註<textarea name="private"></textarea></label></div><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" onclick="saveInterview()">儲存</button></div>`)}
async function saveInterview(){const f=new FormData($('#modalForm'));const {error}=await db.from('interviews').insert({profile_id:f.get('profile'),interview_date:f.get('date'),summary:f.get('summary'),private_note:f.get('private'),created_by:state.profile.id});if(error)return alert(error.message);closeModal();await refresh('一對一已新增')}
function changePassword(){modal(`<div class="modal-head"><h2>變更密碼</h2></div><label>新密碼<input name="password" type="password" minlength="8" required></label><label>再次輸入<input name="confirm" type="password" minlength="8" required></label><div class="modal-actions"><button value="cancel" class="secondary">取消</button><button type="button" onclick="savePassword()">更新密碼</button></div>`)}
async function savePassword(){const f=new FormData($('#modalForm')),p=f.get('password'),c=f.get('confirm');if(p.length<8)return alert('至少 8 個字元');if(p!==c)return alert('兩次密碼不同');const {error}=await db.auth.updateUser({password:p});if(error)return alert(error.message);await db.from('profiles').update({must_change_password:false}).eq('id',state.profile.id);closeModal();toast('密碼已更新')}
async function refresh(msg){await loadAll();render();toast(msg)}

Object.assign(window,{editMember,saveMember,saveEditMember,saveMeeting,manageAttendance,saveAttendance,savePrayer,deletePrayer,saveInterview,changePassword,savePassword});
init();