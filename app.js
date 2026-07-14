// v23: login member selector now starts with a neutral placeholder.
if ('serviceWorker' in navigator) { navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{}); }
if ('caches' in window) { caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).catch(()=>{}); }


const KEY='sheep-group-data-v1';
const SESSION_KEY='sheep-group-session-v1';
let data=migrateData(loadData()), page='dashboard';
let session=loadSession();
let memberSort={key:'name',dir:'asc'};
const $=s=>document.querySelector(s);
const view=$('#view'), modal=$('#modal'), modalBody=$('#modalBody');

function loadData(){try{return JSON.parse(localStorage.getItem(KEY))||structuredClone(window.INITIAL_DATA)}catch(e){return structuredClone(window.INITIAL_DATA)}}
function defaultPermissions(){return {
 '小組長':{dashboard:{read:true,write:true},members:{read:true,write:true},meetings:{read:true,write:true},prayers:{read:true,write:true},interviews:{read:true,write:true},analysis:{read:true,write:false},settings:{read:true,write:true}},
 '副組長':{dashboard:{read:true,write:false},members:{read:true,write:false},meetings:{read:true,write:true},prayers:{read:true,write:true},interviews:{read:false,write:false},analysis:{read:true,write:false},settings:{read:true,write:false}},
 '小組員':{dashboard:{read:true,write:false},members:{read:true,write:true},meetings:{read:true,write:false},prayers:{read:true,write:true},interviews:{read:false,write:false},analysis:{read:false,write:false},settings:{read:true,write:false}},
 '已離開':{dashboard:{read:false,write:false},members:{read:false,write:false},meetings:{read:false,write:false},prayers:{read:false,write:false},interviews:{read:false,write:false},analysis:{read:false,write:false},settings:{read:true,write:false}}
}}
function migrateData(d){
 const noteFields=['relationship','faith','faithGeneration','service','devotion','prayerLife','stability','bible','hunger','spiritualState','familyRelationship','interpersonalRelationship','wellbeing'];
 d.members=(d.members||[]).map(m=>{noteFields.forEach(k=>m[k+'Note']=m[k+'Note']||'');m.faithGeneration=m.faithGeneration||'';m.baptismDate=m.baptismDate||'';m.serviceDetail=m.serviceDetail||'';m.serviceBonus=Number(m.serviceBonus||0);m.pressureSources=Array.isArray(m.pressureSources)?m.pressureSources:[];m.familyRelationship=m.familyRelationship||'';m.interpersonalRelationship=m.interpersonalRelationship||'';m.wellbeing=m.wellbeing||'';m.temptations=Array.isArray(m.temptations)?m.temptations:[];m.breakthroughs=Array.isArray(m.breakthroughs)?m.breakthroughs:[];m.stuckPoints=Array.isArray(m.stuckPoints)?m.stuckPoints:[];if(!m.role){if(m.name==='Zachary')m.role='小組長';else if(m.name==='Tom')m.role='副組長';else if(m.status==='已離組')m.role='離開';else m.role='小組員'}if(m.role==='組長')m.role='小組長';if(m.role==='離開')m.role='已離開';return m});
 d.meetings=(d.meetings||[]).map(m=>{if(!m.meetingType)m.meetingType='實體聚會';if(!m.meetingTypeOther)m.meetingTypeOther='';return m});d.interviews=d.interviews||[];
 if(!d.access)d.access={role:'小組長',memberId:(d.members.find(m=>m.role==='小組長')||d.members[0]||{}).id||''};
 if(d.access.role==='一般同工'||d.access.role==='成員本人')d.access.role='小組員';if(d.access.role==='已離組成員')d.access.role='已離開';
 const defaults=defaultPermissions();d.permissions=d.permissions||{};Object.keys(defaults).forEach(role=>{d.permissions[role]=d.permissions[role]||{};Object.keys(defaults[role]).forEach(res=>{d.permissions[role][res]={...defaults[role][res],...(d.permissions[role][res]||{})}})});
 d.accounts=d.accounts||{};
 d.members.forEach(m=>{
  d.accounts[m.id]={memberId:m.id,passwordHash:'',salt:'',mustChange:true,...(d.accounts[m.id]||{})};
 });
 return d
}

function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY))||null}catch(e){return null}}
function saveSession(value){session=value;if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY)}
function defaultPassword(member){return String(member?.birthday||'').replace(/\D/g,'').slice(0,8)}
function randomSalt(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function hashPassword(password,salt){
 const bytes=new TextEncoder().encode(`${salt}:${password}`);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')
}
async function verifyPassword(member,password){
 const account=data.accounts?.[member.id];
 if(!account)return false;
 if(!account.passwordHash)return password===defaultPassword(member);
 return (await hashPassword(password,account.salt))===account.passwordHash
}
async function setMemberPassword(memberId,password,mustChange=false){
 const account=data.accounts[memberId]||(data.accounts[memberId]={memberId,passwordHash:'',salt:'',mustChange:true});
 const salt=randomSalt();account.salt=salt;account.passwordHash=await hashPassword(password,salt);account.mustChange=mustChange;account.updatedAt=new Date().toISOString();save()
}
function sessionMember(){return data.members.find(m=>m.id===session?.memberId)}
function showLogin(message=''){
 const login=$('#loginScreen'),shell=$('#appShell');if(login)login.hidden=false;if(shell)shell.hidden=true;
 $('#loginGroupName').textContent=data.groupName||'羊咩咩小組';
 const select=$('#loginMember');
 select.innerHTML=`<option value="" selected disabled>請選擇成員</option>`+data.members.filter(m=>m.role!=='已離開').sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant')).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
 select.value='';
 const err=$('#loginError');err.textContent=message;err.hidden=!message;
}
function showApp(member){
 data.access={role:member.role,memberId:member.id};save();
 $('#loginScreen').hidden=true;$('#appShell').hidden=false;page=allowedPages()[0]||'members';render()
}
async function handleLogin(event){
 event.preventDefault();
 const memberId=$('#loginMember').value,password=$('#loginPassword').value;
 if(!memberId)return showLogin('請先選擇成員。');
 const member=data.members.find(m=>m.id===memberId);
 if(!member)return showLogin('找不到這位成員。');
 if(member.role==='已離開')return showLogin('此帳號已停用，請聯絡小組長。');
 if(!(await verifyPassword(member,password)))return showLogin('密碼錯誤，請重新輸入。');
 saveSession({memberId:member.id,loginAt:new Date().toISOString()});$('#loginPassword').value='';showApp(member);
 if(data.accounts[member.id]?.mustChange)toast('目前使用預設或臨時密碼，建議立即變更密碼')
}
window.logout=()=>{saveSession(null);data.access={role:'已離開',memberId:''};save();showLogin('你已安全登出。')}
async function initAuth(){
 $('#loginForm').addEventListener('submit',handleLogin);
 $('#logoutButton').addEventListener('click',logout);
 const member=sessionMember();
 if(member&&member.role!=='已離開')showApp(member);else{saveSession(null);showLogin()}
}
window.openAccountMenu=()=>openModal(`<div class="modal-head"><h2>帳號資訊 <span class="title-en small">ACCOUNT</span></h2><button class="icon-btn" value="cancel">×</button></div><div class="detail-grid"><div class="detail-cell"><small>登入成員</small><strong>${esc(currentMember()?.name||'—')}</strong></div><div class="detail-cell"><small>角色</small><strong>${esc(accessRole())}</strong></div><div class="detail-cell"><small>密碼狀態</small><strong>${data.accounts?.[currentMember()?.id]?.mustChange?'建議變更':'已自訂'}</strong></div></div><div class="modal-actions"><button type="button" class="secondary" onclick="modal.close();changeOwnPassword()">變更密碼</button><button type="button" class="danger secondary" onclick="logout()">登出</button></div>`)
window.changeOwnPassword=()=>openModal(`<div class="modal-head"><h2>變更密碼 <span class="title-en small">CHANGE PASSWORD</span></h2><button class="icon-btn" value="cancel">×</button></div><div class="form-grid"><div class="field full"><label>目前密碼</label><input type="password" name="currentPassword" autocomplete="current-password"></div><div class="field"><label>新密碼</label><input type="password" name="newPassword" autocomplete="new-password" minlength="8"></div><div class="field"><label>再次輸入新密碼</label><input type="password" name="confirmPassword" autocomplete="new-password" minlength="8"></div></div><div class="modal-actions"><button class="secondary" value="cancel">取消</button><button type="button" class="primary" id="saveOwnPassword">儲存新密碼</button></div>`);
document.addEventListener('click',async e=>{
 if(e.target?.id!=='saveOwnPassword')return;
 const member=currentMember(),fd=new FormData($('#modalForm')),current=fd.get('currentPassword')||'',next=fd.get('newPassword')||'',confirm=fd.get('confirmPassword')||'';
 if(!member||!(await verifyPassword(member,current)))return alert('目前密碼不正確');
 if(next.length<8)return alert('新密碼至少需要 8 個字元');
 if(next!==confirm)return alert('兩次輸入的新密碼不同');
 await setMemberPassword(member.id,next,false);modal.close();toast('密碼已更新');
});
window.resetPasswordToBirthday=memberId=>{
 if(!isLeader())return toast('只有小組長可以重設密碼');
 const m=data.members.find(x=>x.id===memberId);if(!m)return;
 if(!defaultPassword(m))return alert('此成員沒有完整生日，無法使用生日密碼');
 if(!confirm(`確定將 ${m.name} 的密碼重設為生日 YYYYMMDD？`))return;
 data.accounts[memberId]={...data.accounts[memberId],memberId,passwordHash:'',salt:'',mustChange:true,updatedAt:new Date().toISOString()};save();render();toast('已重設為生日密碼');
}
window.setTemporaryPassword=memberId=>{
 if(!isLeader())return toast('只有小組長可以設定臨時密碼');
 const m=data.members.find(x=>x.id===memberId);if(!m)return;
 const password=prompt(`請輸入 ${m.name} 的臨時密碼（至少 8 個字元）`);
 if(password===null)return;if(password.length<8)return alert('臨時密碼至少需要 8 個字元');
 setMemberPassword(memberId,password,true).then(()=>{render();alert(`臨時密碼已設定。請安全地單獨告知 ${m.name}，登入後請立即更改。`)});
}

window.changeMemberRole=(memberId,newRole,selectEl)=>{
 if(!isLeader()){toast('只有小組長可以調整角色');render();return}
 const member=data.members.find(m=>m.id===memberId);
 if(!member)return;
 const oldRole=member.role||'小組員';
 if(oldRole===newRole)return;
 const activeLeaders=data.members.filter(m=>m.role==='小組長'&&m.id!==memberId);
 if(oldRole==='小組長'&&newRole!=='小組長'&&activeLeaders.length===0){
  alert('系統至少需要保留一位小組長，無法將最後一位小組長降級。');
  selectEl.value=oldRole;
  return;
 }
 const roleLabels={小組長:'完整管理權限',副組長:'依角色權限設定',小組員:'僅本人範圍',已離開:'停用登入'};
 if(!confirm(`確定將 ${member.name} 的角色改為「${newRole}」？\n${roleLabels[newRole]||''}`)){
  selectEl.value=oldRole;
  return;
 }
 member.role=newRole;
 if(newRole==='已離開'){
  const account=data.accounts?.[memberId];
  if(account)account.disabledAt=new Date().toISOString();
  if(session?.memberId===memberId){
   save();
   saveSession(null);
   showLogin('此帳號已設為離開，登入權限已停用。');
   return;
  }
 }else{
  const account=data.accounts?.[memberId];
  if(account)delete account.disabledAt;
 }
 if(session?.memberId===memberId){
  data.access={role:newRole,memberId};
 }
 save();
 render();
 toast(`${member.name} 已改為${newRole}`);
}

function accountManagementHtml(){
 if(!isLeader())return '';
 return `<div class="card account-management" style="margin-top:16px"><div class="section-title"><h2>成員帳號管理 <small class="section-en">ACCOUNT MANAGEMENT</small></h2></div><p class="export-intro">系統不會保存或顯示可讀取的現有密碼。忘記密碼時，可重設為生日密碼，或設定一次性的臨時密碼。</p><div class="table-wrap"><table class="table account-table"><thead><tr><th>成員</th><th>角色</th><th>密碼狀態</th><th>操作</th></tr></thead><tbody>${data.members.map(m=>{const a=data.accounts[m.id]||{};return `<tr><td><strong>${esc(m.name)}</strong></td><td><select class="role-select" onchange="changeMemberRole('${m.id}',this.value,this)">${['小組長','副組長','小組員','已離開'].map(r=>`<option value="${r}" ${m.role===r?'selected':''}>${r}</option>`).join('')}</select></td><td>${m.role==='已離開'?'<span class="pill danger">帳號停用</span>':a.passwordHash?(a.mustChange?'<span class="pill warn">臨時密碼</span>':'<span class="pill">已自訂</span>'):'<span class="pill warn">生日預設</span>'}</td><td><button class="link" onclick="resetPasswordToBirthday('${m.id}')">重設為生日</button>　<button class="link" onclick="setTemporaryPassword('${m.id}')">設定臨時密碼</button></td></tr>`}).join('')}</tbody></table></div></div>`;
}

const MEMBER_OPTIONS={
 relationship:['單身','穩定交往中','曖昧／了解中','已訂婚','已婚','分手調適中','關係複雜／待了解','不便透露'],
 faith:[['慕道中',1],['初信',2],['穩定成長中',3],['受洗未久',4],['已受洗',5],['已重生得救且穩定聚會',6],['信仰冷淡中',2],['重新恢復中',3],['待觀察',0]],
 faithGeneration:['初代','1代','2代','3代（含）以上'],
 service:[['尚未參與',0],['偶爾參與',1],['穩定參與',2],['核心同工',3],['預備投入',1],['暫停服事中',0],['不適合現階段服事',0],['待確認',0]],
 devotion:[['幾乎沒有',0],['偶爾',1],['每週1-2次',2],['每週3-4次',3],['幾乎每天',4],['穩定且固定時間',5],['最近中斷中',0],['待了解',0]],
 prayerLife:[['幾乎沒有',0],['偶爾想到才禱告',1],['有需要時會禱告',2],['每週數次',3],['幾乎每天',4],['穩定且深入',5],['常願意為人代禱',6],['最近較少',1],['待了解',0]],
 stability:[['幾乎未出席',0],['偶爾出席',1],['約一半時間出席',2],['大多數時間出席',3],['穩定出席',4],['非常穩定且主動',5],['最近不穩定',1],['請假／特殊狀況中',0]],
 bible:[['幾乎沒有',0],['偶爾閱讀',1],['跟著聚會進度',2],['每週固定閱讀',3],['幾乎每天閱讀',4],['有系統讀經中',5],['讀經有困難',1],['最近中斷',0],['待了解',0]],
 hunger:[['很低',0],['偏低',1],['普通',2],['穩定',3],['高',4],['很高',5],['願意主動追求',6],['有興趣但不穩定',1],['待觀察',0]],
 spiritualState:[['穩定成長中',5],['持續被建立中',4],['渴慕神但不穩定',3],['聚會穩定但生命需突破',4],['正在經歷低潮',3],['信仰冷淡中',1],['正在恢復中',3],['願意敞開被陪伴',4],['有掙扎但願意面對',4],['需要更多關懷',2],['待觀察',0]],
 pressureSources:['家庭','感情','工作','課業','經濟','健康','人際','服事','未來方向','時間管理','自我期待','屬靈低潮','無明顯壓力','待了解'],
 familyRelationship:['融洽穩定','大致良好','普通','有些緊張','常有衝突','疏離','缺乏支持','有壓力來源','正在改善中','複雜待了解'],
 interpersonalRelationship:['穩定良好','大致良好','普通','有些疏離','缺乏連結','有衝突','容易受傷','容易封閉','正在修復中','有支持系統','待觀察'],
 wellbeing:['穩定良好','大致穩定','稍顯疲憊','作息失衡','睡眠不足','壓力偏高','身心疲累','情緒低落','正在調整中','待了解'],
 temptations:['懶散被動','拖延','情緒低落','焦慮憂心','容易分心','容易比較','容易自責','容易逃避','人際敏感','容易受傷','血氣反應','驕傲防衛','情慾試探','金錢壓力','屬靈冷淡','缺乏節制','暫無明顯','待了解'],
 breakthroughs:['靈修更穩定','禱告更真實','聚會更穩定','更願意敞開','更願意悔改','家庭關係改善','感情觀更健康','工作／課業更有節奏','情緒較穩定','開始願意服事','更能信靠神','開始面對問題','暫無明顯突破','待觀察'],
 stuckPoints:['靈修不穩','禱告停滯','聚會不穩定','情緒低潮','家庭壓力','感情困擾','工作／課業壓力','人際受傷','缺乏方向','內在控告','反覆軟弱','不願敞開','委身不足','屬靈冷淡','暫無明顯卡住','待了解']
};
const SCORE_FIELDS=['faith','service','devotion','prayerLife','stability','bible','hunger','spiritualState'];
const FIELD_LABELS={
 relationship:'感情狀態',faith:'信仰狀態',faithGeneration:'信仰世代',service:'服事參與',
 devotion:'靈修習慣',prayerLife:'禱告生活',stability:'聚會穩定度',bible:'讀經狀況',
 hunger:'對真理的渴慕程度',spiritualState:'目前屬靈光景',pressureSources:'壓力來源',
 familyRelationship:'家庭關係',interpersonalRelationship:'人際關係',wellbeing:'作息與身心狀況',
 temptations:'試探或軟弱',breakthroughs:'生命突破',stuckPoints:'生命卡住點'
};
function ensureOptionConfig(){
 data.optionConfig=data.optionConfig||{};
 Object.keys(MEMBER_OPTIONS).forEach(field=>{
  if(!Array.isArray(data.optionConfig[field])){
   data.optionConfig[field]=(MEMBER_OPTIONS[field]||[]).map(x=>Array.isArray(x)?{label:x[0],score:Number(x[1]||0)}:{label:x,score:0});
  }else{
   data.optionConfig[field]=data.optionConfig[field].map(x=>typeof x==='string'?{label:x,score:0}:{label:String(x.label||''),score:Number(x.score||0)}).filter(x=>x.label);
  }
 });
}
ensureOptionConfig();
function optionRows(field, fallback=[]){
 const configured=data.optionConfig?.[field];
 if(Array.isArray(configured))return configured;
 return (fallback||[]).map(x=>Array.isArray(x)?{label:x[0],score:Number(x[1]||0)}:{label:x,score:0});
}
function optionScore(field,value){const row=optionRows(field).find(x=>x.label===value);return row?Number(row.score||0):0}
function growthIndex(m){
 const attendance=attendanceRate(m)/10;
 const base=SCORE_FIELDS.reduce((sum,key)=>sum+optionScore(key,m[key]),0);
 const serviceBonus=Math.max(0,Math.min(3,Number(m.serviceBonus||0)));
 return Math.round((attendance+base+serviceBonus)*20)/10;
}
function scoreBreakdown(m){return {
 attendance:Math.round(attendanceRate(m))/10,faith:optionScore('faith',m.faith),service:optionScore('service',m.service)+Number(m.serviceBonus||0),
 devotion:optionScore('devotion',m.devotion),prayerLife:optionScore('prayerLife',m.prayerLife),stability:optionScore('stability',m.stability),
 bible:optionScore('bible',m.bible),hunger:optionScore('hunger',m.hunger),spiritualState:optionScore('spiritualState',m.spiritualState)
}}
function selectField(label,name,value,options,enabled=true,scoreField='',noteValue=''){
 const rows=optionRows(name,options).map(x=>`<option value="${esc(x.label)}" ${value===x.label?'selected':''}>${esc(x.label)}</option>`).join('');
 const hasNote=String(noteValue||'').trim().length>0;
 return `<div class="field full select-note-field ${hasNote?'note-open':''}" data-note-field="${name}">
  <div class="select-note-head">
   <div class="select-side"><label>${label}</label><select name="${name}" ${enabled?'':'disabled'}><option value="">請選擇</option>${rows}</select></div>
   ${enabled?`<button type="button" class="note-toggle ${hasNote?'active':''}" onclick="toggleFieldNote('${name}',this)" aria-expanded="${hasNote?'true':'false'}">${hasNote?'✎ 編輯備註':'＋ 備註'}</button>`:''}
  </div>
  <div class="note-panel">
   <label>補充說明</label>
   <textarea name="${name}Note" ${enabled?'':'disabled'} placeholder="例如：目前交往中，對象尚未認識小組">${esc(noteValue||'')}</textarea>
  </div>
 </div>`
}
function multiField(label,name,values,options,enabled=true){
 const selected=Array.isArray(values)?values:[];
 return `<div class="field full"><label>${label}</label><div class="multi-select-box">${optionRows(name,options).map(x=>`<label class="multi-option"><input type="checkbox" name="${name}" value="${esc(x.label)}" ${selected.includes(x.label)?'checked':''} ${enabled?'':'disabled'}><span>${esc(x.label)}</span></label>`).join('')}</div></div>`
}
function formArray(fd,name){return fd.getAll(name).filter(Boolean)}
function updateGrowthPreview(form,m={}){
 if(!form)return;const fd=new FormData(form),temp={...m,...Object.fromEntries(fd)};
 temp.serviceBonus=Number(fd.get('serviceBonus')||0);
 const preview=form.querySelector('[data-growth-preview]');if(preview)preview.textContent=growthIndex(temp).toFixed(1);
}

window.toggleFieldNote=(name,btn)=>{
 const field=btn.closest('.select-note-field');
 const open=!field.classList.contains('note-open');
 field.classList.toggle('note-open',open);
 btn.classList.toggle('active',open);
 btn.textContent=open?'✎ 編輯備註':'＋ 備註';
 btn.setAttribute('aria-expanded',open?'true':'false');
 if(open)setTimeout(()=>field.querySelector('.note-panel textarea')?.focus(),80);
}

function meetingTitle(m){return m.meetingType==='其他'?(m.meetingTypeOther||'其他聚會'):(m.meetingType||'實體聚會')}
function meetingSubtitle(m){return [m.topic,m.scripture,m.location].filter(Boolean).join('・')||m.notes||'出席與代禱紀錄'}
function isActive(m){return m.role!=='已離開'}
function accessRole(){return currentMember()?.role||data.access?.role||'已離開'}
function currentMember(){return data.members.find(m=>m.id===data.access?.memberId)}
function canAccessMember(id){return !isSelfMember()||currentMember()?.id===id}
function visibleMembers(){return isSelfMember()?(currentMember()?[currentMember()]:[]):data.members}
function canEditMemberRecord(id){return permission('members','write')&&(!isSelfMember()||currentMember()?.id===id)}
function permission(resource,mode='read'){return !!data.permissions?.[accessRole()]?.[resource]?.[mode]}
function isLeader(){return accessRole()==='小組長'}
function isDeputy(){return accessRole()==='副組長'}
function isSelfMember(){return accessRole()==='小組員'}
function isDisabled(){return accessRole()==='已離開'}
function canViewPrivate(){return permission('interviews','read')}
function canManageMembers(){return permission('members','write')}
function canEditMeeting(){return permission('meetings','write')||permission('prayers','write')}
function canDeleteMeeting(){return permission('meetings','write')}
function allowedPages(){const map={dashboard:'dashboard',members:'members',meetings:'meetings',interviews:'interviews',analysis:'analysis',settings:'settings'};return Object.keys(map).filter(p=>permission(map[p],'read'))}
function accessLabel(){const m=currentMember();return `${m?.name||'未登入'} · ${accessRole()}`}
function applyAccessUI(){const allowed=allowedPages();document.querySelectorAll('#nav button').forEach(b=>b.hidden=!allowed.includes(b.dataset.page));if(!allowed.includes(page))page=allowed[0];const badge=$('#accessBadge');if(badge)badge.textContent=accessLabel()}
function save(){data.updatedAt=new Date().toISOString();localStorage.setItem(KEY,JSON.stringify(data));toast('已儲存')}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function fmtDate(v){if(!v)return '—';return new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'short',day:'numeric'}).format(new Date(v+'T00:00:00'))}
function daysUntil(v){return Math.ceil((new Date(v+'T00:00:00')-new Date())/86400000)}
function initials(n){return [...n].slice(0,2).join('')}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
function latestMeetings(){return [...data.meetings].sort((a,b)=>b.date.localeCompare(a.date))}
function attendanceRate(member){const rec=latestMeetings().slice(0,12);if(!rec.length)return member.attendanceRate||0;return Math.round(rec.filter(m=>m.attendance?.[member.name]).length/rec.length*100)}
function birthdayDays(m){if(!m.birthday)return 999;const now=new Date(), b=new Date(m.birthday+'T00:00:00');let next=new Date(now.getFullYear(),b.getMonth(),b.getDate());if(next<new Date(now.getFullYear(),now.getMonth(),now.getDate()))next.setFullYear(now.getFullYear()+1);return Math.ceil((next-now)/86400000)}
function setPage(p){if(!allowedPages().includes(p)){toast('目前權限無法開啟此頁');return}page=p;document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));render()}
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>setPage(b.dataset.page));
document.addEventListener('click',e=>{if(e.target.closest('.hover-panel'))e.stopPropagation()});

function render(){
 applyAccessUI();
 if(isDisabled()&&page!=='settings'){page='settings'}
 const map={dashboard:['首頁','Dashboard','今日關懷中心：提醒、待辦與近期動態','＋ 新增聚會'],members:['成員管理','Members','查找與更新成員資料','＋ 新增成員'],meetings:[isSelfMember()?'我的代禱':'聚會紀錄',isSelfMember()?'My Prayers':'Meetings',isSelfMember()?'只能查看並填寫自己的代禱事項':'記錄出席、代禱與聚會內容','＋ 新增聚會'],interviews:['一對一陪伴','One-on-One','持續追蹤生命近況與行動目標','＋ 新增訪談'],analysis:['小組分析','Analytics','用長期數據比較出席、代禱與陪伴趨勢','重新整理'],settings:['設定','Settings','存取身分、角色權限與資料管理','匯出備份']};
 $('#pageTitle').innerHTML=`${map[page][0]} <span class="title-en">${map[page][1]}</span>`;$('#pageSubtitle').textContent=map[page][2];$('#mainAction').textContent=map[page][3];
 const action=$('#mainAction');action.hidden=false;
 if(page==='members'){action.hidden=isSelfMember()||!permission('members','write');action.textContent='＋ 新增成員';action.onclick=()=>memberForm()}
 else if(page==='interviews'){action.hidden=!permission('interviews','write');action.onclick=()=>interviewForm()}
 else if(page==='analysis'){action.onclick=renderAnalysis}
 else if(page==='settings'){action.hidden=!permission('settings','write');action.onclick=exportData}
 else if(page==='meetings'){action.hidden=!permission('meetings','write');action.onclick=()=>meetingForm()}
 ({dashboard:renderDashboard,members:renderMembers,meetings:renderMeetings,interviews:renderInterviews,analysis:renderAnalysis,settings:renderSettings}[page])();
}

function renderDashboard(){
 const active=data.members.filter(isActive);
 const recent=latestMeetings()[0];
 const avg=active.length?Math.round(active.reduce((s,m)=>s+attendanceRate(m),0)/active.length):0;
 const birthdays=active.filter(m=>birthdayDays(m)<=30).sort((a,b)=>birthdayDays(a)-birthdayDays(b));
 const interviewDue=active.filter(m=>!m.nextInterview||daysUntil(m.nextInterview)<=0);
 const low=active.filter(m=>attendanceRate(m)<60);
 const ranked=[...active].sort((a,b)=>attendanceRate(b)-attendanceRate(a)||a.name.localeCompare(b.name,'zh-Hant'));
 const roleOrder={'小組長':1,'副組長':2,'小組員':3};
 const orderedMembers=[...active].sort((a,b)=>(roleOrder[a.role]||9)-(roleOrder[b.role]||9)||a.name.localeCompare(b.name,'zh-Hant'));
 const recentAttendees=recent?active.filter(m=>recent.attendance?.[m.name]):[];
 const panel=(title,body)=>`<div class="hover-panel" onclick="event.stopPropagation()"><h4>${title}</h4><div class="hover-scroll">${body}</div></div>`;
 const memberTip=orderedMembers.map(m=>`<div class="hover-row"><strong>${esc(m.name)}</strong><span>${esc(m.role||'小組員')}</span></div>`).join('');
 const attendanceTip=ranked.map(m=>`<div class="hover-row"><strong>${esc(m.name)}</strong><span>${attendanceRate(m)}%</span></div>`).join('');
 const recentTip=recentAttendees.length?recentAttendees.map(m=>`<div class="hover-row"><strong>${esc(m.name)}</strong><span>${esc(m.role||'小組員')}</span></div>`).join(''):'<div class="hover-row"><span>尚無出席成員</span></div>';
 const interviewTip=interviewDue.length?interviewDue.map(m=>`<div class="hover-row"><strong>${esc(m.name)}</strong><span>${m.nextInterview?fmtDate(m.nextInterview):'未設定日期'}</span></div>`).join(''):'<div class="hover-row"><span>目前無待訪談成員</span></div>';
 view.innerHTML=`
 <div class="grid kpis">
  <button class="card kpi kpi-action" onclick="setPage('members')"><small>目前成員 <b>ACTIVE MEMBERS</b></small><strong>${active.length}</strong><em>點擊前往成員管理</em>${panel('目前成員與身分',memberTip)}</button>
  <button class="card kpi kpi-action" onclick="setPage('analysis')"><small>平均出席率 <b>AVG. ATTENDANCE</b></small><strong>${avg}%</strong><em>依最近 12 次聚會</em>${panel('出席率由高到低',attendanceTip)}</button>
  <button class="card kpi kpi-action" onclick="${recent?`goMeeting('${recent.id}')`:`setPage('meetings')`}"><small>最近聚會 <b>LATEST MEETING</b></small><strong>${recent?recentAttendees.length:0} 人</strong><em>${recent?fmtDate(recent.date):'尚無紀錄'}</em>${panel('出席成員',recentTip)}</button>
  <button class="card kpi kpi-action" onclick="${permission('interviews','read')?"setPage('interviews')":"toast('目前角色沒有一對一紀錄讀取權限')"}"><small>待訪談 <b>INTERVIEW DUE</b></small><strong>${interviewDue.length}</strong><em>已到期或未設定</em>${panel('待訪談名單',interviewTip)}</button>
 </div>
 <div class="grid two">
  <div class="card"><div class="section-title"><h2>需要留意 <small class="section-en">CARE NEEDED</small></h2></div><div class="list">${[...low,...interviewDue].filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).slice(0,6).map(m=>`<button class="list-item list-button" onclick="goMember('${m.id}')"><div class="person"><div class="avatar">${initials(m.name)}</div><div><strong>${esc(m.name)}</strong><p>${attendanceRate(m)<60?'近期出席率偏低':'一對一訪談需追蹤'}</p></div></div><span class="pill ${attendanceRate(m)<60?'danger':'warn'}">${attendanceRate(m)}%</span></button>`).join('')||'<div class="empty">目前沒有特別警示 🎉</div>'}</div></div>
  <div class="card"><div class="section-title"><h2>30 天內生日 <small class="section-en">UPCOMING BIRTHDAYS</small></h2></div><div class="list">${birthdays.map(m=>`<button class="list-item list-button" onclick="goMember('${m.id}')"><div class="person"><div class="avatar">🎂</div><div><strong>${esc(m.name)}</strong><p>${fmtDate(m.birthday)}</p></div></div><span class="pill">${birthdayDays(m)} 天後</span></button>`).join('')||'<div class="empty">近期無生日</div>'}</div></div>
 </div>
 <div class="card" style="margin-top:16px"><div class="section-title"><h2>近期聚會 <small class="section-en">RECENT MEETINGS</small></h2><button class="link" onclick="setPage('meetings')">完整紀錄</button></div><div class="list">${latestMeetings().slice(0,4).map(meetingRow).join('')||'<div class="empty">尚無聚會紀錄</div>'}</div></div>`;
}

function meetingRow(m){const n=Object.values(m.attendance||{}).filter(Boolean).length;return `<button class="list-item calendar-row list-button" onclick="goMeeting('${m.id}')"><strong>${fmtDate(m.date)}</strong><div><strong>${esc(meetingTitle(m))}</strong><p>${esc(meetingSubtitle(m))}</p></div><span class="pill">${n} 人出席</span></button>`}

function renderMembers(){
 const selfOnly=isSelfMember(), me=currentMember();
 if(selfOnly&&!me){view.innerHTML='<div class="empty">尚未指定對應成員，請到設定選擇本人。</div>';return}
 if(selfOnly){renderSelfMemberPage(me);return}
 view.innerHTML=`<div class="toolbar"><input id="memberSearch" placeholder="搜尋姓名、職業、居住地…"><select id="memberStatus"><option value="">全部身分</option><option>小組長</option><option>副組長</option><option>小組員</option><option>已離開</option></select><button class="secondary export-btn" onclick="openMemberExport('')">⇩ 匯出 Excel</button></div><div id="memberTable"></div>`;
 const sortValue=(m,key)=>({name:m.name||'',role:({'小組長':1,'副組長':2,'小組員':3,'已離開':4}[m.role]||9),job:(m.job||'')+' '+(m.location||''),faith:m.faith||'',attendance:attendanceRate(m),nextInterview:m.nextInterview||'9999-12-31'}[key]);
 const update=()=>{const q=($('#memberSearch')?.value||'').trim().toLowerCase(),st=$('#memberStatus')?.value||'';let rows=visibleMembers().filter(m=>(!st||m.role===st)&&JSON.stringify(m).toLowerCase().includes(q));rows.sort((a,b)=>{const av=sortValue(a,memberSort.key),bv=sortValue(b,memberSort.key);const cmp=typeof av==='number'?av-bv:String(av).localeCompare(String(bv),'zh-Hant');return memberSort.dir==='asc'?cmp:-cmp});
 const th=(label,key)=>`<th><button class="sort-head ${memberSort.key===key?'active':''}" onclick="sortMembers('${key}')">${label}<span>${memberSort.key===key?(memberSort.dir==='asc'?'▲':'▼'):'↕'}</span></button></th>`;
 $('#memberTable').innerHTML=`<div class="table-wrap"><table class="table"><thead><tr>${th('成員','name')}${th('身分','role')}${th('職業／居住','job')}${th('信仰','faith')}<th>成長指標</th>${th('出席率','attendance')}${th('下次訪談','nextInterview')}<th></th></tr></thead><tbody>${rows.map(m=>`<tr><td><div class="person"><div class="avatar">${initials(m.name)}</div><div><strong>${esc(m.name)}</strong><p>${esc(m.gender)}・${esc(m.age)}</p></div></div></td><td><span class="pill">${esc(m.role||'小組員')}</span></td><td>${esc(m.job)}<br><small>${esc(m.location)}</small></td><td>${esc(m.faith)}</td><td><span class="score-pill">${growthIndex(m).toFixed(1)}</span></td><td><span class="pill ${attendanceRate(m)<60?'danger':''}">${attendanceRate(m)}%</span></td><td>${fmtDate(m.nextInterview)}</td><td><button class="link" onclick="showMember('${m.id}')">查看</button></td></tr>`).join('')}</tbody></table></div>`};update();$('#memberSearch').oninput=update;$('#memberStatus').onchange=update;
 window.__updateMemberTable=update;
}

function renderSelfMemberPage(m){
 const prayers=latestMeetings().filter(mt=>String(mt.prayers?.[m.name]||'').trim()).map(mt=>({date:mt.date,text:mt.prayers[m.name],topic:meetingTitle(mt)}));
 const editable=permission('members','write');
 view.innerHTML=`<div class="self-profile self-profile-v19">
  <div class="card self-profile-hero">
   <div class="person">
    <div class="avatar profile-avatar">${initials(m.name)}</div>
    <div><h2>${esc(m.name)}</h2><p>我的成員資料 <span>MY PROFILE</span></p></div>
   </div>
   <div class="profile-summary">
    <div><small>身分</small><strong>${esc(m.role||'小組員')}</strong></div>
    <div><small>近期出席率</small><strong>${attendanceRate(m)}%</strong></div>
    <div><small>成長指標</small><strong>${growthIndex(m).toFixed(1)}</strong></div>
   </div>
  </div>

  <form id="selfProfileForm" class="profile-form">
   <section class="profile-section">
    <div class="profile-section-head"><div><h3>基本資料</h3><small>BASIC INFORMATION</small></div></div>
    <div class="profile-section-grid two-col">
     ${selfField('姓名','name',m.name,editable)}
     ${selectField('性別','gender',m.gender,['男','女','不便透露'],editable,'',m.genderNote)}
     ${selfField('生日','birthday',m.birthday,editable,'date')}
     ${selfField('職業','job',m.job,editable)}
     ${selfField('居住地','location',m.location,editable)}
     ${selectField('感情狀態','relationship',m.relationship,MEMBER_OPTIONS.relationship,editable,'',m.relationshipNote)}
     ${selfField('加入日期','joinedAt',m.joinedAt,false,'date')}
     ${selfField('身分','role',m.role||'小組員',false)}
    </div>
   </section>

   <section class="profile-section">
    <div class="profile-section-head"><div><h3>信仰與服事</h3><small>FAITH & SERVICE</small></div></div>
    <div class="profile-section-grid two-col">
     ${selectField('信仰狀態','faith',m.faith,MEMBER_OPTIONS.faith,editable,'faith',m.faithNote)}
     ${selectField('信仰世代','faithGeneration',m.faithGeneration,MEMBER_OPTIONS.faithGeneration,editable,'',m.faithGenerationNote)}
     ${selfField('受洗日期','baptismDate',m.baptismDate,editable,'date')}
     ${selectField('服事參與','service',m.service,MEMBER_OPTIONS.service,editable,'service',m.serviceNote)}
     ${selfField('服事內容','serviceDetail',m.serviceDetail,editable)}
    </div>
   </section>

   <section class="profile-section">
    <div class="profile-section-head"><div><h3>屬靈生活</h3><small>SPIRITUAL LIFE</small></div></div>
    <div class="profile-section-grid two-col">
     ${selectField('靈修習慣','devotion',m.devotion,MEMBER_OPTIONS.devotion,editable,'devotion',m.devotionNote)}
     ${selectField('禱告生活','prayerLife',m.prayerLife,MEMBER_OPTIONS.prayerLife,editable,'prayerLife',m.prayerLifeNote)}
     ${selectField('聚會穩定度','stability',m.stability,MEMBER_OPTIONS.stability,editable,'stability',m.stabilityNote)}
     ${selectField('讀經狀況','bible',m.bible,MEMBER_OPTIONS.bible,editable,'bible',m.bibleNote)}
     ${selectField('對真理的渴慕程度','hunger',m.hunger,MEMBER_OPTIONS.hunger,editable,'hunger',m.hungerNote)}
     ${selectField('目前屬靈光景','spiritualState',m.spiritualState,MEMBER_OPTIONS.spiritualState,editable,'spiritualState',m.spiritualStateNote)}
    </div>
   </section>

   <section class="profile-section">
    <div class="profile-section-head"><div><h3>生活與關係</h3><small>LIFE & RELATIONSHIPS</small></div></div>
    <div class="profile-section-grid two-col">
     ${selectField('家庭關係','familyRelationship',m.familyRelationship,MEMBER_OPTIONS.familyRelationship,editable,'',m.familyRelationshipNote)}
     ${selectField('人際關係','interpersonalRelationship',m.interpersonalRelationship,MEMBER_OPTIONS.interpersonalRelationship,editable,'',m.interpersonalRelationshipNote)}
     ${selectField('作息與身心狀況','wellbeing',m.wellbeing,MEMBER_OPTIONS.wellbeing,editable,'',m.wellbeingNote)}
    </div>
    <div class="profile-section-grid one-col">
     ${multiField('壓力來源（可複選）','pressureSources',m.pressureSources,MEMBER_OPTIONS.pressureSources,editable)}
     ${multiField('目前最常面對的試探或軟弱（可複選）','temptations',m.temptations,MEMBER_OPTIONS.temptations,editable)}
     ${multiField('最近生命中的突破（可複選）','breakthroughs',m.breakthroughs,MEMBER_OPTIONS.breakthroughs,editable)}
     ${multiField('最近生命中的卡住點（可複選）','stuckPoints',m.stuckPoints,MEMBER_OPTIONS.stuckPoints,editable)}
    </div>
   </section>

   <div class="score-preview profile-score-card">
    <span>成長指標</span><strong data-growth-preview>${growthIndex(m).toFixed(1)}</strong>
    <small>此指標依設定中的內部權重自動計算，成員不會看到各選項權重。</small>
   </div>
  </form>

  <div class="self-history-grid">
   <div class="card"><div class="section-title"><h2>我的代禱紀錄 <small class="section-en">MY PRAYERS</small></h2></div><div class="list">${prayers.map(p=>`<div class="list-item"><div><strong>${fmtDate(p.date)}・${esc(p.topic)}</strong><p>${esc(p.text)}</p></div></div>`).join('')||'<div class="empty compact">尚無代禱紀錄</div>'}</div></div>
   <div class="card"><div class="section-title"><h2>個人摘要 <small class="section-en">SUMMARY</small></h2></div><div class="detail-grid"><div class="detail-cell"><small>近期出席率</small><strong>${attendanceRate(m)}%</strong></div><div class="detail-cell"><small>成長指標</small><strong>${growthIndex(m).toFixed(1)}</strong></div><div class="detail-cell"><small>下次訪談</small><strong>${fmtDate(m.nextInterview)}</strong></div></div></div>
  </div>

  <div class="self-profile-actions sticky-actions">
   <button type="button" class="secondary" onclick="changeOwnPassword()">🔑 變更密碼</button><button type="button" class="secondary" onclick="openMemberExport('${m.id}')">⇩ 匯出我的資料</button>
   ${editable?'<button type="button" class="primary" onclick="saveSelfProfile()">儲存變更</button>':''}
  </div>
 </div>`;
 const form=$('#selfProfileForm');
 form?.addEventListener('input',()=>updateGrowthPreview(form,m));
 form?.addEventListener('change',()=>updateGrowthPreview(form,m));
}
function selfField(label,name,value,enabled=true,type='text',extra=''){return `<div class="field"><label>${label}</label><input type="${type}" name="${name}" value="${esc(value??'')}" ${enabled?'':'disabled'} ${extra}></div>`}
window.saveSelfProfile=()=>{const m=currentMember();if(!m||!permission('members','write'))return toast('目前沒有修改權限');const form=$('#selfProfileForm');const fd=new FormData(form);const obj=Object.fromEntries(fd);obj.pressureSources=formArray(fd,'pressureSources');obj.temptations=formArray(fd,'temptations');obj.breakthroughs=formArray(fd,'breakthroughs');obj.stuckPoints=formArray(fd,'stuckPoints');obj.serviceBonus=Number(fd.get('serviceBonus')||0);Object.assign(m,obj);m.spiritualScore=growthIndex(m);save();render();toast('個人資料與分數已更新')}

window.sortMembers=key=>{if(memberSort.key===key)memberSort.dir=memberSort.dir==='asc'?'desc':'asc';else memberSort={key,dir:'asc'};window.__updateMemberTable?.()}

window.showMember=id=>{
 if(!canAccessMember(id))return toast('你只能查看自己的成員資料');
 const m=data.members.find(x=>x.id===id);if(!m)return;
 const records=[...data.interviews].filter(i=>i.memberId===id).sort((a,b)=>b.date.localeCompare(a.date));
 const prayers=latestMeetings().filter(mt=>String(mt.prayers?.[m.name]||'').trim()).map(mt=>({date:mt.date,text:mt.prayers[m.name],topic:meetingTitle(mt)}));
 const cell=(label,value,note='')=>({label,value:value||'—',note:note||''});
 const base=[
  cell('生日',fmtDate(m.birthday)),cell('職業',m.job),cell('居住',m.location),
  ...(canViewPrivate()?[cell('感情',m.relationship,m.relationshipNote)]:[]),
  cell('加入日期',fmtDate(m.joinedAt)),cell('出席率',attendanceRate(m)+'%'),cell('成長指標',growthIndex(m).toFixed(1)),
  cell('信仰',m.faith,m.faithNote),cell('信仰世代',m.faithGeneration,m.faithGenerationNote),
  cell('服事',m.service,m.serviceNote),cell('服事內容',m.serviceDetail),
  cell('靈修',m.devotion,m.devotionNote),cell('禱告',m.prayerLife,m.prayerLifeNote),
  cell('聚會穩定',m.stability,m.stabilityNote),cell('讀經',m.bible,m.bibleNote),
  cell('真理渴慕',m.hunger,m.hungerNote),
  ...(canViewPrivate()?[cell('屬靈近況',m.spiritualState,m.spiritualStateNote)]:[]),
  cell('家庭關係',m.familyRelationship,m.familyRelationshipNote),cell('人際關係',m.interpersonalRelationship,m.interpersonalRelationshipNote),
  cell('身心狀況',m.wellbeing,m.wellbeingNote),cell('壓力來源',(m.pressureSources||[]).join('、')),
  cell('試探／軟弱',(m.temptations||[]).join('、')),cell('生命突破',(m.breakthroughs||[]).join('、')),cell('卡住點',(m.stuckPoints||[]).join('、'))
 ];
 openModal(`<div class="modal-head"><h2>成員資料 <span class="title-en small">MEMBER PROFILE</span></h2><button class="icon-btn" value="cancel">×</button></div>
 <div class="detail-head"><div class="avatar">${initials(m.name)}</div><div><h2 style="margin:0">${esc(m.name)}</h2><span class="pill">${esc(m.role||'小組員')}</span></div></div>
 <div class="detail-grid">${base.map(x=>`<div class="detail-cell ${x.note?'has-inline-note':''}"><small>${esc(x.label)}</small><strong>${esc(x.value)}</strong>${x.note?`<p class="detail-inline-note">${esc(x.note)}</p>`:''}</div>`).join('')}</div>
 <div class="section-title member-interview-title"><h2>代禱紀錄（${prayers.length}） <small class="section-en">PRAYER HISTORY</small></h2></div>
 <div class="list prayer-history">${prayers.map(p=>`<div class="list-item prayer-item"><div><strong>${fmtDate(p.date)}・${esc(p.topic)}</strong><p>${esc(p.text)}</p></div></div>`).join('')||'<div class="empty compact">尚無代禱紀錄</div>'}</div>
 ${canViewPrivate()?`<div class="section-title member-interview-title"><h2>一對一紀錄（${records.length}） <small class="section-en">ONE-ON-ONE</small></h2><button type="button" class="link" onclick="interviewForm(null,'${m.id}')">＋ 新增</button></div><div class="list interview-history">${records.map(i=>`<div class="list-item"><div><strong>${fmtDate(i.date)}・${esc(i.topic||'一對一陪伴')}</strong><p>${esc(i.summary||i.action||'尚無摘要')}</p></div><button type="button" class="link" onclick="interviewForm('${i.id}')">查看</button></div>`).join('')||'<div class="empty compact">尚無一對一紀錄</div>'}</div>`:'<div class="privacy-lock">🔒 高度私密備註與一對一紀錄僅小組長可查看。</div>'}
 <div class="modal-actions"><button type="button" class="secondary" onclick="openMemberExport('${m.id}')">⇩ 匯出此成員</button>${canEditMemberRecord(m.id)?`${!isSelfMember()?`<button type="button" class="secondary danger" onclick="deleteMember('${m.id}')">刪除</button>`:''}<button type="button" class="primary" onclick="memberForm('${m.id}')">編輯</button>`:''}</div>`)
}
window.deleteMember=id=>{if(confirm('確定刪除此成員？')){data.members=data.members.filter(m=>m.id!==id);save();modal.close();render()}}
function memberForm(id){
 if(isSelfMember()&&(!id||!canAccessMember(id)))return toast('你只能編輯自己的資料');
 const m=id?data.members.find(x=>x.id===id):{role:'小組員',serviceBonus:0,pressureSources:[],temptations:[],breakthroughs:[],stuckPoints:[]};
 openModal(`<div class="modal-head"><h2>${id?'編輯':'新增'}成員</h2><button class="icon-btn" value="cancel">×</button></div><div id="memberEditFields" class="form-grid">
 ${field('姓名','name',m.name,true)}${selectField('性別','gender',m.gender,['男','女','不便透露'],true,'',m.genderNote)}${field('生日','birthday',m.birthday,false,'date')}${field('職業','job',m.job)}
 ${field('居住地','location',m.location)}${selectField('感情狀態','relationship',m.relationship,MEMBER_OPTIONS.relationship,true,'',m.relationshipNote)}${field('加入日期','joinedAt',m.joinedAt,false,'date')}
 ${isSelfMember()?`<div class="field"><label>身分</label><input value="${esc(m.role||'小組員')}" disabled><input type="hidden" name="role" value="${esc(m.role||'小組員')}"></div>`:`<div class="field"><label>身分</label><select name="role">${['小組長','副組長','小組員','已離開'].map(x=>`<option ${m.role===x?'selected':''}>${x}</option>`).join('')}</select></div>`}
 ${selectField('信仰狀態','faith',m.faith,MEMBER_OPTIONS.faith,true,'faith',m.faithNote)}${selectField('信仰世代','faithGeneration',m.faithGeneration,MEMBER_OPTIONS.faithGeneration,true,'',m.faithGenerationNote)}${field('受洗日期','baptismDate',m.baptismDate,false,'date')}
 ${selectField('服事參與','service',m.service,MEMBER_OPTIONS.service,true,'service',m.serviceNote)}${field('服事內容','serviceDetail',m.serviceDetail)}
 ${selectField('靈修習慣','devotion',m.devotion,MEMBER_OPTIONS.devotion,true,'devotion',m.devotionNote)}${selectField('禱告生活','prayerLife',m.prayerLife,MEMBER_OPTIONS.prayerLife,true,'prayerLife',m.prayerLifeNote)}
 ${selectField('聚會穩定度','stability',m.stability,MEMBER_OPTIONS.stability,true,'stability',m.stabilityNote)}${selectField('讀經狀況','bible',m.bible,MEMBER_OPTIONS.bible,true,'bible',m.bibleNote)}
 ${selectField('對真理的渴慕程度','hunger',m.hunger,MEMBER_OPTIONS.hunger,true,'hunger',m.hungerNote)}${selectField('目前屬靈光景','spiritualState',m.spiritualState,MEMBER_OPTIONS.spiritualState,true,'spiritualState',m.spiritualStateNote)}
 ${multiField('壓力來源（可複選）','pressureSources',m.pressureSources,MEMBER_OPTIONS.pressureSources)}
 ${selectField('家庭關係','familyRelationship',m.familyRelationship,MEMBER_OPTIONS.familyRelationship,true,'',m.familyRelationshipNote)}
 ${selectField('人際關係','interpersonalRelationship',m.interpersonalRelationship,MEMBER_OPTIONS.interpersonalRelationship,true,'',m.interpersonalRelationshipNote)}
 ${selectField('作息與身心狀況','wellbeing',m.wellbeing,MEMBER_OPTIONS.wellbeing,true,'',m.wellbeingNote)}
 ${multiField('目前最常面對的試探或軟弱（可複選）','temptations',m.temptations,MEMBER_OPTIONS.temptations)}
 ${multiField('最近生命中的突破（可複選）','breakthroughs',m.breakthroughs,MEMBER_OPTIONS.breakthroughs)}
 ${multiField('最近生命中的卡住點（可複選）','stuckPoints',m.stuckPoints,MEMBER_OPTIONS.stuckPoints)}
 ${field('下次訪談','nextInterview',m.nextInterview,false,'date')}
 <div class="score-preview full"><span>成長指標</span><strong data-growth-preview>${growthIndex(m).toFixed(1)}</strong><small>指標會在選單變更時自動更新</small></div>
 </div><div class="modal-actions"><button class="secondary" value="cancel">取消</button><button type="button" class="primary" id="saveMember">儲存</button></div>`);
 const modalForm=$('#modalForm');
 const fields=$('#memberEditFields');
 fields?.addEventListener('input',()=>updateGrowthPreview(modalForm,m));
 fields?.addEventListener('change',()=>updateGrowthPreview(modalForm,m));
 const saveBtn=$('#saveMember');
 saveBtn.onclick=()=>{
  try{
   const fd=new FormData(modalForm),obj=Object.fromEntries(fd);
   if(!String(obj.name||'').trim())return alert('請輸入姓名');
   obj.pressureSources=formArray(fd,'pressureSources');obj.temptations=formArray(fd,'temptations');obj.breakthroughs=formArray(fd,'breakthroughs');obj.stuckPoints=formArray(fd,'stuckPoints');
   obj.serviceBonus=Number(m.serviceBonus||0);
   if(id)Object.assign(m,obj);else data.members.push({...obj,id:'m-'+Date.now(),attendanceRate:0,notes:''});
   const target=id?m:data.members[data.members.length-1];target.spiritualScore=growthIndex(target);
   save();modal.close();render();toast(id?'成員資料已更新':'成員已新增');
  }catch(err){console.error(err);alert('儲存失敗，請重新整理後再試一次。')}
 }
}
function field(label,name,value='',required=false,type='text',extra=''){return `<div class="field"><label>${label}</label><input type="${type}" name="${name}" value="${esc(value||'')}" ${required?'required':''} ${extra}></div>`}

function renderMeetings(){
 const rows=latestMeetings();
 if(isSelfMember()){
  const me=currentMember();if(!me){view.innerHTML='<div class="empty">尚未指定對應成員，請到權限設定選擇本人。</div>';return}
  view.innerHTML=`<div class="note">你目前以「${esc(me.name)}」登入，只能查看及填寫自己的代禱事項。</div><div class="card" style="margin-top:16px"><div class="list">${rows.map(m=>`<div class="list-item calendar-row"><strong>${fmtDate(m.date)}</strong><div><strong>${esc(meetingTitle(m))}</strong><p>${esc(meetingSubtitle(m))}</p><div class="own-prayer">${esc(m.prayers?.[me.name]||'尚未填寫代禱')}</div></div><button class="secondary" onclick="editOwnPrayer('${m.id}')">填寫代禱</button></div>`).join('')||'<div class="empty">尚無聚會紀錄</div>'}</div></div>`;return
 }
 const staffView=!permission('members','read');
 view.innerHTML=`<div class="card"><div class="list">${rows.map(m=>`<div class="list-item calendar-row meeting-manage-row" data-meeting-id="${m.id}"><strong>${fmtDate(m.date)}</strong><div><strong>${esc(meetingTitle(m))}</strong><p>${esc(meetingSubtitle(m))}</p>${staffView?'':`<div class="attendance-dots">${data.members.filter(isActive).map(x=>`<span class="dot ${m.attendance?.[x.name]?'yes':''}" title="${esc(x.name)}">${initials(x.name)}</span>`).join('')}</div>`}</div><div class="meeting-actions"><span class="pill">${Object.values(m.attendance||{}).filter(Boolean).length} 人</span>${canEditMeeting()?`<button class="secondary" onclick="meetingForm('${m.id}')">修改</button>`:''}${canDeleteMeeting()?`<button class="secondary danger" onclick="deleteMeeting('${m.id}')">刪除</button>`:''}</div></div>`).join('')||'<div class="empty">尚無紀錄</div>'}</div></div>`;
}
window.editOwnPrayer=id=>{const me=currentMember(),m=data.meetings.find(x=>x.id===id);if(!me||!m)return;openModal(`<div class="modal-head"><h2>我的代禱 <span class="title-en small">MY PRAYER</span></h2><button class="icon-btn" value="cancel">×</button></div><p>${fmtDate(m.date)}・${esc(meetingTitle(m))}</p><div class="field"><label>${esc(me.name)} 的代禱事項</label><textarea name="ownPrayer">${esc(m.prayers?.[me.name]||'')}</textarea></div><div class="modal-actions"><button class="secondary" value="cancel">取消</button><button type="button" class="primary" id="saveOwnPrayer">儲存</button></div>`);$('#saveOwnPrayer').onclick=()=>{m.prayers=m.prayers||{};m.prayers[me.name]=new FormData($('#modalForm')).get('ownPrayer')||'';save();modal.close();render()}}
function meetingForm(id){
 if(!canEditMeeting()){toast('目前權限只能查看聚會資訊');return}
 const m=id?data.meetings.find(x=>x.id===id):{date:new Date().toISOString().slice(0,10),meetingType:'實體聚會',meetingTypeOther:'',attendance:{},prayers:{}};
 const active=data.members.filter(isActive), type=m.meetingType||'實體聚會', basicWrite=permission('meetings','write'), prayerWrite=permission('prayers','write');
 const disabled=basicWrite?'':'disabled';
 openModal(`<div class="modal-head"><h2>${id?'編輯':'新增'}聚會</h2><button class="icon-btn" value="cancel">×</button></div>${!basicWrite&&prayerWrite?'<div class="note">目前角色只能更新出席與代禱；聚會基本資料為唯讀。</div>':''}<div class="form-grid">${field('日期','date',m.date,true,'date',disabled)}<div class="field"><label>聚會類型</label><select name="meetingType" id="meetingType" ${disabled}>${['實體聚會','線上聚會','其他'].map(x=>`<option value="${x}" ${type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full" id="meetingTypeOtherField" style="${type==='其他'?'':'display:none'}"><label>其他聚會名稱</label><input name="meetingTypeOther" value="${esc(m.meetingTypeOther||'')}" ${disabled}></div>${field('聚會主題（選填）','topic',m.topic,false,'text',disabled)}${field('經文','scripture',m.scripture,false,'text',disabled)}${field('地點／線上連結','location',m.location,false,'text',disabled)}<div class="field full"><label>聚會備註</label><textarea name="notes" ${disabled}>${esc(m.notes||'')}</textarea></div></div><h3>出席與代禱 <small class="section-en">ATTENDANCE & PRAYER</small></h3><div class="check-grid">${active.map(x=>`<div class="check-card"><label><input type="checkbox" name="att_${esc(x.name)}" ${m.attendance?.[x.name]?'checked':''} ${prayerWrite?'':'disabled'}>${esc(x.name)}</label><textarea name="pray_${esc(x.name)}" placeholder="代禱事項" ${prayerWrite?'':'disabled'}>${esc(m.prayers?.[x.name]||'')}</textarea></div>`).join('')}</div><div class="modal-actions">${id&&canDeleteMeeting()?`<button type="button" class="secondary danger" onclick="deleteMeeting('${id}')">刪除</button>`:''}<button class="secondary" value="cancel">取消</button><button type="button" class="primary" id="saveMeeting">儲存</button></div>`);
 const typeSelect=$('#meetingType'), otherField=$('#meetingTypeOtherField');if(typeSelect&&basicWrite)typeSelect.onchange=()=>{otherField.style.display=typeSelect.value==='其他'?'grid':'none'};
 $('#saveMeeting').onclick=()=>{const fd=new FormData($('#modalForm')),obj=id?m:{id:'meeting-'+Date.now(),attendance:{},prayers:{}};if(basicWrite){['date','meetingType','meetingTypeOther','topic','scripture','location','notes'].forEach(k=>obj[k]=fd.get(k)||'');if(obj.meetingType!=='其他')obj.meetingTypeOther='';if(obj.meetingType==='其他'&&!obj.meetingTypeOther.trim())return alert('請輸入其他聚會名稱')}if(prayerWrite)active.forEach(x=>{obj.attendance[x.name]=fd.has('att_'+x.name);obj.prayers[x.name]=fd.get('pray_'+x.name)||''});if(!id)data.meetings.push(obj);save();modal.close();render()}
}
window.deleteMeeting=id=>{if(!canDeleteMeeting())return toast('只有小組長可以刪除聚會');if(confirm('確定刪除此聚會紀錄？')){data.meetings=data.meetings.filter(x=>x.id!==id);save();modal.close();render()}}

function renderInterviews(){
 const rows=[...data.interviews].filter(i=>memberIds.includes(i.memberId)).sort((a,b)=>b.date.localeCompare(a.date));
 view.innerHTML=`<div class="card"><div class="list">${rows.map(i=>{const m=data.members.find(x=>x.id===i.memberId);return `<div class="list-item"><div><strong>${esc(m?.name||'未知成員')}・${fmtDate(i.date)}</strong><p>${esc(i.topic||i.summary||'一對一陪伴')}</p></div><button class="link" onclick="interviewForm('${i.id}')">查看／編輯</button></div>`}).join('')||'<div class="empty">尚無一對一紀錄，按右上角開始新增。</div>'}</div></div>`;
}
function interviewForm(id,memberId){
 const i=id?data.interviews.find(x=>x.id===id):{date:new Date().toISOString().slice(0,10),memberId:memberId||''};
 openModal(`<div class="modal-head"><h2>${id?'編輯':'新增'}一對一</h2><button class="icon-btn" value="cancel">×</button></div><div class="form-grid"><div class="field"><label>成員</label><select name="memberId">${data.members.map(m=>`<option value="${m.id}" ${i.memberId===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div>${field('日期','date',i.date,true,'date')}${field('主題','topic',i.topic)}${field('下次追蹤','nextDate',i.nextDate,false,'date')}<div class="field full"><label>摘要</label><textarea name="summary">${esc(i.summary||'')}</textarea></div><div class="field full"><label>神的提醒／亮光</label><textarea name="insight">${esc(i.insight||'')}</textarea></div><div class="field full"><label>鼓勵或建議</label><textarea name="advice">${esc(i.advice||'')}</textarea></div><div class="field full"><label>行動目標</label><textarea name="action">${esc(i.action||'')}</textarea></div><div class="field full"><label>禱告重點</label><textarea name="prayer">${esc(i.prayer||'')}</textarea></div></div><div class="modal-actions">${id?`<button type="button" class="secondary danger" onclick="deleteInterview('${id}')">刪除</button>`:''}<button class="secondary" value="cancel">取消</button><button type="button" class="primary" id="saveInterview">儲存</button></div>`);
 $('#saveInterview').onclick=()=>{const fd=Object.fromEntries(new FormData($('#modalForm')));if(id)Object.assign(i,fd);else data.interviews.push({...fd,id:'interview-'+Date.now()});const mem=data.members.find(m=>m.id===fd.memberId);if(mem){mem.lastInterview=fd.date;if(fd.nextDate)mem.nextInterview=fd.nextDate}save();modal.close();render()}
}
window.deleteInterview=id=>{if(confirm('確定刪除此訪談紀錄？')){data.interviews=data.interviews.filter(x=>x.id!==id);save();modal.close();render()}}

function renderAnalysis(){
 const active=data.members.filter(isActive),meetings=latestMeetings(),recent=meetings.slice(0,12),trend=[...recent].reverse();
 const attendanceCounts=recent.map(m=>Object.values(m.attendance||{}).filter(Boolean).length);
 const avgAttendanceCount=attendanceCounts.length?Math.round(attendanceCounts.reduce((a,b)=>a+b,0)/attendanceCounts.length*10)/10:0;
 const avgAttendanceRate=active.length?Math.round(active.reduce((s,m)=>s+attendanceRate(m),0)/active.length):0;
 const baptized=active.filter(m=>String(m.faith||'').includes('已受洗'));
 const seekers=active.filter(m=>/慕道|未受洗|木道/.test(String(m.faith||'')));
 const serving=active.filter(m=>{const x=String(m.service||'');return x&&!/尚未|暫停|沒有|未參與/.test(x)});
 const now=new Date(),threeMonthsAgo=new Date(now);threeMonthsAgo.setMonth(now.getMonth()-3);
 const newcomers=active.filter(m=>m.joinedAt&&new Date(m.joinedAt+'T00:00:00')>=threeMonthsAgo);
 const core=active.filter(m=>['組長','副組長'].includes(m.role)||(attendanceRate(m)>=75&&/非常穩定|穩定出席/.test(String(m.stability||''))));
 const highAttend=active.filter(m=>attendanceRate(m)>=75),lowAttend=active.filter(m=>attendanceRate(m)<60),midAttend=active.filter(m=>attendanceRate(m)>=60&&attendanceRate(m)<75);
 const ages=active.map(m=>parseInt(String(m.age||'').match(/\d+/)?.[0]||'')).filter(Number.isFinite);
 const avgAge=ages.length?Math.round(ages.reduce((a,b)=>a+b,0)/ages.length*10)/10:0;
 const males=active.filter(m=>m.gender==='男').length,females=active.filter(m=>m.gender==='女').length;
 const singles=active.filter(m=>String(m.relationship||'').includes('單身')).length;
 const pct=(n,d=active.length)=>d?Math.round(n/d*100):0;
 const maxTrend=Math.max(1,...attendanceCounts);
 const monthlyMap={};meetings.slice(0,24).forEach(mt=>{const month=mt.date.slice(0,7);monthlyMap[month]=monthlyMap[month]||[];monthlyMap[month].push(Object.values(mt.attendance||{}).filter(Boolean).length)});
 const monthly=Object.entries(monthlyMap).sort((a,b)=>a[0].localeCompare(b[0])).slice(-6).map(([month,arr])=>({month,avg:Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10}));
 const maxMonthly=Math.max(1,...monthly.map(x=>x.avg));
 const classifyScore=(field,value)=>{const s=optionScore(field,value);return s>=4?'穩定':s>=2?'成長中':'需關注'};
 const formation={
  devotion:active.map(m=>classifyScore('devotion',m.devotion)),
  prayer:active.map(m=>classifyScore('prayerLife',m.prayerLife)),
  stability:active.map(m=>classifyScore('stability',m.stability)),
  bible:active.map(m=>classifyScore('bible',m.bible))
 };
 const formationRows=[['靈修習慣','devotion'],['禱告生活','prayer'],['聚會穩定','stability'],['讀經狀況','bible']].map(([label,key])=>({label,stable:formation[key].filter(x=>x==='穩定').length,growing:formation[key].filter(x=>x==='成長中').length,care:formation[key].filter(x=>x==='需關注').length}));
 const serviceGroups=[
  {label:'核心／穩定服事',count:active.filter(m=>/核心|穩定參與/.test(String(m.service||''))).length},
  {label:'偶爾參與',count:active.filter(m=>/偶爾/.test(String(m.service||''))).length},
  {label:'尚未／暫停',count:active.filter(m=>/尚未|暫停|沒有|未參與/.test(String(m.service||''))).length}
 ];
 const panel=(title,body)=>`<div class="hover-panel" onclick="event.stopPropagation()"><h4>${title}</h4><div class="hover-scroll">${body}</div></div>`;
 const peopleRows=arr=>arr.map(m=>`<div class="hover-row vertical"><strong>${esc(m.name)}</strong><span>${esc(m.role||'小組員')} · 出席 ${attendanceRate(m)}%</span></div>`).join('')||'<div class="hover-row vertical"><span>目前無資料</span></div>';
 view.innerHTML=`
 <div class="grid analysis-kpis">
  <button class="card kpi kpi-action"><small>小組總人數 <b>TOTAL MEMBERS</b></small><strong>${active.length}</strong><em>目前在組</em>${panel('目前成員',peopleRows(active))}</button>
  <button class="card kpi kpi-action"><small>平均成長指標 <b>AVG. SPIRITUAL SCORE</b></small><strong>${active.length?(active.reduce((s,m)=>s+growthIndex(m),0)/active.length).toFixed(1):'0.0'}</strong><em>依設定中的內部權重自動計算</em>${panel('成員成長指標',[...active].sort((a,b)=>growthIndex(b)-growthIndex(a)).map(m=>`<div class="hover-row vertical"><strong>${esc(m.name)}</strong><span>${growthIndex(m).toFixed(1)}</span></div>`).join(''))}</button>
  <button class="card kpi kpi-action"><small>已受洗人數 <b>BAPTIZED</b></small><strong>${baptized.length}</strong><em>${pct(baptized.length)}% 成員</em>${panel('已受洗成員',peopleRows(baptized))}</button>
  <button class="card kpi kpi-action"><small>平均出席率 <b>AVG. ATTENDANCE</b></small><strong>${avgAttendanceRate}%</strong><em>最近 12 次</em>${panel('成員出席率',peopleRows([...active].sort((a,b)=>attendanceRate(b)-attendanceRate(a))))}</button>
  <button class="card kpi kpi-action"><small>平均出席人數 <b>AVG. HEADCOUNT</b></small><strong>${avgAttendanceCount}</strong><em>每次聚會</em>${panel('最近聚會到會人數',recent.map(m=>`<div class="hover-row vertical"><strong>${fmtDate(m.date)}</strong><span>${Object.values(m.attendance||{}).filter(Boolean).length} 人</span></div>`).join(''))}</button>
  <button class="card kpi kpi-action"><small>核心成員 <b>CORE MEMBERS</b></small><strong>${core.length}</strong><em>${pct(core.length)}% 成員</em>${panel('核心成員',peopleRows(core))}</button>
  <button class="card kpi kpi-action"><small>近三個月新增 <b>NEW MEMBERS</b></small><strong>${newcomers.length}</strong><em>新加入</em>${panel('近三個月新增',peopleRows(newcomers))}</button>
  <button class="card kpi kpi-action"><small>慕道人數 <b>SEEKERS</b></small><strong>${seekers.length}</strong><em>${pct(seekers.length)}% 成員</em>${panel('慕道／未受洗',peopleRows(seekers))}</button>
  <button class="card kpi kpi-action"><small>服事人數 <b>SERVING</b></small><strong>${serving.length}</strong><em>${pct(serving.length)}% 成員</em>${panel('目前參與服事',peopleRows(serving))}</button>
 </div>
 <div class="grid analytics-2">
  <div class="card"><div class="section-title"><h2>近 12 次出席趨勢 <small class="section-en">ATTENDANCE TREND</small></h2></div><div class="bar-chart">${trend.map(m=>{const n=Object.values(m.attendance||{}).filter(Boolean).length;return `<div class="bar-col" title="${fmtDate(m.date)}：${n} 人"><span>${n}</span><div class="bar" style="height:${Math.max(8,n/maxTrend*150)}px"></div><small>${m.date.slice(5).replace('-','/')}</small></div>`}).join('')||'<div class="empty compact">尚無聚會資料</div>'}</div></div>
  <div class="card"><div class="section-title"><h2>每月平均到會 <small class="section-en">MONTHLY AVERAGE</small></h2></div><div class="mini-columns">${monthly.map(x=>`<div class="mini-col"><span>${x.avg}</span><i style="height:${Math.max(8,x.avg/maxMonthly*125)}px"></i><small>${x.month.slice(2).replace('-','/')}</small></div>`).join('')||'<div class="empty compact">尚無資料</div>'}</div></div>
 </div>
 <div class="grid analytics-3">
  <div class="card"><div class="section-title"><h2>出席率分布 <small class="section-en">ATTENDANCE BANDS</small></h2></div><div class="donut-list"><div><span>75% 以上</span><div class="progress"><i style="width:${pct(highAttend.length)}%"></i></div><strong>${highAttend.length}</strong></div><div><span>60%–74%</span><div class="progress"><i style="width:${pct(midAttend.length)}%"></i></div><strong>${midAttend.length}</strong></div><div><span>低於 60%</span><div class="progress"><i style="width:${pct(lowAttend.length)}%"></i></div><strong>${lowAttend.length}</strong></div></div></div>
  <div class="card"><div class="section-title"><h2>人口輪廓 <small class="section-en">DEMOGRAPHICS</small></h2></div><div class="profile-stats"><div><strong>${males}:${females}</strong><span>男女比</span></div><div><strong>${pct(singles)}%</strong><span>單身比例</span></div><div><strong>${avgAge}</strong><span>平均年齡</span></div><div><strong>${active.length-singles}</strong><span>非單身人數</span></div></div></div>
  <div class="card"><div class="section-title"><h2>服事參與 <small class="section-en">SERVICE ENGAGEMENT</small></h2></div><div class="donut-list">${serviceGroups.map(x=>`<div><span>${x.label}</span><div class="progress"><i style="width:${pct(x.count)}%"></i></div><strong>${x.count}</strong></div>`).join('')}</div></div>
 </div>
 <div class="card"><div class="section-title"><h2>屬靈習慣剖析 <small class="section-en">SPIRITUAL FORMATION</small></h2></div><div class="formation-table"><div class="formation-head"><span>項目</span><span>穩定</span><span>成長中</span><span>需關注</span></div>${formationRows.map(x=>`<div class="formation-row"><strong>${x.label}</strong><span class="good">${x.stable}</span><span class="mid">${x.growing}</span><span class="bad">${x.care}</span></div>`).join('')}</div></div>
 <div class="card"><div class="section-title"><h2>成員出席率排行 <small class="section-en">MEMBER RANKING</small></h2></div><div class="rank-list">${[...active].sort((a,b)=>attendanceRate(b)-attendanceRate(a)).map(m=>`<button class="rank-row rank-button" onclick="goMember('${m.id}')"><strong>${esc(m.name)}</strong><div class="progress"><i style="width:${attendanceRate(m)}%"></i></div><span>${attendanceRate(m)}%</span></button>`).join('')}</div></div>`;
}

window.goMeeting=id=>{if(!permission('meetings','read'))return toast('目前角色沒有聚會讀取權限');setPage('meetings');setTimeout(()=>{const el=document.querySelector(`[data-meeting-id="${id}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('spotlight');setTimeout(()=>el.classList.remove('spotlight'),1800)}},80)}
window.goMember=id=>{if(!permission('members','read'))return toast('目前角色沒有成員讀取權限');if(!canAccessMember(id))return toast('你只能查看自己的成員資料');setPage('members');setTimeout(()=>showMember(id),80)}

function openMemberExport(preselectedId=''){
 const exportableMembers=visibleMembers();const memberChecks=exportableMembers.map(m=>`<label class="member-export-option"><input type="checkbox" name="member_${m.id}" ${!preselectedId||preselectedId===m.id?'checked':''}><span><strong>${esc(m.name)}</strong><small>${esc(m.role||'小組員')}</small></span></label>`).join('');
 openModal(`<div class="modal-head"><h2>匯出成員資料 <span class="title-en small">EXPORT MEMBERS</span></h2><button class="icon-btn" value="cancel">×</button></div><p class="export-intro">先選擇成員，再選擇要輸出的內容。每一類資料會建立為獨立工作表。</p><div class="export-select-head"><strong>選擇成員</strong><span><button type="button" class="link" onclick="toggleExportMembers(true)">全選</button> · <button type="button" class="link" onclick="toggleExportMembers(false)">清除</button></span></div><div class="member-export-grid">${memberChecks}</div><div class="export-select-head"><strong>選擇內容</strong></div><div class="export-options"><label><input type="checkbox" name="exp_basic" checked><span><strong>基本資料</strong><small>身分、生日、職業、居住、信仰與出席率</small></span></label><label><input type="checkbox" name="exp_prayer" checked><span><strong>代禱紀錄</strong><small>依成員與聚會日期整理</small></span></label>${canViewPrivate()?`<label><input type="checkbox" name="exp_interview" checked><span><strong>一對一紀錄</strong><small>摘要、亮光、行動目標與後續追蹤</small></span></label>`:''}</div><div class="modal-actions"><button class="secondary" value="cancel">取消</button><button type="button" class="primary" id="runMemberExport">匯出 Excel</button></div>`);
 $('#runMemberExport').onclick=()=>{const fd=new FormData($('#modalForm'));const memberIds=visibleMembers().filter(m=>fd.has('member_'+m.id)).map(m=>m.id);const selected={basic:fd.has('exp_basic'),prayer:fd.has('exp_prayer'),interview:fd.has('exp_interview')};if(!memberIds.length)return alert('請至少選擇一位成員');if(!Object.values(selected).some(Boolean))return alert('請至少選擇一項資料');exportMemberExcel(selected,memberIds);modal.close()}
}
window.toggleExportMembers=checked=>document.querySelectorAll('.member-export-option input').forEach(x=>x.checked=checked)
function xmlEsc(v=''){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function excelSheet(name,headers,rows){const row=x=>`<Row>${x.map(v=>`<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`).join('')}</Row>`;return `<Worksheet ss:Name="${xmlEsc(name)}"><Table>${row(headers)}${rows.map(row).join('')}</Table></Worksheet>`}
function exportMemberExcel(selected,memberIds=data.members.map(m=>m.id)){
 const selectedMembers=data.members.filter(m=>memberIds.includes(m.id));
 const sheets=[];
 if(selected.basic){const headers=['姓名','身分','性別','生日','年齡','職業','居住地','感情狀態','加入日期','信仰狀態','服事','靈修','禱告生活','讀經狀況','屬靈近況','出席率','上次訪談','下次訪談'];const rows=selectedMembers.map(m=>[m.name,m.role||'小組員',m.gender,m.birthday,m.age,m.job,m.location,m.relationship,m.joinedAt,m.faith,m.service,m.devotion,m.prayerLife,m.bible,m.spiritualState,attendanceRate(m)+'%',m.lastInterview,m.nextInterview]);sheets.push(excelSheet('基本資料',headers,rows))}
 if(selected.prayer){const headers=['成員','聚會日期','聚會類型','聚會主題','代禱內容'];const rows=[];latestMeetings().forEach(mt=>selectedMembers.forEach(m=>{const t=String(mt.prayers?.[m.name]||'').trim();if(t)rows.push([m.name,mt.date,meetingTitle(mt),mt.topic||'',t])}));sheets.push(excelSheet('代禱紀錄',headers,rows))}
 if(selected.interview){const headers=['成員','日期','主題','摘要','神的提醒／亮光','鼓勵或建議','行動目標','禱告重點','下次追蹤'];const rows=[...data.interviews].filter(i=>memberIds.includes(i.memberId)).sort((a,b)=>b.date.localeCompare(a.date)).map(i=>{const m=data.members.find(x=>x.id===i.memberId);return [m?.name||'未知成員',i.date,i.topic,i.summary,i.insight,i.advice,i.action,i.prayer,i.nextDate]});sheets.push(excelSheet('一對一紀錄',headers,rows))}
 const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets.join('')}</Workbook>`;
 const blob=new Blob(['\ufeff'+xml],{type:'application/vnd.ms-excel'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`小組成員資料-${new Date().toISOString().slice(0,10)}.xls`;a.click();URL.revokeObjectURL(a.href);toast('Excel 已匯出')
}


function optionEditorHtml(){
 const fields=Object.keys(FIELD_LABELS);
 return `<div class="card option-editor" style="margin-top:16px">
  <div class="section-title"><h2>選項與權重管理 <small class="section-en">OPTIONS & WEIGHTS</small></h2></div>
  <p class="export-intro">成員填寫時只會看到選項名稱，不會看到權重。權重僅用於背景計算「成長指標」，只有小組長可調整。</p>
  <div class="option-field-tabs">${fields.map((f,i)=>`<button type="button" class="option-tab ${i===0?'active':''}" onclick="showOptionField('${f}',this)">${esc(FIELD_LABELS[f])}</button>`).join('')}</div>
  <div id="optionFieldEditors">${fields.map((f,i)=>optionFieldEditor(f,i===0)).join('')}</div>
  <div class="modal-actions"><button class="primary" onclick="saveOptionConfig()">儲存選項與權重</button></div>
 </div>`;
}
function optionFieldEditor(field,visible=false){
 const rows=optionRows(field);
 return `<section class="option-field-editor ${visible?'active':''}" data-option-field="${field}">
  <div class="option-editor-head"><div><strong>${esc(FIELD_LABELS[field])}</strong><small>${SCORE_FIELDS.includes(field)?'納入成長指標':'不納入目前成長指標，但可保留權重'}</small></div><button type="button" class="secondary" onclick="addOptionRow('${field}')">＋ 新增選項</button></div>
  <div class="option-row-list">${rows.map((x,i)=>optionRow(field,i,x.label,x.score)).join('')}</div>
 </section>`;
}
function optionRow(field,index,label='',score=0){
 return `<div class="option-config-row"><span class="drag-handle">⋮⋮</span><input class="option-label-input" value="${esc(label)}" placeholder="選項名稱"><input class="option-score-input" type="number" step="0.5" value="${Number(score||0)}" aria-label="內部權重"><button type="button" class="icon-btn danger" onclick="this.closest('.option-config-row').remove()">×</button></div>`;
}
window.showOptionField=(field,btn)=>{document.querySelectorAll('.option-field-editor').forEach(x=>x.classList.toggle('active',x.dataset.optionField===field));document.querySelectorAll('.option-tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}
window.addOptionRow=field=>{const list=document.querySelector(`[data-option-field="${field}"] .option-row-list`);list.insertAdjacentHTML('beforeend',optionRow(field,list.children.length,'',0))}
window.saveOptionConfig=()=>{if(!isLeader())return toast('只有小組長可以調整選項與權重');document.querySelectorAll('.option-field-editor').forEach(section=>{const field=section.dataset.optionField;data.optionConfig[field]=[...section.querySelectorAll('.option-config-row')].map(row=>({label:row.querySelector('.option-label-input').value.trim(),score:Number(row.querySelector('.option-score-input').value||0)})).filter(x=>x.label)});save();render();toast('選項與權重已更新')}
function renderSettings(){
 const roles=['小組長','副組長','小組員','已離開'];
 const resources=[['dashboard','首頁'],['members','成員資料'],['meetings','聚會紀錄'],['prayers','代禱紀錄'],['interviews','一對一紀錄'],['analysis','小組分析'],['settings','設定與備份']];
 const matrix=isLeader()?`<div class="card permission-editor" style="margin-top:16px"><div class="section-title"><h2>角色權限管理 <small class="section-en">ROLE PERMISSIONS</small></h2></div><p class="export-intro">小組員的成員資料權限固定採本人範圍；即使開啟讀寫，也只會看到與修改自己。</p><div class="permission-table-wrap"><table class="permission-table"><thead><tr><th>資料功能</th>${roles.map(r=>`<th colspan="2">${r}</th>`).join('')}</tr><tr><th></th>${roles.map(()=>'<th>讀</th><th>寫</th>').join('')}</tr></thead><tbody>${resources.map(([key,label])=>`<tr><td><strong>${label}</strong>${key==='members'?'<small class="scope-hint">小組員：僅本人</small>':''}</td>${roles.map(r=>`<td><input type="checkbox" data-role="${r}" data-resource="${key}" data-mode="read" ${data.permissions[r][key].read?'checked':''} ${r==='小組長'&&key==='settings'?'disabled':''}></td><td><input type="checkbox" data-role="${r}" data-resource="${key}" data-mode="write" ${data.permissions[r][key].write?'checked':''} ${r==='已離開'?'disabled':''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="modal-actions"><button class="primary" onclick="savePermissionMatrix()">儲存權限設定</button></div></div>`:'';
 view.innerHTML=`<div class="card account-card"><div class="section-title"><h2>我的帳號 <small class="section-en">MY ACCOUNT</small></h2></div><div class="detail-grid"><div class="detail-cell"><small>登入成員</small><strong>${esc(currentMember()?.name||'—')}</strong></div><div class="detail-cell"><small>角色</small><strong>${esc(accessRole())}</strong></div><div class="detail-cell"><small>密碼狀態</small><strong>${data.accounts?.[currentMember()?.id]?.mustChange?'建議變更':'已自訂'}</strong></div></div><div class="modal-actions"><button class="secondary" onclick="changeOwnPassword()">變更我的密碼</button><button class="secondary danger" onclick="logout()">登出</button></div></div>
 ${accountManagementHtml()}${matrix}${isLeader()?optionEditorHtml():''}
 ${permission('settings','write')?`<div class="grid settings-grid" style="margin-top:16px"><div class="card big-action"><strong>匯出完整備份</strong><p>下載成員、聚會、代禱、訪談與帳號設定。密碼只會以不可還原的雜湊保存。</p><button class="primary" onclick="exportData()">下載 JSON</button></div><div class="card big-action"><strong>匯入備份</strong><p>在其他裝置還原先前下載的資料。</p><input type="file" id="importFile" accept=".json"><button class="secondary" style="margin-top:10px" onclick="importData()">開始匯入</button></div><div class="card big-action"><strong>小組名稱</strong><p>目前：${esc(data.groupName)}</p><button class="secondary" onclick="renameGroup()">修改名稱</button></div><div class="card big-action"><strong>回復初始資料</strong><p>清除目前修改並重新載入 Excel 匯入內容。</p><button class="secondary danger" onclick="resetData()">重設資料</button></div></div>`:''}`;
}
window.savePermissionMatrix=()=>{if(!isLeader())return toast('只有小組長可以修改權限');document.querySelectorAll('.permission-table input[data-role]').forEach(el=>{data.permissions[el.dataset.role][el.dataset.resource][el.dataset.mode]=el.checked});Object.keys(data.permissions).forEach(r=>Object.keys(data.permissions[r]).forEach(k=>{if(!data.permissions[r][k].read)data.permissions[r][k].write=false}));data.permissions['小組長'].settings.read=true;data.permissions['小組長'].settings.write=true;save();render()}


window.exportData=()=>{const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`小組備份-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
window.importData=()=>{const f=$('#importFile').files[0];if(!f)return alert('請先選擇 JSON 檔');const r=new FileReader();r.onload=()=>{try{data=migrateData(JSON.parse(r.result));ensureOptionConfig();save();render();alert('匯入完成')}catch(e){alert('檔案格式不正確')}};r.readAsText(f)}
window.renameGroup=()=>{const n=prompt('小組名稱',data.groupName);if(n){data.groupName=n;save();$('#brandName').textContent=n;render()}}
window.resetData=()=>{if(confirm('所有目前修改都會被清除，確定重設？')){localStorage.removeItem(KEY);localStorage.removeItem(SESSION_KEY);data=migrateData(structuredClone(window.INITIAL_DATA));ensureOptionConfig();save();saveSession(null);showLogin('資料已重設，請重新登入。')}}
function openModal(html){modalBody.innerHTML=html;modal.showModal()}
$('#brandName').textContent=data.groupName;$('#accessBadge').onclick=openAccountMenu;

initAuth();
