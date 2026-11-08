/* Progressive enhancements for the existing authenticated API-backed portal. */
let overviewSummary = null;
function renderOverview(summary) {
  overviewSummary = summary;
  const box=document.getElementById('overview-tickets');
  box.innerHTML=currentTickets.slice(0,5).map(t=>'<div class="activity-row"><div><strong>'+escapeHtml(t.ticketNumber)+'</strong><p style="margin-top:5px">'+escapeHtml(t.title)+'</p></div><span class="badge badge-status">'+escapeHtml(t.status.replaceAll('_',' '))+'</span></div>').join('')||'<div class="empty-state">A clear queue. Create a support request whenever you need help.</div>';
  const groups=Object.entries(summary.byStatus||{});
  document.getElementById('overview-distribution').innerHTML=groups.map(([status,count])=>'<div><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:9px"><span>'+escapeHtml(status.replaceAll('_',' '))+'</span><strong>'+count+'</strong></div><meter style="width:100%;height:12px;accent-color:var(--violet)" min="0" max="'+Math.max(1,summary.totalAccessibleTickets)+'" value="'+count+'" aria-label="'+escapeHtml(status)+'">'+count+'</meter></div>').join('')||'<p class="empty-state">No authorized tickets yet.</p>';
}
function setupWorkspace(){
  document.getElementById('assistant-category').innerHTML=catalogCategories.map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
  const grid=document.getElementById('catalog-grid');
  grid.innerHTML=catalogCategories.map((c,i)=>'<article class="catalog-item"><div class="eyebrow">'+String(i+1).padStart(2,'0')+' / SERVICE</div><h3 style="margin-top:22px">'+escapeHtml(c.name)+'</h3><p>'+escapeHtml(c.description||'Submit a request for authorized IT assistance.')+'</p><p><span class="badge '+(c.aiEligible?'badge-status':'badge-it')+'">'+(c.aiEligible?'Knowledge-assisted triage':'IT / approval review')+'</span></p><button class="btn-secondary" data-service="'+escapeHtml(c.id)+'">Start a request ↗</button></article>').join('');
  grid.querySelectorAll('[data-service]').forEach(b=>b.onclick=()=>{document.getElementById('ticket-category').value=b.dataset.service;switchTab('create');document.getElementById('ticket-title').focus();});
}
function onWorkspaceTab(name){
  const titles={dashboard:'Overview',tickets:'Tickets & queue',create:'New support request',assistant:'AI Assistant',catalog:'Service catalog',assets:'Equipment & custody',kb:'Knowledge base',notifications:'Notifications',approvals:'Approval center',cto:'CTO escalations',audit:'Audit & monitoring'};
  document.getElementById('workspace-breadcrumb').textContent='Workspace / '+(titles[name]||name);
  if(name==='notifications')loadNotifications();
}
async function loadNotifications(){
  const box=document.getElementById('notifications-list');box.innerHTML='<p class="loading-note">Loading your updates…</p>';
  try{const data=await apiFetch('/api/notifications');box.innerHTML=data.items.map(n=>'<article class="activity-row"><div><strong>'+escapeHtml(n.subject)+'</strong><p style="white-space:pre-wrap;font-size:12px;margin:10px 0">'+escapeHtml(n.body)+'</p><small>'+escapeHtml(new Date(n.createdAt).toLocaleString())+'</small></div><span class="badge badge-status">'+escapeHtml(n.status)+'</span></article>').join('')||'<div class="empty-state">You’re all caught up. New request updates will appear here.</div>';}catch(error){box.innerHTML='<div class="alert-error">'+escapeHtml(error.message)+' Use Refresh updates to retry.</div>';}
}
function renderTicketExtras(detail){
  const box=document.getElementById('ticket-detail-container');
  const extras=document.createElement('section');extras.style.marginTop='25px';
  const admin=['IT_ADMIN','CTO'].includes(currentUser.roleName);
  extras.innerHTML='<h3 style="font-size:16px;margin-bottom:15px">Conversation</h3><div>'+(detail.comments||[]).map(c=>'<div class="bubble" style="background:var(--paper);font-size:12px"><strong>'+escapeHtml(c.authorName)+(c.isInternal?' · INTERNAL NOTE':'')+'</strong><p style="white-space:pre-wrap">'+escapeHtml(c.body)+'</p><small class="muted">'+escapeHtml(new Date(c.createdAt).toLocaleString())+'</small></div>').join('')+'</div><form id="ticket-comment-form"><label for="ticket-comment">Add a comment</label><textarea id="ticket-comment" minlength="2" maxlength="2000" required placeholder="Share an update or ask a question…"></textarea>'+(admin?'<label style="display:flex;gap:10px;align-items:center;margin:12px 0"><input id="comment-internal" type="checkbox" style="width:18px;min-height:18px">Internal note · IT and CTO only</label>':'')+'<button class="btn-secondary" type="submit" style="margin-top:12px">Send update ↗</button></form>'+(detail.approvals?.length?'<h3 style="font-size:16px;margin:25px 0 15px">Approval history</h3>'+detail.approvals.map(a=>'<p style="font-size:12px;margin:10px 0">'+escapeHtml(a.actionType)+' · <strong>'+escapeHtml(a.status)+'</strong></p>').join(''):'');
  box.append(extras);
  extras.querySelector('form').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{await apiFetch('/api/tickets/'+encodeURIComponent(detail.ticket.id)+'/comments',{method:'POST',body:JSON.stringify({body:extras.querySelector('textarea').value,isInternal:extras.querySelector('#comment-internal')?.checked||false})});showFeedback('Your update was recorded.');await inspectTicket(detail.ticket.id);}catch(error){showFeedback(error.message,'error');}finally{button.disabled=false;}};
}
document.getElementById('app-menu').onclick=()=>{const open=document.body.classList.toggle('nav-open');document.getElementById('app-menu').setAttribute('aria-expanded',String(open));};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('nav-open')){document.body.classList.remove('nav-open');document.getElementById('app-menu').setAttribute('aria-expanded','false');document.getElementById('app-menu').focus();syncNavigation();}});
document.getElementById('quick-create').onclick=()=>switchTab('create');
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>switchTab(b.dataset.go));
document.getElementById('refresh-notifications').onclick=loadNotifications;
document.getElementById('previous-page').onclick=()=>{if(ticketPage>1){ticketPage--;refreshAllData().catch(e=>showFeedback(e.message,'error'));}};
document.getElementById('next-page').onclick=()=>{if(ticketPage<ticketPages){ticketPage++;refreshAllData().catch(e=>showFeedback(e.message,'error'));}};
document.getElementById('previous-page').setAttribute('aria-label','Previous ticket page');document.getElementById('next-page').setAttribute('aria-label','Next ticket page');
document.getElementById('assistant-form').onsubmit=async e=>{
  e.preventDefault();const input=document.getElementById('assistant-input'),button=e.target.querySelector('button'),messages=document.getElementById('assistant-messages');button.disabled=true;button.textContent='Creating request…';
  const user=document.createElement('div');user.className='bubble user';user.innerHTML='<strong>YOU</strong><p>'+escapeHtml(input.value)+'</p>';messages.append(user);
  try{const result=await apiFetch('/api/tickets',{method:'POST',body:JSON.stringify({serviceCategoryId:document.getElementById('assistant-category').value,title:input.value.trim().slice(0,100),description:input.value.trim(),severity:'LOW'})});const t=result.ticket;const answer=document.createElement('div');answer.className='bubble';answer.innerHTML='<strong>AIIT · MOCK AI RECOMMENDATION</strong><p>'+escapeHtml(t.aiSuggestedFix||t.escalationReason||'Your request has been recorded and routed to IT for review.')+'</p>';messages.append(answer);input.value='';selectedTicketId=t.id;document.getElementById('assistant-context').innerHTML='<p style="font-size:12px;margin-bottom:12px">'+escapeHtml(t.ticketNumber)+'</p><span class="badge badge-status">'+escapeHtml(t.status)+'</span><button class="btn-secondary" id="assistant-view-ticket" style="margin-top:20px">View request ↗</button>';document.getElementById('assistant-view-ticket').onclick=()=>{switchTab('tickets');inspectTicket(t.id).catch(e=>showFeedback(e.message,'error'));};await refreshAllData().catch(error=>showFeedback('Request saved. '+error.message,'error'));messages.scrollTop=messages.scrollHeight;}catch(error){const answer=document.createElement('div');answer.className='alert-error';answer.textContent=error.message+' Your text is preserved; try again.';messages.append(answer);}finally{button.disabled=false;button.textContent='Create request & ask ↗';}
};
const mobileNavigation=matchMedia('(max-width: 767px)');
function syncNavigation(){const isMobile=mobileNavigation.matches;const open=isMobile?document.body.classList.contains('nav-open'):!document.body.classList.contains('nav-collapsed');document.getElementById('workspace-navigation').inert=!open;document.getElementById('app-menu').setAttribute('aria-expanded',String(open));}
document.getElementById('app-menu').onclick=()=>{if(mobileNavigation.matches)document.body.classList.toggle('nav-open');else document.body.classList.toggle('nav-collapsed');syncNavigation();};
mobileNavigation.addEventListener('change',syncNavigation);syncNavigation();
const originalOnWorkspaceTab=onWorkspaceTab;
onWorkspaceTab=name=>{originalOnWorkspaceTab(name);syncNavigation();};
document.getElementById('kb-search').oninput=()=>loadKbTab().catch(error=>showFeedback(error.message,'error'));
function resetPrivateViews(){
  currentTickets=[];selectedTicketId=null;ticketPage=1;overviewSummary=null;
  for(const id of ['global-feedback','ticket-list-container','ticket-detail-container','overview-tickets','overview-distribution','metrics-container','notifications-list','assets-container','kb-container','approvals-container','cto-escalation-container','audit-logs-container','connector-health-box','assistant-context'])document.getElementById(id).replaceChildren();
  document.getElementById('assistant-messages').innerHTML='<div class="bubble"><strong>AIIT · MOCK AI</strong><p>Describe your issue to create a support request and get knowledge-assisted recommendations.</p></div>';
  document.getElementById('assistant-input').value='';document.getElementById('approval-reason').value='';document.getElementById('ticket-title').value='';document.getElementById('ticket-description').value='';
  document.getElementById('app-menu').setAttribute('aria-expanded','false');
  syncNavigation();
}
