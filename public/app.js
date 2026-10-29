/* Chas Berger Site App - phone app. Talks to /api/rpc; data lives on the server. */

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=86400000;
function fmtDate(ts){return ts?new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):''}
function fmtDue(iso){return iso?fmtDate(new Date(iso+'T12:00').getTime()):''}
function ago(ts){if(!ts)return'';const d=Math.floor((Date.now()-ts)/day);return d<=0?'today':d===1?'yesterday':d<30?d+' days ago':fmtDate(ts)}
function todayISO(){return new Date().toISOString().slice(0,10)}
function isOverdue(s){return s.status!=='closed'&&s.due&&new Date(s.due+'T23:59:59').getTime()<Date.now()}
function snagRef(s){return 'SN-'+String(s.ref_no||0).padStart(4,'0')}
const PC=/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
function normKey(a,p){return (a+'|'+p).toLowerCase().replace(/[^a-z0-9|]/g,'')}
const I={
 plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
 chev:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
 back:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
 x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
 cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
 clip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="M9 12h6M9 16h4"/></svg>',
 warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l9 16H3z"/><path d="M12 10v4"/></svg>',
 dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
 up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20V9M7 14l5-5 5 5M5 4h14"/></svg>'};
const LOGO='<svg viewBox="0 0 792 525" aria-hidden="true"><path fill="var(--red)" d="M367 0H27Q0 0 0 27V498Q0 525 27 525H367V439H87V87H367Z"/><path fill="var(--logo-ink)" d="M422 0H765Q792 0 792 27V498Q792 525 765 525H422V439H707V306H509V387H422V138H509V219H707V87H422Z"/></svg>';
const BRAND=`<div class="brand">${LOGO}<div class="wm"><b>Chas</b><span>Berger</span></div></div>`;

let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,3400)}

/* ---------- state ---------- */
const S={token:'',ctoken:'',name:'',role:'',mode:'pm',ready:false,emailReady:false,
 pms:new Map(),projects:new Map(),contractors:new Map(),props:new Map(),surveys:new Map(),snags:new Map(),
 tab:'addresses',view:null,rendered:null,q:'',work:'all',scheme:'all',snagQ:'',snagF:'open',cF:'open',
 selecting:false,sel:new Set(),photos:{},sheetActs:{}};
function saved(){try{return JSON.parse(localStorage.getItem('cbsa')||'{}')}catch(e){return{}}}
function save(){try{localStorage.setItem('cbsa',JSON.stringify({token:S.token,name:S.name}))}catch(e){}}

/* ---------- server ---------- */
async function api(action,payload){
  const h={'content-type':'application/json'};
  if(S.ctoken)h['x-contractor']=S.ctoken;else if(S.token)h.authorization='Bearer '+S.token;
  if(S.name)h['x-name']=encodeURIComponent(S.name);
  let r;
  try{r=await fetch('/api/rpc',{method:'POST',headers:h,body:JSON.stringify({action,payload})})}
  catch(e){throw{message:'No signal. Try again when you\'re back in signal.'}}
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.ok){
    if(r.status===401&&!S.ctoken&&action!=='login'){signOut(j.error||'Enter your PIN again.')}
    throw{status:r.status,message:j.error||'Something went wrong. Try again.'};
  }
  return j.data;
}
let loading=null;
async function load(){
  if(loading)return loading;
  loading=(async()=>{
    try{
      const d=await api('data');
      S.role=d.role;S.emailReady=d.emailReady;
      for(const [k,list] of [['pms',d.pms||[]],['projects',d.projects],['contractors',d.contractors],['props',d.properties],['surveys',d.surveys],['snags',d.snags]]){S[k]=new Map(list.map(x=>[x.id,x]))}
      S.me=d.me;if(d.role==='contractor')S.mode='contractor';
      S.ready=true;S.loadError='';render();
    }catch(e){
      if(S.ctoken){$('#main').innerHTML=`<div class="empty"><h3>This link isn't working</h3><p>${esc(e.message)}</p></div>`;return}
      if(!S.ready){S.loadError=e.message;S.rendered=null;render()}
      else toast(e.message);
    }finally{loading=null}
  })();
  return loading;
}
const src=p=>'/api/photo?p='+encodeURIComponent(p)+'&s='+encodeURIComponent(S.ctoken||S.token);

/* ---------- PIN screen ---------- */
function showGate(msg){
  $('#appwrap').hidden=true;const g=$('#gate');g.hidden=false;
  g.innerHTML=`<form class="gate-card" id="gate-form" autocomplete="off">
    <div class="gate-logo">${LOGO}<div class="wm"><b>Chas</b><span>Berger</span></div></div>
    <div><h1 class="page-title">Site App</h1><p class="lead">Enter your project PIN. You only need to do this once on this phone.</p></div>
    <div class="field"><label for="g-name">Your name</label><p class="help">So the team knows who raised what.</p><input id="g-name" class="inp" autocomplete="name" value="${esc(S.name)}" placeholder="e.g. Dave Hughes" required></div>
    <div class="field"><label for="g-pin">Your PIN</label><input id="g-pin" class="inp pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="one-time-code" required></div>
    <p class="err" id="g-err">${esc(msg||'')}</p>
    <button class="btn primary block" type="submit" style="min-height:58px;font-size:18px">Open the app</button>
    <p class="meta">Don't know the PIN? Ask your project manager.</p></form>`;
  $('#g-pin').focus();
  $('#gate-form').addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.submitter||$('#gate-form button');
    const name=$('#g-name').value.trim(),pin=$('#g-pin').value.trim();
    if(!name){$('#g-err').textContent='Put your name in first.';return}
    btn.disabled=true;$('#g-err').textContent='';
    try{const r=await api('login',{pin});S.token=r.token;S.name=name;save();startApp()}
    catch(err){$('#g-err').textContent=err.message;btn.disabled=false}
  });
}
function signOut(msg){S.token='';S.ready=false;S.rendered=null;save();closeSheet();showGate(msg)}
function startApp(){$('#gate').hidden=true;$('#appwrap').hidden=false;render();load()}

/* ---------- render ---------- */
function viewKey(){return S.mode==='contractor'?'contractor':S.view?S.view.name+':'+S.view.id:S.tab+':'+S.role}
function render(){
  document.body.classList.toggle('contractor',S.mode==='contractor');
  const k=viewKey();
  if(k!==S.rendered){
    S.rendered=k;
    $('#top').innerHTML=S.view&&S.mode!=='contractor'
      ?`<button type="button" class="back" data-act="back">${I.back} Back</button><span class="sub">Property</span>`
      :`${BRAND}<span class="sub">${S.mode==='contractor'?'Contractor app':'Site App'}</span>`;
    $('#main').innerHTML=shell();
    document.querySelectorAll('.nav button').forEach(b=>b.setAttribute('aria-current',!S.view&&b.dataset.tab===S.tab?'page':'false'));
    window.scrollTo(0,0);
  }
  renderBody();
}
function shell(){
  const vb=`<div id="vbody" style="display:flex;flex-direction:column;gap:16px"></div>`;
  if(S.mode==='contractor')return vb;
  if(S.view)return vb;
  if(S.tab==='projects')return`<div class="h-row"><div><h1 class="page-title">Projects</h1><p class="lead">${!S.role?'':canManage()?'Set up each job: its PIN, your email, and the contractors who close out snags.':'The projects unlocked on this phone.'}</p></div></div>
    ${!S.role?'':canManage()?`<button type="button" class="btn primary block" data-act="new-project" style="min-height:60px;font-size:17px">${I.plus} New project</button>`:`<button type="button" class="btn primary block" data-act="add-pin" style="min-height:60px;font-size:17px">${I.plus} Add another project PIN</button>`}${vb}`;
  if(S.tab==='addresses')return`
    <div class="h-row"><div><h1 class="page-title">Addresses</h1><p class="lead">Tap an address to survey it or raise a snag.</p></div></div>
    <div class="big-actions"><button type="button" class="btn primary" data-act="add-addresses">${I.plus} Add addresses</button><button type="button" class="btn" data-act="new-snag">${I.warn} Raise a snag</button></div>
    <div class="search">${I.search}<input id="addr-q" type="search" placeholder="Search street, postcode or ref" value="${esc(S.q)}" autocomplete="off"></div>${vb}`;
  if(S.tab==='snags')return`
    <div class="h-row"><div><h1 class="page-title">Snags</h1><p class="lead">Raise it, fix it, sign it off.</p></div></div>
    <button type="button" class="btn primary block" data-act="new-snag" style="min-height:60px;font-size:17px">${I.cam} Raise a snag</button>
    <div class="search">${I.search}<input id="snag-q" type="search" placeholder="Search address, room, trade or ref" value="${esc(S.snagQ)}" autocomplete="off"></div>${vb}`;
  return`<div class="h-row"><div><h1 class="page-title">Progress</h1><p class="lead">Where every job stands, and spreadsheets to send on.</p></div></div>${vb}`;
}
function renderBody(){
  const el=$('#vbody');if(!el)return;
  const nOpen=[...S.snags.values()].filter(s=>s.status!=='closed').length;
  const nc=$('#nav-snag-count');nc.hidden=!nOpen;nc.textContent=nOpen;
  if(!S.ready){el.innerHTML=S.loadError?`<div class="empty"><h3>Couldn't load your jobs</h3><p>${esc(S.loadError)}</p><button type="button" class="btn primary" data-act="retry">Try again</button></div>`:'<div class="loading">Loading your jobs…</div>';return}
  if(S.mode==='contractor'){el.innerHTML=contractorBody();return}
  el.innerHTML=S.view?propertyBody():S.tab==='addresses'?addressesBody():S.tab==='snags'?snagsBody():S.tab==='projects'?projectsBody():reportsBody();
}

/* ---------- projects & contractors ---------- */
const projectOf=p=>p&&S.projects.get(p.project_id)||null;
const projectName=p=>{const pr=projectOf(p);return pr?pr.name:''};
const contractorsOf=pid=>[...S.contractors.values()].filter(c=>c.project_id===pid).sort((a,b)=>a.name.localeCompare(b.name));
const canManage=()=>S.role==='admin'||S.role==='pm';
const contractorLink=c=>c&&c.token?location.origin+'/?c='+c.token:'';
function projectList(){return[...S.projects.values()].sort((a,b)=>a.name.localeCompare(b.name))}

/* ---------- addresses ---------- */
function openSnagCount(pid){let n=0;for(const s of S.snags.values())if(s.property_id===pid&&s.status!=='closed')n++;return n}
function sortedProps(){return[...S.props.values()].sort((a,b)=>projectName(a).localeCompare(projectName(b))||(a.postcode||'').localeCompare(b.postcode||'')||(a.address||'').localeCompare(b.address||'',undefined,{numeric:true}))}
function filteredProps(){
  const q=S.q.trim().toLowerCase();
  return sortedProps().filter(p=>(S.work==='all'||(p.works||[]).includes(S.work))&&(S.scheme==='all'||(p.project_id||'')===S.scheme)&&(!q||[p.address,p.postcode,p.ref,projectName(p)].join(' ').toLowerCase().includes(q)));
}
function addressesBody(){
  const all=sortedProps();
  if(!all.length)return`<div class="empty"><h3>No addresses yet</h3><p>Upload the Excel address template, or copy the list from your schedule and paste it in. The postcode gets picked out for you.</p><button type="button" class="btn primary" data-act="add-addresses">${I.plus} Add addresses</button></div>`;
  const projs=projectList();const list=filteredProps();
  const worksUsed=Object.keys(WORKS).filter(w=>all.some(p=>(p.works||[]).includes(w)));
  let chips='';
  if(projs.length>1||all.some(p=>!p.project_id))chips+=`<div class="chips">${[['all','All projects'],...projs.map(p=>[p.id,p.name]),...(all.some(p=>!p.project_id)?[['','No project']]:[])].map(([v,l])=>`<button type="button" class="chip-btn" data-act="scheme" data-v="${esc(v)}" aria-pressed="${S.scheme===v}">${esc(l)}</button>`).join('')}</div>`;
  if(worksUsed.length>1)chips+=`<div class="chips">${['all',...worksUsed].map(w=>`<button type="button" class="chip-btn" data-act="work" data-v="${w}" aria-pressed="${S.work===w}">${w==='all'?'All work':WORKS[w]}<span class="n">${w==='all'?all.length:all.filter(p=>(p.works||[]).includes(w)).length}</span></button>`).join('')}</div>`;
  const surveyed=all.filter(p=>p.status&&p.status!=='To survey').length;
  let rows='',last=null;const groups=S.scheme==='all'&&projs.length>1;
  for(const p of list){
    if(groups&&p.project_id!==last){last=p.project_id;rows+=`<div class="group-h">${esc(projectName(p)||'No project')}</div>`}
    const n=openSnagCount(p.id);const st=p.status||'To survey';
    const main=`<div class="main"><span class="t">${esc(p.address)}</span><span class="s"><span class="mono">${esc(p.postcode||'No postcode')}</span>${(p.works||[]).map(w=>`<span class="tag">${WORKS[w]||w}</span>`).join('')}</span></div><div class="end"><span class="pill ${PSTATUS_CLS[st]}">${st}</span>${n?`<span class="badge-snags">${n} snag${n>1?'s':''}</span>`:''}</div>`;
    rows+=S.selecting?`<label class="row"><input type="checkbox" data-sel="${p.id}" ${S.sel.has(p.id)?'checked':''} style="width:24px;height:24px;accent-color:var(--red);flex:none">${main}</label>`
      :`<button type="button" class="row" data-act="open-prop" data-id="${p.id}">${main}<span class="chev">${I.chev}</span></button>`;
  }
  const selbar=S.selecting?`<div class="selbar"><b>${S.sel.size} picked</b><button type="button" class="btn" data-act="sel-all" style="background:var(--surface);color:var(--ink)">Pick all ${list.length} shown</button><select id="move-to" aria-label="Move to project"><option value="">Move to project…</option>${projs.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><button type="button" class="btn primary" data-act="move-go">Move</button><button type="button" class="btn" data-act="sel-cancel" style="background:transparent;color:var(--bg);border-color:var(--muted)">Cancel</button></div>`:'';
  return`${chips}<div class="h-row" style="align-items:center"><p class="meta" style="margin:0">${list.length} of ${all.length} addresses · ${surveyed} surveyed</p>${projs.length&&!S.selecting?`<button type="button" class="btn" data-act="sel-start" style="min-height:40px;font-size:14px">Move to a project</button>`:''}</div>${list.length?`<div class="list">${rows}</div>`:`<div class="empty"><h3>Nothing matches</h3><p>Try fewer letters, or just the first half of the postcode.</p></div>`}${selbar}`;
}

/* ---------- snags ---------- */
function snagRow(s,showAddr=true){
  const p=S.props.get(s.property_id)||{};const [lab,cls]=snagLabel(s);
  const cx=s.contractor_id&&S.contractors.get(s.contractor_id);
  const unsent=S.mode==='pm'&&s.contractor_id&&s.status==='open'&&(s.email_status==='pending'||s.email_status==='failed');
  const th=s.photos&&s.photos[0]?`<img class="snag-thumb" src="${src(s.photos[0])}" alt="" loading="lazy">`:`<span class="snag-thumb none">${I.cam}</span>`;
  return`<button type="button" class="row" data-act="open-snag" data-id="${s.id}">${th}<div class="main"><span class="t">${esc(s.title)}</span><span class="s">${showAddr?`<span>${esc(p.address||'')}</span>`:''}${s.location?`<span>${esc(s.location)}</span>`:''}${s.trade?`<span class="tag">${esc(s.trade)}</span>`:''}</span><span class="s"><span class="mono">${snagRef(s)}</span>${S.mode==='pm'&&cx?`<span>${esc(cx.name)}</span>`:''}<span>raised ${ago(s.raised_at)}</span>${isOverdue(s)?'<span style="color:var(--bad);font-weight:700">Overdue</span>':''}${unsent?'<span style="color:var(--warn);font-weight:700">Not emailed</span>':''}</span></div><div class="end"><span class="pill ${cls}">${lab}</span>${s.priority==='High'?'<span class="pill p-bad">High</span>':''}</div></button>`;
}
function snagsBody(){
  const all=[...S.snags.values()].sort((a,b)=>(b.raised_at||0)-(a.raised_at||0));
  const cnt={open:0,fixed:0,closed:0};all.forEach(s=>cnt[s.status||'open']++);
  const overdue=all.filter(isOverdue).length;
  const F=[['open','Open',cnt.open],['fixed','Done - check it',cnt.fixed],['overdue','Overdue',overdue],['closed','Closed',cnt.closed],['all','All',all.length]];
  const unsent=all.filter(s=>s.contractor_id&&s.status==='open'&&(s.email_status==='pending'||s.email_status==='failed')).length;
  const chips=(unsent?`<div class="email-line unsent"><span style="flex:1;min-width:0"><b>${unsent} snag email${unsent>1?'s':''} not sent.</b> ${S.emailReady?'Tap to try again.':'Email isn\'t set up on the server yet.'}</span>${S.emailReady?`<button type="button" class="btn" data-act="send-unsent">Send now</button>`:''}</div>`:'')+`<div class="chips">${F.map(([k,l,n])=>`<button type="button" class="chip-btn" data-act="snag-f" data-v="${k}" aria-pressed="${S.snagF===k}">${l}<span class="n">${n}</span></button>`).join('')}</div>`;
  if(!all.length)return chips+`<div class="empty"><h3>No snags raised</h3><p>When you spot something, tap <b>Raise a snag</b>, take a photo and say what's wrong. It takes about 30 seconds.</p></div>`;
  const q=S.snagQ.trim().toLowerCase();
  const list=all.filter(s=>(S.snagF==='all'||(S.snagF==='overdue'?isOverdue(s):(s.status||'open')===S.snagF))&&(!q||[s.title,s.location,s.trade,snagRef(s),(S.props.get(s.property_id)||{}).address,(S.props.get(s.property_id)||{}).postcode].join(' ').toLowerCase().includes(q)));
  return chips+(list.length?`<div class="list">${list.map(s=>snagRow(s)).join('')}</div>`:`<div class="empty"><h3>Nothing here</h3><p>${S.snagF==='open'?'No open snags. Good work.':'No snags match this filter.'}</p></div>`);
}

/* ---------- property ---------- */
function flagsOf(sv){let n=0;for(const sec of surveySections(sv.type))for(const [id,,,,flag] of sec.qs){const a=sv.answers&&sv.answers[id];if(flag&&(a===flag||(Array.isArray(a)&&a.includes(flag))))n++}return n}
function propertyBody(){
  const p=S.props.get(S.view.id);
  if(!p)return`<div class="empty"><h3>This address has been removed</h3><button type="button" class="btn" data-act="back">Back to addresses</button></div>`;
  const st=p.status||'To survey';
  const svs=[...S.surveys.values()].filter(s=>s.property_id===p.id).sort((a,b)=>(b.updated_at||0)-(a.updated_at||0));
  const sns=[...S.snags.values()].filter(s=>s.property_id===p.id).sort((a,b)=>((a.status==='closed')-(b.status==='closed'))||(b.raised_at||0)-(a.raised_at||0));
  return`<div class="prop-head"><h1>${esc(p.address)}</h1><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="pc">${esc(p.postcode||'')}</span>${p.ref?`<span class="meta mono">Ref ${esc(p.ref)}</span>`:''}${projectName(p)?`<span class="tag">${esc(projectName(p))}</span>`:''}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${(p.works||[]).map(w=>`<span class="tag">${WORKS[w]||w}</span>`).join('')}</div></div>
  <div class="field"><span class="lab">Job status</span><div class="seg">${PSTATUS.map(s=>`<button type="button" data-act="set-status" data-v="${s}" aria-pressed="${st===s}">${s}</button>`).join('')}</div></div>
  ${p.notes?`<div class="field"><span class="lab">Access notes</span><div class="notes-box">${esc(p.notes)}</div></div>`:''}
  <div class="big-actions"><button type="button" class="btn primary" data-act="new-survey">${I.clip} Start survey</button><button type="button" class="btn dark" data-act="new-snag" data-pid="${p.id}">${I.cam} Raise snag</button></div>
  <div class="section-h"><h3>Surveys</h3><span class="meta">${svs.length}</span></div>
  ${svs.length?`<div class="list">${svs.map(s=>{const f=flagsOf(s);return`<button type="button" class="row" data-act="open-survey" data-id="${s.id}"><div class="main"><span class="t">${WORKS[s.type]||s.type} survey</span><span class="s">${esc(s.by_name||'')} · ${fmtDate(s.updated_at)}${f?` · <span style="color:var(--bad);font-weight:700">${f} to check</span>`:''}</span></div><span class="pill ${s.status==='submitted'?'p-ok':'p-warn'}">${s.status==='submitted'?'Submitted':'Draft'}</span><span class="chev">${I.chev}</span></button>`}).join('')}</div>`:`<p class="meta" style="margin:0">No survey yet. Tap <b>Start survey</b> when you're at the door.</p>`}
  <div class="section-h"><h3>Snags</h3><span class="meta">${sns.filter(s=>s.status!=='closed').length} open</span></div>
  ${sns.length?`<div class="list">${sns.map(s=>snagRow(s,false)).join('')}</div>`:`<p class="meta" style="margin:0">No snags at this address.</p>`}
  <button type="button" class="btn" data-act="edit-prop" style="align-self:flex-start">Edit address details</button>`;
}

/* ---------- projects tab ---------- */
function projectsBody(){
  const list=projectList();
  let out='';
  if(!list.length)out=canManage()?`<div class="empty"><h3>No projects yet</h3><p>Make one project per contract. Each gets its own PIN for the site team, and its contractors get snags emailed straight to them.</p></div>`:`<div class="empty"><h3>No projects unlocked</h3><p>Ask your project manager for the project PIN.</p></div>`;
  else out=`<div class="list">${list.map(pr=>{
    const props=[...S.props.values()].filter(p=>p.project_id===pr.id);const ids=new Set(props.map(p=>p.id));
    const open=[...S.snags.values()].filter(s=>ids.has(s.property_id)&&s.status!=='closed').length;const cs=contractorsOf(pr.id);
    return`<button type="button" class="row" data-act="open-project" data-id="${pr.id}"><div class="main"><span class="t">${esc(pr.name)}</span><span class="s"><span>${props.length} address${props.length===1?'':'es'}</span><span>${cs.length} contractor${cs.length===1?'':'s'}</span>${pr.manages?`<span class="mono">PIN ${esc(pr.pin)}</span>`:''}${S.role==='admin'?`<span>${esc((S.pms.get(pr.pm_id)||{}).name||'Run by you')}</span>`:''}</span></div><div class="end">${open?`<span class="badge-snags">${open} open</span>`:''}</div><span class="chev">${I.chev}</span></button>`}).join('')}</div>`;
  if(S.role==='admin'){
    const pms=[...S.pms.values()].sort((a,b)=>a.name.localeCompare(b.name));
    out+=`<div class="section-h"><h3>Project managers</h3><span class="meta">${pms.length}</span></div>
    <p class="meta" style="margin:-8px 0 0">Give each PM their own PIN. They can set up and run their own projects, and only see theirs.</p>
    ${pms.length?`<div class="list">${pms.map(m=>{const n=[...S.projects.values()].filter(p=>p.pm_id===m.id).length;return`<button type="button" class="row" data-act="open-pm" data-id="${m.id}"><div class="main"><span class="t">${esc(m.name)}</span><span class="s"><span>${esc(m.email||'')}</span><span class="mono">PIN ${esc(m.pin)}</span><span>${n} project${n===1?'':'s'}</span></span></div><span class="chev">${I.chev}</span></button>`}).join('')}</div>`:''}
    <button type="button" class="btn" data-act="new-pm" style="align-self:flex-start">${I.plus} Add a project manager</button>`;
  }
  return out+`<div class="panel" style="display:flex;flex-direction:column;gap:10px"><div><b>On this phone</b><div class="meta">${esc(S.name||'No name')} · ${S.role==='admin'?'Admin (all projects)':S.role==='pm'?'Project manager':'Site team'}</div></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn" data-act="change-name">Change my name</button><button type="button" class="btn danger" data-act="sign-out">Lock this phone</button></div></div>`;
}
function genPin(){const b=new Uint32Array(1);crypto.getRandomValues(b);return String(100000+b[0]%900000)}
function projectSheet(pr){
  if(pr&&!pr.manages||!canManage())return projectInfoSheet(pr);
  pr=pr||{name:'',pm_email:S.role==='pm'&&S.me?S.me.email:'',pin:genPin(),pm_id:null};
  let rows=pr.id?contractorsOf(pr.id).map(c=>({...c})):[];
  const readRows=()=>{document.querySelectorAll('.c-row').forEach((el,i)=>{if(!rows[i])return;rows[i].name=$('.c-name',el).value.trim();rows[i].email=$('.c-email',el).value.trim();rows[i].trade=$('.c-trade',el).value})};
  const drawRows=()=>{$('#c-rows').innerHTML=rows.length?rows.map((c,i)=>`<div class="c-row">
      <div class="field"><label for="cn${i}">Contractor / company name</label><input id="cn${i}" class="inp c-name" value="${esc(c.name)}" placeholder="e.g. Smith Plumbing Ltd"></div>
      <div class="field"><label for="ce${i}">Their email</label><input id="ce${i}" class="inp c-email" type="email" inputmode="email" autocapitalize="off" value="${esc(c.email)}" placeholder="snags@smithplumbing.co.uk"></div>
      <div class="field"><label for="ct${i}">Trade</label><select id="ct${i}" class="inp c-trade"><option value="">Any</option>${TRADES.map(t=>`<option ${c.trade===t?'selected':''}>${t}</option>`).join('')}</select></div>
      ${c.token?`<div class="field"><span class="lab" style="font-size:14px">Their link (no login needed)</span><div class="copy-row"><input class="inp" readonly value="${esc(contractorLink(c))}" aria-label="Contractor link"><button type="button" class="btn" data-act="copy" data-v="${esc(contractorLink(c))}">Copy</button></div><button type="button" class="btn" data-act="c-newlink" data-id="${c.id}" style="align-self:flex-start;min-height:40px;font-size:14px">Stop old link and make a new one</button></div>`:''}
      <button type="button" class="btn danger" data-act="c-rm" data-i="${i}" style="align-self:flex-start;min-height:42px">Remove</button></div>`).join(''):'<p class="meta" style="margin:0">No contractors yet.</p>'};
  openSheet({title:pr.id?'Edit project':'New project',
   body:`<div class="field"><label for="pj-n">Project name</label><p class="help">What your team calls the contract, e.g. "Leeds K&amp;B Phase 2".</p><input id="pj-n" class="inp" value="${esc(pr.name)}"></div>
   <div class="field"><label for="pj-pin">Site team PIN</label><p class="help">Give this to your site team. It opens this project only. Change it if it gets passed around.</p><div class="copy-row"><input id="pj-pin" class="inp mono" inputmode="numeric" maxlength="6" value="${esc(pr.pin)}" style="font-size:22px;letter-spacing:.2em"><button type="button" class="btn" data-act="pj-newpin">New PIN</button></div></div>
   ${S.role==='admin'&&S.pms.size?`<div class="field"><label for="pj-pm">Run by</label><select id="pj-pm" class="inp"><option value="">You (admin)</option>${[...S.pms.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(m=>`<option value="${m.id}" ${pr.pm_id===m.id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></div>`:''}
   <div class="field"><label for="pj-e">Project manager's work email</label><p class="help">Copied in on every snag email, and told when a contractor closes one out.</p><input id="pj-e" class="inp" type="email" inputmode="email" autocapitalize="off" value="${esc(pr.pm_email)}" placeholder="you@chasberger.co.uk"></div>
   <div class="section-h"><h3>Contractors</h3></div>
   <p class="meta" style="margin:-8px 0 0">Snags you assign to them get emailed with photos and a link. The link shows only their snags, with no login.</p>
   <div id="c-rows" style="display:flex;flex-direction:column;gap:10px"></div>
   <button type="button" class="btn" data-act="c-add" style="align-self:flex-start">${I.plus} Add contractor</button>
   ${pr.id?`<button type="button" class="btn danger" data-act="pj-del" style="align-self:flex-start">Delete project</button>`:''}`,
   foot:`<button type="button" class="btn primary" data-act="pj-save">Save project</button>`,
   mount(){drawRows()},
   acts:{
    'pj-newpin':()=>{$('#pj-pin').value=genPin()},
    'c-add':()=>{readRows();rows.push({name:'',email:'',trade:''});drawRows();const el=document.querySelectorAll('.c-name');if(el.length)el[el.length-1].focus()},
    'c-rm':b=>{readRows();rows.splice(+b.dataset.i,1);drawRows()},
    'c-newlink':async b=>{try{await api('newContractorLink',{id:b.dataset.id});await load();closeSheet();projectSheet(S.projects.get(pr.id));toast('New link made. The old one no longer works.')}catch(e){toast(e.message)}},
    'pj-save':async btn=>{
      readRows();btn.disabled=true;
      try{await api('saveProject',{id:pr.id,pm_id:$('#pj-pm')?$('#pj-pm').value||null:pr.pm_id,name:$('#pj-n').value,pm_email:$('#pj-e').value,pin:$('#pj-pin').value.trim(),contractors:rows.map(c=>({id:c.id,name:c.name,email:c.email,trade:c.trade}))});await load();closeSheet();toast(pr.id?'Project saved':'Project created. Open it again to copy the contractor links.')}
      catch(e){btn.disabled=false;toast(e.message)}
    },
    'pj-del':async btn=>{if(btn.dataset.armed!=='1'){btn.dataset.armed='1';btn.textContent='Tap again to delete (addresses are kept)';setTimeout(()=>{btn.dataset.armed='';btn.textContent='Delete project'},4000);return}
      try{await api('deleteProject',{id:pr.id});await load();closeSheet();toast('Project deleted')}catch(e){toast(e.message)}}}});
}
function pmSheet(m){
  m=m||{name:'',email:'',pin:genPin()};
  openSheet({title:m.id?'Project manager':'Add a project manager',
   body:`<div class="field"><label for="pm-n">Name</label><input id="pm-n" class="inp" value="${esc(m.name)}" placeholder="e.g. Sarah Khan"></div>
   <div class="field"><label for="pm-e">Work email</label><p class="help">Filled in for them on each new project, so they get copied in on snag emails.</p><input id="pm-e" class="inp" type="email" inputmode="email" autocapitalize="off" value="${esc(m.email)}" placeholder="s.khan@chasberger.co.uk"></div>
   <div class="field"><label for="pm-pin">Their PM PIN</label><p class="help">Give them this and the app link. It lets them set up their own projects. Keep it separate from site team PINs.</p><div class="copy-row"><input id="pm-pin" class="inp mono" inputmode="numeric" maxlength="6" value="${esc(m.pin)}" style="font-size:22px;letter-spacing:.2em"><button type="button" class="btn" data-act="pm-newpin">New PIN</button></div></div>
   <div class="panel" style="font-size:15px"><b>Message to send them</b><div class="copy-row" style="flex-direction:column;margin-top:8px"><textarea id="pm-msg" class="inp" readonly rows="5"></textarea><button type="button" class="btn" data-act="pm-copy">Copy message</button></div></div>
   ${m.id?`<button type="button" class="btn danger" data-act="pm-del" style="align-self:flex-start">Remove this project manager</button>`:''}`,
   foot:`<button type="button" class="btn primary" data-act="pm-save">${m.id?'Save':'Add project manager'}</button>`,
   mount(sh){const msg=()=>{$('#pm-msg').value=`Hi ${$('#pm-n').value.trim().split(' ')[0]||''}, here's the Chas Berger Site App: ${location.origin}\n\nYour PM PIN is ${$('#pm-pin').value}. Enter it once and you can set up your own projects, site team PINs and contractors.\n\nDon't share this PIN with site teams. Each project gets its own PIN for them.`};['#pm-n','#pm-pin'].forEach(x=>$(x,sh).addEventListener('input',msg));msg()},
   acts:{
    'pm-newpin':()=>{$('#pm-pin').value=genPin();$('#pm-pin').dispatchEvent(new Event('input',{bubbles:true}))},
    'pm-copy':b=>copyText($('#pm-msg').value,b),
    'pm-save':async b=>{b.disabled=true;try{await api('savePm',{id:m.id,name:$('#pm-n').value,email:$('#pm-e').value,pin:$('#pm-pin').value.trim()});await load();closeSheet();toast(m.id?'Saved':'Project manager added. Send them the message with their PIN.')}catch(e){b.disabled=false;toast(e.message)}},
    'pm-del':async btn=>{if(btn.dataset.armed!=='1'){btn.dataset.armed='1';btn.textContent='Tap again: their PIN stops working, their projects move to you';setTimeout(()=>{btn.dataset.armed='';btn.textContent='Remove this project manager'},4000);return}
      try{await api('deletePm',{id:m.id});await load();closeSheet();toast('Removed')}catch(e){toast(e.message)}}}});
}
function projectInfoSheet(pr){
  const cs=contractorsOf(pr.id);
  openSheet({title:pr.name,body:`<dl class="kv"><dt>Project manager</dt><dd>${esc(pr.pm_email||'Not set')}</dd></dl><div class="section-h"><h3>Contractors</h3></div>${cs.length?`<div class="list">${cs.map(c=>`<div class="row" style="cursor:default"><div class="main"><span class="t">${esc(c.name)}</span><span class="s"><span>${esc(c.email)}</span>${c.trade?`<span class="tag">${esc(c.trade)}</span>`:''}</span></div></div>`).join('')}</div>`:'<p class="meta">No contractors set up yet.</p>'}`});
}
function addPinSheet(){
  openSheet({title:'Add a project',body:`<p class="meta" style="margin:0">Enter the PIN for another project. You'll then see both on this phone.</p><div class="field"><label for="ap-pin">Project PIN</label><input id="ap-pin" class="inp pin-input" inputmode="numeric" pattern="[0-9]*" maxlength="12" autocomplete="one-time-code"></div>`,
   foot:`<button type="button" class="btn primary" data-act="ap-go">Add project</button>`,mount(){$('#ap-pin').focus()},
   acts:{'ap-go':async btn=>{btn.disabled=true;try{const r=await api('login',{pin:$('#ap-pin').value.trim(),current:S.token});S.token=r.token;save();await load();closeSheet();toast(r.project?r.project+' added':'Done')}catch(e){btn.disabled=false;toast(e.message)}}}});
}
function nameSheet(){
  openSheet({title:'Your name',body:`<div class="field"><label for="nm">Name shown on snags and surveys you raise</label><input id="nm" class="inp" value="${esc(S.name)}"></div>`,foot:`<button type="button" class="btn primary" data-act="nm-save">Save</button>`,
   acts:{'nm-save':()=>{const v=$('#nm').value.trim();if(!v){toast('Put your name in');return}S.name=v;save();closeSheet();renderBody();toast('Saved')}}});
}

/* ---------- reports ---------- */
function reportsBody(){
  const props=[...S.props.values()],snags=[...S.snags.values()],svs=[...S.surveys.values()];
  const surveyed=props.filter(p=>p.status&&p.status!=='To survey').length;
  const complete=props.filter(p=>p.status==='Complete').length;
  const open=snags.filter(s=>s.status==='open').length,ready=snags.filter(s=>s.status==='fixed').length,overdue=snags.filter(isOverdue).length;
  const pct=(a,b)=>b?Math.round(a/b*100):0;
  const rows=Object.keys(WORKS).map(w=>{const ps=props.filter(p=>(p.works||[]).includes(w));if(!ps.length)return'';const ids=new Set(ps.map(p=>p.id));const sv=ps.filter(p=>p.status&&p.status!=='To survey').length;const cm=ps.filter(p=>p.status==='Complete').length;const os=snags.filter(s=>ids.has(s.property_id)&&s.status!=='closed').length;return`<tr><td>${WORKS[w]}</td><td class="n">${ps.length}</td><td class="n">${sv}</td><td class="n">${cm}</td><td class="n">${os}</td></tr>`}).join('');
  const flagged=svs.filter(s=>s.status==='submitted'&&flagsOf(s)>0);
  return`<div class="tiles">
   <div class="tile"><div class="v">${props.length}</div><div class="l">Addresses</div></div>
   <div class="tile"><div class="v">${pct(surveyed,props.length)}%</div><div class="l">Surveyed (${surveyed})</div><div class="bar"><i style="width:${pct(surveyed,props.length)}%"></i></div></div>
   <div class="tile"><div class="v">${pct(complete,props.length)}%</div><div class="l">Complete (${complete})</div><div class="bar"><i style="width:${pct(complete,props.length)}%"></i></div></div>
   <div class="tile ${overdue?'alert':''}"><div class="v">${open+ready}</div><div class="l">Snags not closed${overdue?` · ${overdue} overdue`:''}</div></div></div>
  ${rows?`<div class="section-h"><h3>By type of work</h3></div><div class="tbl-wrap"><table><thead><tr><th>Work</th><th class="n">Addresses</th><th class="n">Surveyed</th><th class="n">Complete</th><th class="n">Open snags</th></tr></thead><tbody>${rows}</tbody></table></div>`:''}
  ${ready?`<div class="panel" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>${ready} snag${ready>1?'s':''} waiting for you to check</b><div class="meta">Marked done by the contractor or trade.</div></div><button type="button" class="btn" data-act="goto-ready">Show them</button></div>`:''}
  ${flagged.length?`<div class="section-h"><h3>Surveys with things to check</h3><span class="meta">${flagged.length}</span></div><div class="list">${flagged.map(s=>{const p=S.props.get(s.property_id)||{};return`<button type="button" class="row" data-act="open-survey" data-id="${s.id}"><div class="main"><span class="t">${esc(p.address||'Unknown')}</span><span class="s">${WORKS[s.type]} · <span style="color:var(--bad);font-weight:700">${flagsOf(s)} flagged</span></span></div><span class="chev">${I.chev}</span></button>`}).join('')}</div>`:''}
  <div class="section-h"><h3>Download for Excel</h3></div>
  <div style="display:flex;flex-direction:column;gap:10px">
    <button type="button" class="btn block" data-act="export" data-v="snags">${I.dl} Snag register (.csv)</button>
    <button type="button" class="btn block" data-act="export" data-v="surveys">${I.dl} Survey answers (.csv)</button>
    <button type="button" class="btn block" data-act="export" data-v="props">${I.dl} Address list with status (.csv)</button></div>`;
}

/* ---------- sheet ---------- */
function openSheet({title,body,foot,acts={},mount}){
  const sh=$('#sheet');
  sh.innerHTML=`<div class="sh-head"><div class="in"><button type="button" class="icon-btn" data-act="close-sheet" aria-label="Close">${I.x}</button><h2>${esc(title)}</h2></div></div><div class="sh-body"><div class="in">${body}</div></div>${foot?`<div class="sh-foot"><div class="in">${foot}</div></div>`:''}`;
  sh.hidden=false;document.body.classList.add('locked');S.sheetActs=acts;if(mount)mount(sh);
}
function closeSheet(){const sh=$('#sheet');sh.hidden=true;sh.innerHTML='';S.sheetActs={};S.photos={};document.body.classList.remove('locked')}

/* photo picker */
function photoField(key,paths=[]){S.photos[key]=paths.map(path=>({path}));return`<div class="photos" data-photos="${key}">${thumbs(key)}</div>`}
function thumbs(key){
  const l=S.photos[key]||[];
  return l.map((p,i)=>`<div class="thumb ${p.pending?'pending':''}"><img src="${p.pending?p.local:src(p.path)}" alt="Photo ${i+1}" ${p.pending?'':`data-act="view-photo" data-src="${src(p.path)}"`}>${p.pending?'':`<button type="button" class="thumb-x" data-act="rm-photo" data-key="${key}" data-i="${i}" aria-label="Remove photo">×</button>`}</div>`).join('')
   +`<label class="thumb add">${I.cam}<span>Add photo</span><input type="file" accept="image/*" multiple data-photo-input="${key}" aria-label="Add photo"></label>`;
}
function refreshThumbs(key){const el=document.querySelector(`[data-photos="${key}"]`);if(el)el.innerHTML=thumbs(key)}
const photoPaths=key=>(S.photos[key]||[]).filter(p=>p.path).map(p=>p.path);
const photosBusy=()=>Object.values(S.photos).some(l=>l.some(p=>p.pending));
async function shrink(file){
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    const s=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
    const c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    return await new Promise(r=>c.toBlob(r,'image/jpeg',0.8));
  }finally{URL.revokeObjectURL(url)}
}
const toB64=blob=>new Promise((res,rej)=>{const f=new FileReader();f.onload=()=>res(String(f.result).split(',')[1]);f.onerror=rej;f.readAsDataURL(blob)});
document.addEventListener('change',async e=>{
  const sel=e.target.closest&&e.target.closest('[data-sel]');
  if(sel){sel.checked?S.sel.add(sel.dataset.sel):S.sel.delete(sel.dataset.sel);const b=$('.selbar b');if(b)b.textContent=S.sel.size+' picked';return}
  const inp=e.target.closest&&e.target.closest('[data-photo-input]');if(!inp)return;
  const key=inp.dataset.photoInput;const files=[...inp.files];inp.value='';
  for(const f of files){
    const item={pending:true,local:URL.createObjectURL(f)};S.photos[key].push(item);refreshThumbs(key);
    try{const blob=await shrink(f);if(!blob)throw{message:'That photo couldn\'t be read'};const r=await api('uploadPhoto',{data:await toB64(blob),type:'image/jpeg'});item.path=r.path;item.pending=false}
    catch(err){const l=S.photos[key];if(l)l.splice(l.indexOf(item),1);toast(err.message||'That photo didn\'t upload. Try again.')}
    refreshThumbs(key);
  }
});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.classList.add('broken')},true);

/* ---------- add addresses ---------- */
function splitCsv(line){const r=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(q){if(c==='"'){if(line[i+1]==='"'){cur+='"';i++}else q=false}else cur+=c}else if(c==='"')q=true;else if(c===','){r.push(cur);cur=''}else cur+=c}r.push(cur);return r}
function worksFrom(txt){
  const t=String(txt||'').toLowerCase();const w=[];
  if(/kitchen/.test(t))w.push('kitchen');if(/bath/.test(t))w.push('bathroom');if(/window|door/.test(t))w.push('windows');
  if(/roof/.test(t))w.push('roofing');if(/external/.test(t))w.push('external');if(/structur/.test(t))w.push('structural');
  return w;
}
function parseAddresses(text){
  const out=[];let map=null;
  for(const line of text.split(/\r?\n/)){
    if(!line.trim())continue;
    // Header row from the Excel template (or any sheet with Address + Postcode headings): read columns by name
    const raw=(line.includes('\t')?line.split('\t'):splitCsv(line)).map(c=>c.trim());
    if(!map&&raw.some(c=>/^address/i.test(c))&&raw.some(c=>/post\s*code/i.test(c))){
      const f=re=>raw.findIndex(c=>re.test(c));
      map={ref:f(/uprn|ref/i),address:f(/^address/i),postcode:f(/post\s*code/i),works:f(/work/i),notes:f(/access|note/i)};continue;
    }
    if(map){
      const g=k=>map[k]>=0?(raw[map[k]]||'').trim():'';
      const address=g('address').replace(/\s+/g,' ');if(!address)continue;
      const m=g('postcode').match(PC);
      out.push({ref:g('ref'),address,postcode:m?(m[1]+' '+m[2]).toUpperCase():g('postcode').toUpperCase(),works:worksFrom(g('works')),notes:g('notes')});continue;
    }
    let cells=raw.filter(Boolean);
    if(!cells.length)continue;
    if(!PC.test(line)&&/^(uprn|ref|address|property|house|postcode|no\.?)\b/i.test(cells[0]))continue;
    let postcode='';
    for(let i=cells.length-1;i>=0;i--){const m=cells[i].match(PC);if(m){postcode=(m[1]+' '+m[2]).toUpperCase();cells[i]=cells[i].replace(m[0],'').replace(/[,\s]+$/,'').trim();break}}
    cells=cells.filter(Boolean);
    let ref='';
    if(cells.length>1&&/^[A-Z0-9\-\/]{4,20}$/i.test(cells[0])&&/\d/.test(cells[0])&&!/^\d{1,3}[A-Z]?$/i.test(cells[0]))ref=cells.shift();
    const address=cells.join(', ').replace(/\s+/g,' ');
    if(address)out.push({ref,address,postcode,works:[],notes:''});
  }
  return out;
}
let sheetJS;
function loadSheetJS(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  return sheetJS||(sheetJS=new Promise((res,rej)=>{const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';sc.onload=()=>res(window.XLSX);sc.onerror=()=>{sheetJS=null;rej(new Error('load'))};document.head.appendChild(sc)}));
}
function addAddressesSheet(){
  const projs=projectList();
  if(!projs.length&&S.role!=='admin'){toast('Unlock a project first');return}
  let parsed=[];
  const preview=()=>{
    const pid=$('#imp-proj').value;parsed=parseAddresses($('#imp-text').value);
    const have=new Set([...S.props.values()].filter(p=>(p.project_id||'')===pid).map(p=>normKey(p.address,p.postcode)));const seen=new Set();
    parsed.forEach(p=>{const k=normKey(p.address,p.postcode);p.dup=have.has(k)||seen.has(k);seen.add(k)});
    const fresh=parsed.filter(p=>!p.dup).length,dups=parsed.length-fresh,nopc=parsed.filter(p=>!p.postcode&&!p.dup).length;
    $('#imp-summary').innerHTML=parsed.length?`<b>${fresh} address${fresh===1?'':'es'} ready to add</b>${dups?` · ${dups} already in this project (skipped)`:''}${nopc?` · <span style="color:var(--warn)">${nopc} with no postcode</span>`:''}`:'Nothing added yet.';
    $('#imp-list').innerHTML=parsed.slice(0,300).map(p=>`<div class="${p.dup?'dup':''}"><span>${p.ref?`<span class="mono meta">${esc(p.ref)}</span> `:''}${esc(p.address)}</span><span class="mono">${esc(p.postcode||'—')}</span></div>`).join('');
    $('#imp-list').hidden=!parsed.length;
    $('#imp-go').disabled=!fresh;$('#imp-go').textContent=fresh?`Add ${fresh} address${fresh===1?'':'es'}`:'Add addresses';
  };
  openSheet({title:'Add addresses',
   body:`<div class="field"><label for="imp-proj">1. Which project?</label><select id="imp-proj" class="inp">${projs.map(pr=>`<option value="${pr.id}" ${S.scheme===pr.id?'selected':''}>${esc(pr.name)}</option>`).join('')}${S.role==='admin'?'<option value="">No project</option>':''}</select></div>
   <div class="field"><span class="lab">2. Upload the Excel template</span><label class="btn" style="align-self:flex-start;cursor:pointer">${I.up} Choose Excel file<input type="file" accept=".xlsx,.xls,.csv,.txt" id="imp-file" hidden></label></div>
   <div class="field"><label for="imp-text">…or paste the list</label><p class="help">Copy straight from Excel (UPRN, address, postcode columns) or type one per line.</p>
   <textarea id="imp-text" class="inp paste" placeholder="12 Elm Grove, Leeds, LS6 2AB&#10;14 Elm Grove, Leeds, LS6 2AB" spellcheck="false"></textarea></div>
   <div class="field"><span class="lab">3. What work is planned?</span><p class="help">Tick all that apply. If your spreadsheet has a Work planned column, that's used instead for those rows.</p><div class="opts">${Object.entries(WORKS).map(([k,v])=>`<label class="opt"><input type="checkbox" name="imp-work" value="${k}"><span>${v}</span></label>`).join('')}</div></div>
   <div class="field"><span class="lab">4. Check before adding</span><p class="meta" id="imp-summary" style="margin:0">Nothing added yet.</p><div class="preview-list" id="imp-list" hidden></div></div>
   <div id="imp-prog" hidden class="field"><span class="lab" id="imp-prog-t">Adding…</span><div class="progress"><i id="imp-bar"></i></div></div>`,
   foot:`<button type="button" class="btn primary" id="imp-go" data-act="imp-go" disabled>Add addresses</button>`,
   mount(sh){
     $('#imp-text',sh).addEventListener('input',preview);$('#imp-proj',sh).addEventListener('change',preview);
     $('#imp-file',sh).addEventListener('change',async e=>{
       const f=e.target.files[0];e.target.value='';if(!f)return;
       try{
         if(/\.xlsx?$/i.test(f.name)){
           toast('Reading '+f.name+'…');const X=await loadSheetJS();
           const wb=X.read(await f.arrayBuffer(),{type:'array'});
           const name=wb.SheetNames.find(n=>/address/i.test(n))||wb.SheetNames[0];
           $('#imp-text').value=X.utils.sheet_to_csv(wb.Sheets[name],{FS:'\t',blankrows:false});
         }else $('#imp-text').value=await f.text();
         preview();
       }catch(err){toast('Couldn\'t read that file. Use the Chas Berger address template, saved as .xlsx.')}
     });
   },
   acts:{'imp-go':async btn=>{
     const todo=parsed.filter(p=>!p.dup);if(!todo.length)return;
     const works=[...document.querySelectorAll('input[name="imp-work"]:checked')].map(i=>i.value);
     const project_id=$('#imp-proj').value||null;
     btn.disabled=true;$('#imp-prog').hidden=false;let done=0,added=0;
     try{
       for(let i=0;i<todo.length;i+=400){
         const r=await api('addProperties',{project_id,works,rows:todo.slice(i,i+400).map(({ref,address,postcode,works,notes})=>({ref,address,postcode,works,notes}))});
         added+=r.added;done=Math.min(todo.length,i+400);$('#imp-bar').style.width=(done/todo.length*100)+'%';$('#imp-prog-t').textContent=`Adding ${done} of ${todo.length}…`;
       }
       await load();closeSheet();toast(`Added ${added} address${added===1?'':'es'}`);
     }catch(e){btn.disabled=false;await load();toast(`${e.message} ${done?`(${added} were added before it stopped)`:''}`)}
   }}});
}
function editPropSheet(p){
  openSheet({title:'Edit address',
   body:`<div class="field"><label for="ep-a">Address</label><input id="ep-a" class="inp" value="${esc(p.address)}"></div>
   <div class="field"><label for="ep-pc">Postcode</label><input id="ep-pc" class="inp mono" value="${esc(p.postcode)}" autocapitalize="characters"></div>
   <div class="field"><label for="ep-ref">UPRN / property ref</label><input id="ep-ref" class="inp mono" value="${esc(p.ref)}"></div>
   <div class="field"><label for="ep-s">Project</label><select id="ep-s" class="inp">${S.role==='admin'?'<option value="">No project</option>':''}${projectList().map(pr=>`<option value="${pr.id}" ${p.project_id===pr.id?'selected':''}>${esc(pr.name)}</option>`).join('')}</select></div>
   <div class="field"><span class="lab">Work planned</span><div class="opts">${Object.entries(WORKS).map(([k,v])=>`<label class="opt"><input type="checkbox" name="ep-w" value="${k}" ${(p.works||[]).includes(k)?'checked':''}><span>${v}</span></label>`).join('')}</div></div>
   <div class="field"><label for="ep-n">Access notes</label><p class="help">Best times, tenant needs, where the key safe is. Contractors on this job can see this, so no key safe codes.</p><textarea id="ep-n" class="inp">${esc(p.notes)}</textarea></div>
   <button type="button" class="btn danger" data-act="ep-del" style="align-self:flex-start">Delete this address</button>`,
   foot:`<button type="button" class="btn primary" data-act="ep-save">Save changes</button>`,
   acts:{
    'ep-save':async()=>{try{await api('updateProperty',{id:p.id,patch:{address:$('#ep-a').value,postcode:$('#ep-pc').value,ref:$('#ep-ref').value,project_id:$('#ep-s').value||null,works:[...document.querySelectorAll('input[name="ep-w"]:checked')].map(i=>i.value),notes:$('#ep-n').value}});await load();closeSheet();toast('Saved')}catch(e){toast(e.message)}},
    'ep-del':async btn=>{if(btn.dataset.armed!=='1'){btn.dataset.armed='1';btn.textContent='Tap again to delete it and its snags and surveys';setTimeout(()=>{btn.dataset.armed='';btn.textContent='Delete this address'},4000);return}
      try{await api('deleteProperty',{id:p.id});closeSheet();S.view=null;await load();render();toast('Address deleted')}catch(e){toast(e.message)}}}});
}

/* ---------- surveys ---------- */
function pickSurveyType(p){
  const mine=(p.works||[]).filter(w=>WORKS[w]);
  const order=[...mine,...Object.keys(WORKS).filter(w=>!mine.includes(w))];
  openSheet({title:'Which survey?',body:`<p class="meta" style="margin:0">${esc(p.address)}</p><div class="type-list">${order.map(w=>`<button type="button" class="btn ${mine.includes(w)?'suggest':''}" data-act="pick-type" data-v="${w}"><span>${WORKS[w]}</span>${mine.includes(w)?'<span class="pill p-bad">Planned</span>':I.chev}</button>`).join('')}</div>`,
   acts:{'pick-type':b=>{closeSheet();surveySheet(p,{type:b.dataset.v,answers:{}})}}});
}
function qControl([id,label,type,opts,flag,help],a){
  const v=a[id];const name='q_'+id;let c='';
  if(type==='yn'||type==='choice'){const o=type==='yn'?['Yes','No','N/A']:opts;c=`<div class="opts ${type==='yn'?'yn':''}" role="radiogroup" aria-label="${esc(label)}">${o.map(x=>`<label class="opt"><input type="radio" name="${name}" value="${esc(x)}" ${v===x?'checked':''} ${flag===x?'data-flag':''}><span>${esc(x)}</span></label>`).join('')}</div>`}
  else if(type==='multi')c=`<div class="opts">${opts.map(x=>`<label class="opt"><input type="checkbox" name="${name}" value="${esc(x)}" ${(v||[]).includes(x)?'checked':''}><span>${esc(x)}</span></label>`).join('')}</div>`;
  else if(type==='number')c=`<div class="num-row"><input class="inp" type="number" inputmode="decimal" name="${name}" id="${name}" value="${esc(v)}"></div>`;
  else c=`<textarea class="inp" name="${name}" id="${name}" rows="3">${esc(v)}</textarea>`;
  const lab=(type==='text'||type==='number')?`<label for="${name}">${esc(label)}</label>`:`<span class="lab">${esc(label)}</span>`;
  return`<div class="field">${lab}${help?`<p class="help">${esc(help)}</p>`:''}${c}</div>`;
}
function surveySheet(p,sv){
  const secs=surveySections(sv.type);const a=sv.answers||{};const total=secs.reduce((n,s)=>n+s.qs.length,0);
  const body=`<p class="meta" style="margin:0">${esc(p.address)} · <span class="mono">${esc(p.postcode)}</span>${sv.status==='submitted'?` · Submitted ${fmtDate(sv.submitted_at)}`:''}</p>
   <p class="meta" style="margin:0">Answers in <b style="color:var(--red)">red</b> are things the PM needs to know about.</p>
   <form id="sv-form">${secs.map((s,i)=>`<section class="sec" style="margin-bottom:14px"><div class="sec-h"><span class="num">${i+1}/${secs.length}</span><h3>${esc(s.title)}</h3></div>${s.qs.map(q=>qControl(q,a)).join('')}<div class="field"><span class="lab">Photos</span>${photoField('sec'+i,(sv.photos||{})['sec'+i]||[])}</div></section>`).join('')}</form>`;
  const collect=()=>{const fd=new FormData($('#sv-form'));const out={};for(const s of secs)for(const [id,,type] of s.qs){if(type==='multi'){const v=fd.getAll('q_'+id);if(v.length)out[id]=v}else{const v=String(fd.get('q_'+id)||'').trim();if(v)out[id]=v}}return out};
  const count=()=>{const el=$('#sv-count');if(el)el.textContent=`${Object.keys(collect()).length} of ${total} answered`};
  const saveIt=async(submit,btn)=>{
    if(photosBusy()){toast('Wait for photos to finish uploading');return}
    const photos={};secs.forEach((s,i)=>{const ids=photoPaths('sec'+i);if(ids.length)photos['sec'+i]=ids});
    btn.disabled=true;
    try{await api('saveSurvey',{id:sv.id,property_id:p.id,type:sv.type,answers:collect(),photos,submit});await load();closeSheet();toast(submit||sv.status==='submitted'?'Survey submitted':'Draft saved. Finish it later from the address page.')}
    catch(e){btn.disabled=false;toast(e.message)}
  };
  openSheet({title:`${WORKS[sv.type]} survey`,body,
   foot:`<span class="progress-txt" id="sv-count"></span>${sv.status==='submitted'?`<button type="button" class="btn primary" data-act="sv-submit">Save changes</button>`:`<button type="button" class="btn" data-act="sv-draft">Save draft</button><button type="button" class="btn primary" data-act="sv-submit">Submit</button>`}`,
   mount(sh){$('#sv-form',sh).addEventListener('change',count);$('#sv-form',sh).addEventListener('input',count);count()},
   acts:{'sv-draft':b=>saveIt(false,b),'sv-submit':b=>saveIt(true,b)}});
}

/* ---------- snags ---------- */
function newSnagSheet(pid){
  const props=sortedProps();
  if(!props.length){toast('Add the addresses first, then raise snags against them.');return}
  const fixed=pid&&S.props.get(pid);
  openSheet({title:'Raise a snag',
   body:(fixed?`<p class="meta" style="margin:0"><b style="color:var(--ink)">${esc(fixed.address)}</b> · <span class="mono">${esc(fixed.postcode)}</span></p>`:`<div class="field"><label for="sn-p">Which address?</label><select id="sn-p" class="inp"><option value="">Choose an address…</option>${props.map(p=>`<option value="${p.id}">${esc(p.address)} - ${esc(p.postcode)}</option>`).join('')}</select></div>`)+`
   <div class="field"><span class="lab">1. Take photos</span>${photoField('snag')}</div>
   <div class="field"><label for="sn-t">2. What's wrong?</label><input id="sn-t" class="inp" placeholder="e.g. Worktop joint not sealed by sink" maxlength="140"></div>
   <div class="field"><label for="sn-l">3. Where?</label><input id="sn-l" class="inp" list="rooms" placeholder="e.g. Kitchen"><datalist id="rooms">${ROOMS.map(r=>`<option value="${r}">`).join('')}</datalist></div>
   <div class="field"><label for="sn-c">4. Who's fixing it?</label><select id="sn-c" class="inp"></select><p class="help" id="sn-c-help"></p></div>
   <label class="check" id="sn-mail-row" hidden><input type="checkbox" id="sn-mail" checked><span><b>Email it to them now</b><br><span class="meta" id="sn-mail-to"></span></span></label>
   <div class="field"><span class="lab">5. How urgent?</span><div class="opts yn">${['Low','Medium','High'].map(x=>`<label class="opt"><input type="radio" name="sn-pr" value="${x}" ${x==='Medium'?'checked':''} ${x==='High'?'data-flag':''}><span>${x}</span></label>`).join('')}</div></div>
   <div class="field"><label for="sn-d">Fix by (optional)</label><input id="sn-d" class="inp" type="date" min="${todayISO()}"></div>
   <div class="field"><label for="sn-tr">Trade (optional)</label><select id="sn-tr" class="inp"><option value="">Not sure</option>${TRADES.map(t=>`<option>${t}</option>`).join('')}</select></div>
   <div class="field"><label for="sn-n">More detail (optional)</label><textarea id="sn-n" class="inp" rows="3"></textarea></div>`,
   foot:`<button type="button" class="btn primary" data-act="sn-save">Raise snag</button>`,
   mount(sh){
     const fill=()=>{
       const id=fixed?fixed.id:$('#sn-p').value;const p=S.props.get(id);const cs=p&&p.project_id?contractorsOf(p.project_id):[];
       $('#sn-c').innerHTML=`<option value="">Our own team</option>`+cs.map(c=>`<option value="${c.id}">${esc(c.name)}${c.trade?' ('+esc(c.trade)+')':''}</option>`).join('');
       if(cs.length===1)$('#sn-c').value=cs[0].id;
       $('#sn-c-help').textContent=!id?'Pick the address first.':!p.project_id?'This address isn\'t in a project, so there are no contractors to pick.':cs.length?'':'No contractors on this project yet.';
       mailRow();
     };
     const mailRow=()=>{const c=S.contractors.get($('#sn-c').value);$('#sn-mail-row').hidden=!c;if(c){const pr=S.projects.get(c.project_id);$('#sn-mail-to').textContent=`To ${c.email}${pr&&pr.pm_email?', copy to '+pr.pm_email:''}`;if(c.trade)$('#sn-tr').value=c.trade}};
     if(!fixed)$('#sn-p',sh).addEventListener('change',fill);
     $('#sn-c',sh).addEventListener('change',mailRow);fill();
   },
   acts:{'sn-save':async btn=>{
     const property_id=fixed?fixed.id:$('#sn-p').value;const title=$('#sn-t').value.trim();
     if(!property_id){toast('Pick the address first');return}
     if(!title){toast('Say what\'s wrong in a few words');$('#sn-t').focus();return}
     if(photosBusy()){toast('Wait for photos to finish uploading');return}
     const contractor_id=$('#sn-c').value||null;const sendEmail=!!contractor_id&&$('#sn-mail').checked;
     btn.disabled=true;btn.textContent=sendEmail?'Saving and emailing…':'Saving…';
     try{
       const r=await api('createSnag',{property_id,contractor_id,title,location:$('#sn-l').value,trade:$('#sn-tr').value,priority:(document.querySelector('input[name="sn-pr"]:checked')||{}).value,due:$('#sn-d').value,notes:$('#sn-n').value,photos:photoPaths('snag'),sendEmail});
       await load();closeSheet();
       const c=contractor_id&&S.contractors.get(contractor_id);
       toast(!sendEmail?'Snag raised':r.snag.email_status==='sent'?`Snag raised and emailed to ${c?c.name:'the contractor'}`:'Snag saved, but the email didn\'t send. Open it to try again or copy the email.');
     }catch(e){btn.disabled=false;btn.textContent='Raise snag';toast(e.message)}
   }}});
}
function emailText(s){
  const p=S.props.get(s.property_id)||{};const c=S.contractors.get(s.contractor_id);if(!c)return'';const pr=S.projects.get(c.project_id)||{};
  const lines=[['Ref',snagRef(s)],['Project',pr.name],['Address',`${p.address}, ${p.postcode}`],['Where',s.location],['Problem',s.title],['Priority',s.priority],['Fix by',fmtDue(s.due)],['Notes',s.notes],s.reopen_reason?['Why it\'s sent back',s.reopen_reason]:null].filter(l=>l&&l[1]);
  return`Subject: Snag ${snagRef(s)} - ${p.address}, ${p.postcode} - ${s.title}\n\nHi ${c.name},\n\n${s.reopen_reason?'This snag has been checked and sent back. Please go back and sort it.':'A snag has been raised for you to close out.'}\n\n${lines.map(([k,v])=>k+': '+v).join('\n')}\n\nClose it out with a photo here (no login needed):\n${contractorLink(c)}\n\nThanks,\nChas Berger${pr.pm_email?'\n'+pr.pm_email:''}`;
}
function snagSheet(s){
  if(S.mode==='contractor')return contractorSnagSheet(s);
  const p=S.props.get(s.property_id)||{};const [lab,cls]=snagLabel(s);
  const cx=s.contractor_id&&S.contractors.get(s.contractor_id);
  const gal=ids=>ids&&ids.length?`<div class="gallery">${ids.map(id=>`<img src="${src(id)}" alt="Snag photo" data-act="view-photo" data-src="${src(id)}">`).join('')}</div>`:'<p class="meta" style="margin:0">No photos.</p>';
  const txt=cx?emailText(s):'';
  const emailHtml=!cx?'':s.email_status==='sent'?`<div class="email-line sent"><span style="flex:1;min-width:0">Emailed to <b>${esc(s.emailed_to||cx.email)}</b> ${ago(s.emailed_at)}</span><button type="button" class="btn" data-act="sn-resend">Send again</button></div>`
    :`<div class="email-line unsent"><span style="flex:1;min-width:0">${s.email_status==='none'?'Not emailed.':`<b>Email not sent.</b> ${esc(s.email_error||'')}`}</span>${S.emailReady?`<button type="button" class="btn" data-act="sn-resend">Email ${esc(cx.name)}</button>`:''}</div>
      <details><summary class="meta" style="cursor:pointer;min-height:36px">Send it from Outlook instead</summary><div class="field" style="margin-top:8px"><p class="help">Copy this, paste it into a new email to ${esc(cx.email)} and attach the photos.</p><div class="copy-row" style="flex-direction:column"><textarea class="inp" readonly rows="8" aria-label="Email text">${esc(txt)}</textarea><button type="button" class="btn" data-act="copy" data-v="${esc(txt)}">Copy email</button></div></div></details>`;
  let foot='';
  if(s.status==='open')foot=`<button type="button" class="btn primary" data-act="sn-fixed">Mark as fixed</button>`;
  else if(s.status==='fixed')foot=`<button type="button" class="btn" data-act="sn-reopen">Not right, send back</button><button type="button" class="btn primary" data-act="sn-close">Checked, sign off</button>`;
  else foot=`<button type="button" class="btn" data-act="sn-reopen">Reopen snag</button>`;
  const upd=async(op,extra,msg,btn)=>{if(photosBusy()){toast('Wait for photos to finish uploading');return}if(btn)btn.disabled=true;try{const r=await api('snagAction',{id:s.id,op,...extra});await load();closeSheet();toast(typeof msg==='function'?msg(r.snag):msg)}catch(e){if(btn)btn.disabled=false;toast(e.message)}};
  openSheet({title:snagRef(s),
   body:`<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill ${cls}">${lab}</span>${s.priority==='High'?'<span class="pill p-bad">High priority</span>':`<span class="pill p-grey">${esc(s.priority||'Medium')} priority</span>`}${isOverdue(s)?'<span class="pill p-bad">Overdue</span>':''}</div>
   <h3 style="font-size:22px">${esc(s.title)}</h3>
   ${gal(s.photos)}
   ${emailHtml}
   <dl class="kv"><dt>Address</dt><dd>${esc(p.address||'Unknown')} <span class="mono">${esc(p.postcode||'')}</span></dd>${s.location?`<dt>Where</dt><dd>${esc(s.location)}</dd>`:''}<dt>Fixing it</dt><dd>${cx?esc(cx.name):'Our own team'}</dd>${s.trade?`<dt>Trade</dt><dd>${esc(s.trade)}</dd>`:''}${s.due?`<dt>Fix by</dt><dd>${fmtDue(s.due)}</dd>`:''}<dt>Raised</dt><dd>${fmtDate(s.raised_at)}${s.raised_by?' by '+esc(s.raised_by):''}</dd>${s.fixed_at?`<dt>Fixed</dt><dd>${fmtDate(s.fixed_at)}${s.fixed_by?' by '+esc(s.fixed_by):''}</dd>`:''}${s.closed_at&&s.status==='closed'?`<dt>Signed off</dt><dd>${fmtDate(s.closed_at)}${s.closed_by?' by '+esc(s.closed_by):''}</dd>`:''}</dl>
   ${s.notes?`<div class="notes-box">${esc(s.notes)}</div>`:''}
   ${s.fix_photos&&s.fix_photos.length?`<div class="field"><span class="lab">After photos</span>${gal(s.fix_photos)}${s.fix_note?`<div class="notes-box">${esc(s.fix_note)}</div>`:''}</div>`:''}
   ${s.status==='open'?`<div class="field"><span class="lab">After photos</span><p class="help">${cx?`${esc(cx.name)} adds these when they close it out. You can add them yourself too.`:'Take a photo of the finished repair before marking it fixed.'}</p>${photoField('fix')}</div>`:''}
   ${s.status!=='open'?`<div class="field"><label for="ro-r">If sending back, say why${cx?` (goes to ${esc(cx.name)})`:''}</label><textarea id="ro-r" class="inp" rows="2" placeholder="e.g. Silicone still gappy behind the tap"></textarea></div>`:''}
   <div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn" data-act="sn-goprop">Go to this address</button><button type="button" class="btn danger" data-act="sn-del">Delete snag</button></div>`,
   foot,
   acts:{
    'sn-fixed':b=>upd('fixed',{photos:photoPaths('fix')},'Marked as fixed',b),
    'sn-close':b=>upd('close',{},'Signed off',b),
    'sn-reopen':b=>{const reason=($('#ro-r')&&$('#ro-r').value.trim())||'';if(cx&&!reason){toast('Say why, so the contractor knows what to sort');$('#ro-r').focus();return}
      upd('reopen',{reason},sn=>cx?(sn.email_status==='sent'?'Sent back to '+cx.name:'Reopened, but the email didn\'t send. Open it to copy the email.'):'Snag reopened',b)},
    'sn-resend':async b=>{b.disabled=true;b.textContent='Sending…';try{const r=await api('resendEmail',{id:s.id});await load();closeSheet();toast(r.snag.email_status==='sent'?'Emailed to '+cx.name:'The email didn\'t send. Use "Send it from Outlook instead".')}catch(e){b.disabled=false;toast(e.message)}},
    'sn-goprop':()=>{closeSheet();if(p.id){S.view={name:'property',id:p.id};render()}},
    'sn-del':async btn=>{if(btn.dataset.armed!=='1'){btn.dataset.armed='1';btn.textContent='Tap again to delete for good';setTimeout(()=>{btn.dataset.armed='';btn.textContent='Delete snag'},4000);return}
      try{await api('deleteSnag',{id:s.id});await load();closeSheet();toast('Snag deleted')}catch(e){toast(e.message)}}}});
}

/* ---------- contractor view ---------- */
function contractorBody(){
  const all=[...S.snags.values()].sort((a,b)=>((b.priority==='High')-(a.priority==='High'))||(a.raised_at||0)-(b.raised_at||0));
  const cnt={open:0,fixed:0,closed:0};all.forEach(s=>cnt[s.status||'open']++);
  const list=all.filter(s=>(s.status||'open')===S.cF);
  const F=[['open','To do',cnt.open],['fixed','Done',cnt.fixed],['closed','Signed off',cnt.closed]];
  return`<div><h1 class="page-title">Your snags</h1><p class="lead">${esc(S.me?S.me.name:'')}${S.projects.size?' · '+esc([...S.projects.values()][0].name):''}</p></div>
  <div class="tiles" style="grid-template-columns:repeat(3,1fr)"><div class="tile ${cnt.open?'alert':''}"><div class="v">${cnt.open}</div><div class="l">To do</div></div><div class="tile"><div class="v">${cnt.fixed}</div><div class="l">Awaiting check</div></div><div class="tile"><div class="v">${cnt.closed}</div><div class="l">Signed off</div></div></div>
  <div class="chips">${F.map(([k,l,n])=>`<button type="button" class="chip-btn" data-act="c-f" data-v="${k}" aria-pressed="${S.cF===k}">${l}<span class="n">${n}</span></button>`).join('')}</div>
  ${list.length?`<div class="list">${list.map(s=>snagRow(s)).join('')}</div>`:`<div class="empty"><h3>${S.cF==='open'?'Nothing to do':'Nothing here yet'}</h3><p>${S.cF==='open'?'You\'ve no open snags. New ones will show here and land in your email.':'Snags you close out show here.'}</p></div>`}
  <p class="meta" style="margin:0">To close out a snag: tap it, take a photo of the finished repair, then tap <b>Close out snag</b>. Bookmark this page to come back to it.</p>`;
}
function contractorSnagSheet(s){
  const p=S.props.get(s.property_id)||{};const [lab,cls]=snagLabel(s);
  const gal=ids=>ids&&ids.length?`<div class="gallery">${ids.map(id=>`<img src="${src(id)}" alt="Snag photo" data-act="view-photo" data-src="${src(id)}">`).join('')}</div>`:'<p class="meta" style="margin:0">No photos.</p>';
  openSheet({title:snagRef(s),
   body:`<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="pill ${cls}">${lab}</span>${s.priority==='High'?'<span class="pill p-bad">High priority</span>':''}${isOverdue(s)?'<span class="pill p-bad">Overdue</span>':''}</div>
   ${s.reopen_reason&&s.status==='open'?`<div class="banner"><b>Sent back:</b> ${esc(s.reopen_reason)}</div>`:''}
   <h3 style="font-size:22px">${esc(s.title)}</h3>
   ${gal(s.photos)}
   <dl class="kv"><dt>Address</dt><dd>${esc(p.address||'')} <span class="mono">${esc(p.postcode||'')}</span></dd>${s.location?`<dt>Where</dt><dd>${esc(s.location)}</dd>`:''}${s.due?`<dt>Fix by</dt><dd>${fmtDue(s.due)}</dd>`:''}<dt>Raised</dt><dd>${fmtDate(s.raised_at)}</dd></dl>
   ${s.notes?`<div class="notes-box">${esc(s.notes)}</div>`:''}
   ${p.notes?`<div class="field"><span class="lab">Access notes</span><div class="notes-box">${esc(p.notes)}</div></div>`:''}
   ${s.fix_photos&&s.fix_photos.length?`<div class="field"><span class="lab">Close-out photos</span>${gal(s.fix_photos)}</div>`:''}
   ${s.status==='open'?`<div class="section-h"><h3>Close out</h3></div>
   <div class="field"><span class="lab">1. Photo of the finished repair</span><p class="help">At least one photo is needed.</p>${photoField('fix')}</div>
   <div class="field"><label for="fx-n">2. What did you do? (optional)</label><textarea id="fx-n" class="inp" rows="3" placeholder="e.g. Resealed worktop joint with clear silicone"></textarea></div>`:''}`,
   foot:s.status==='open'?`<button type="button" class="btn primary" data-act="fx-save">Close out snag</button>`:`<button type="button" class="btn" data-act="close-sheet">Done</button>`,
   acts:{'fx-save':async btn=>{
     if(photosBusy()){toast('Wait for photos to finish uploading');return}
     const photos=photoPaths('fix');if(!photos.length){toast('Add a photo of the finished repair first');return}
     btn.disabled=true;
     try{await api('closeOut',{id:s.id,photos,note:$('#fx-n').value});await load();closeSheet();toast('Closed out. The project manager will check it.')}catch(e){btn.disabled=false;toast(e.message)}
   }}});
}

/* ---------- exports ---------- */
function csv(rows){return rows.map(r=>r.map(v=>{v=v==null?'':String(v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(',')).join('\r\n')}
function exportCsv(kind){
  const P=id=>S.props.get(id)||{};let rows,name;const d=todayISO();
  if(kind==='snags'){name=`snag-register-${d}.csv`;rows=[['Ref','Address','Postcode','Project','Snag','Where','Contractor','Trade','Priority','Status','Raised','Raised by','Fix by','Fixed','Signed off','Overdue','Notes','Photos']];
    [...S.snags.values()].sort((a,b)=>a.ref_no-b.ref_no).forEach(s=>{const p=P(s.property_id);const c=S.contractors.get(s.contractor_id);rows.push([snagRef(s),p.address,p.postcode,projectName(p),s.title,s.location,c?c.name:'Own team',s.trade,s.priority,(SNAG[s.status]||SNAG.open)[0],fmtDate(s.raised_at),s.raised_by,fmtDue(s.due),fmtDate(s.fixed_at),s.status==='closed'?fmtDate(s.closed_at):'',isOverdue(s)?'Yes':'',s.notes,(s.photos||[]).length])})}
  else if(kind==='surveys'){name=`survey-answers-${d}.csv`;rows=[['Address','Postcode','Project','Survey','Status','Date','Surveyor','Section','Question','Answer','Flag']];
    [...S.surveys.values()].forEach(sv=>{const p=P(sv.property_id);surveySections(sv.type).forEach(sec=>sec.qs.forEach(([id,label,,,flag])=>{const a=sv.answers&&sv.answers[id];if(a==null)return;rows.push([p.address,p.postcode,projectName(p),WORKS[sv.type],sv.status,fmtDate(sv.updated_at),sv.by_name,sec.title,label,Array.isArray(a)?a.join('; '):a,flag&&(a===flag||(Array.isArray(a)&&a.includes(flag)))?'CHECK':''])}))})}
  else{name=`addresses-${d}.csv`;rows=[['UPRN / ref','Address','Postcode','Project','Work','Status','Open snags','Access notes']];
    sortedProps().forEach(p=>rows.push([p.ref,p.address,p.postcode,projectName(p),(p.works||[]).map(w=>WORKS[w]).join('; '),p.status,openSnagCount(p.id),p.notes]))}
  if(rows.length<2){toast('Nothing to download yet');return}
  const url=URL.createObjectURL(new Blob(['﻿'+csv(rows)],{type:'text/csv'}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function copyText(txt,btn){
  try{await navigator.clipboard.writeText(txt);toast('Copied')}catch(e){const ta=btn&&btn.parentElement&&btn.parentElement.querySelector('input,textarea');if(ta){ta.focus();ta.select()}toast('Press and hold the text to copy it')}
}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;
  const a=t.dataset.act;
  if(!$('#sheet').hidden&&S.sheetActs[a]){S.sheetActs[a](t);return}
  switch(a){
    case'tab':S.tab=t.dataset.tab;S.view=null;S.selecting=false;closeSheet();render();break;
    case'back':S.view=null;render();break;
    case'retry':load();break;
    case'close-sheet':closeSheet();break;
    case'add-addresses':addAddressesSheet();break;
    case'open-prop':S.view={name:'property',id:t.dataset.id};render();break;
    case'edit-prop':editPropSheet(S.props.get(S.view.id));break;
    case'set-status':api('updateProperty',{id:S.view.id,patch:{status:t.dataset.v}}).then(()=>load()).then(()=>toast('Status: '+t.dataset.v)).catch(err=>toast(err.message));break;
    case'new-survey':pickSurveyType(S.props.get(S.view.id));break;
    case'open-survey':{const sv=S.surveys.get(t.dataset.id);const p=sv&&S.props.get(sv.property_id);if(sv&&p){closeSheet();surveySheet(p,sv)}break}
    case'new-snag':newSnagSheet(t.dataset.pid||(S.view&&S.view.id));break;
    case'open-snag':{const s=S.snags.get(t.dataset.id);if(s)snagSheet(s);break}
    case'work':S.work=t.dataset.v;renderBody();break;
    case'scheme':S.scheme=t.dataset.v;renderBody();break;
    case'snag-f':S.snagF=t.dataset.v;renderBody();break;
    case'c-f':S.cF=t.dataset.v;renderBody();break;
    case'goto-ready':S.tab='snags';S.snagF='fixed';render();break;
    case'export':exportCsv(t.dataset.v);break;
    case'new-project':projectSheet(null);break;
    case'open-project':projectSheet(S.projects.get(t.dataset.id));break;
    case'add-pin':addPinSheet();break;
    case'new-pm':pmSheet(null);break;
    case'open-pm':pmSheet(S.pms.get(t.dataset.id));break;
    case'change-name':nameSheet();break;
    case'sign-out':if(t.dataset.armed!=='1'){t.dataset.armed='1';t.textContent='Tap again: you\'ll need the PIN to get back in';return}signOut();break;
    case'copy':copyText(t.dataset.v,t);break;
    case'sel-start':S.selecting=true;S.sel=new Set();renderBody();break;
    case'sel-cancel':S.selecting=false;S.sel.clear();renderBody();break;
    case'sel-all':filteredProps().forEach(p=>S.sel.add(p.id));renderBody();break;
    case'move-go':{const pid=$('#move-to').value;if(!S.sel.size){toast('Tick some addresses first');break}if(!pid){toast('Pick the project to move them to');break}
      t.disabled=true;api('moveProperties',{ids:[...S.sel],project_id:pid}).then(async r=>{S.selecting=false;S.sel.clear();await load();toast(`Moved ${r.moved} to ${S.projects.get(pid).name}`)}).catch(err=>{t.disabled=false;toast(err.message)});break}
    case'send-unsent':(async()=>{t.disabled=true;t.textContent='Sending…';let ok=0,n=0;for(const s of [...S.snags.values()].filter(s=>s.contractor_id&&s.status==='open'&&(s.email_status==='pending'||s.email_status==='failed'))){n++;try{const r=await api('resendEmail',{id:s.id});if(r.snag.email_status==='sent')ok++}catch(e){}}await load();toast(ok===n?`Sent ${ok} email${ok>1?'s':''}`:`Sent ${ok} of ${n}. Open the others to see why.`)})();break;
    case'view-photo':$('#lb-img').src=t.dataset.src;$('#lightbox').hidden=false;break;
    case'close-lb':$('#lightbox').hidden=true;$('#lb-img').removeAttribute('src');break;
    case'rm-photo':{const l=S.photos[t.dataset.key];if(l){l.splice(+t.dataset.i,1);refreshThumbs(t.dataset.key)}break}
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='addr-q'){S.q=e.target.value;renderBody()}
  if(e.target.id==='snag-q'){S.snagQ=e.target.value;renderBody()}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#lightbox').hidden)$('#lightbox').hidden=true;else if(!$('#sheet').hidden)closeSheet()}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.ready)load()});
setInterval(()=>{if(!document.hidden&&S.ready)load()},30000);

/* ---------- boot ---------- */
(function boot(){
  const c=new URLSearchParams(location.search).get('c');
  if(c){S.ctoken=c;S.mode='contractor';startApp();return}
  const sv=saved();S.name=sv.name||'';S.token=sv.token||'';
  if(S.token)startApp();else showGate();
})();
