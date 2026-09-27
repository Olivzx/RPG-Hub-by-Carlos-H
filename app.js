const sb = window.rpgSupabase;
const $ = id => document.getElementById(id);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const floorsLabel = n => n === 0 ? 'Térreo' : n > 0 ? `${n}º andar` : `Subsolo ${Math.abs(n)}`;
const fmtDate = value => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : 'Sem data';
const uid = () => crypto.randomUUID();
const colors = ['#9487ff','#6ee7b7','#e8c986','#7dd3fc','#f3a8ca','#fb7185','#f59e0b','#22c55e'];

const state = {
  user:null, profile:null, campaigns:[], campaign:null, role:'player', members:[], profiles:new Map(),
  locations:[], floors:[], rooms:[], characters:[], npcs:[], entities:[], sessions:[], rolls:[],
  location:null, floor:null, selected:null, view:'table', tool:'move', zoom:100, audioChannel:null, audio:null,
  audioEnabled:false, presenceChannel:null, online:1, isLoading:true
};

function isMaster(){ return state.profile?.account_type === 'master'; }
function isCampaignMaster(){ return !!state.campaign && state.campaign.owner_id === state.user?.id; }
function canEdit(){ return isCampaignMaster(); }
function canCreateCampaign(){ return isMaster(); }
function toast(msg,type='ok'){ const el=$('toast'); el.textContent=(type==='error'?'! ':'✓ ')+msg; el.className=`toast show ${type}`; clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.className='toast',2300); }
function setSave(text='Salvo no Supabase',ok=true){ $('saveState').textContent=text; $('saveState').closest('.persistStatus').classList.toggle('bad',!ok); }
function showModal(inner,wide=false){$('modalCard').className=wide?'modalCard wide':'modalCard';$('modalCard').innerHTML=inner;$('modalBackdrop').classList.add('open');$('modalBackdrop').setAttribute('aria-hidden','false');}
function closeModal(){ $('modalBackdrop').classList.remove('open'); $('modalBackdrop').setAttribute('aria-hidden','true'); $('modalCard').innerHTML=''; }
function requireMaster(){ if(!canEdit()){toast('Apenas o mestre da campanha pode alterar isso.','error');return false;}return true; }
function currentLocation(){ return state.location || state.locations[0] || null; }
function currentFloor(){ return state.floors.find(f=>f.id===state.floor) || state.floors[0] || null; }
function currentSession(){ return state.sessions.find(s=>s.id===state.selectedSessionId) || state.sessions.find(s=>s.status==='live') || state.sessions.find(s=>s.status==='planned') || null; }
function profileFor(id){ return state.profiles.get(id) || (id===state.user?.id?state.profile:null); }

async function boot(){
  try{
    const {data,error}=await sb.auth.getSession(); if(error) throw error;
    if(!data.session){location.href='login.html';return;}
    state.user=data.session.user;
    await ensureProfile();
    await loadCampaigns();
    if(!state.campaign){ if(canCreateCampaign()) openCampaignCreate(true); else openNoCampaignState(); }
    else { await loadCampaignData(); }
    attachAuthListener();
  }catch(err){console.error(err);toast(err.message||'Falha ao carregar a mesa.','error');setSave('Falha de conexão',false);} finally {state.isLoading=false;}
}

function attachAuthListener(){ sb.auth.onAuthStateChange((event,session)=>{ if(event==='SIGNED_OUT'){location.href='login.html';} else if(session?.user && !state.user){state.user=session.user;} }); }

async function ensureProfile(){
  const {data,error}=await sb.from('profiles').select('*').eq('id',state.user.id).maybeSingle(); if(error) throw error;
  if(data){state.profile=data;return;}
  const display=state.user.user_metadata?.display_name || state.user.email?.split('@')[0] || 'Aventureiro';
  const {data:created,error:insertError}=await sb.from('profiles').insert({id:state.user.id,display_name:display,account_type:state.user.user_metadata?.account_type==='master'?'master':'player'}).select('*').single();
  if(insertError) throw insertError; state.profile=created;
}

async function loadCampaigns(){
  const {data,error}=await sb.from('campaigns').select('*').order('created_at',{ascending:true}); if(error) throw error;
  state.campaigns=data||[]; $('campaignSelect').innerHTML=state.campaigns.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if(state.campaign && !state.campaigns.some(c=>c.id===state.campaign.id)) state.campaign=null;
  if(!state.campaign && state.campaigns[0]) state.campaign=state.campaigns[0];
  if(state.campaign) $('campaignSelect').value=state.campaign.id;
}

async function loadCampaignData(){
  if(!state.campaign)return;
  const campaignId=state.campaign.id;
  const [{data:members,error:me},{data:locations,error:le},{data:characters,error:ce},{data:npcs,error:ne},{data:entities,error:ee},{data:sessions,error:se},{data:rolls,error:re}]=await Promise.all([
    sb.from('campaign_members').select('*').eq('campaign_id',campaignId),
    sb.from('locations').select('*').eq('campaign_id',campaignId).order('sort_order'),
    sb.from('characters').select('*').eq('campaign_id',campaignId).order('name'),
    sb.from('npcs').select('*').eq('campaign_id',campaignId).order('name'),
    sb.from('world_entities').select('*').eq('campaign_id',campaignId).order('created_at'),
    sb.from('sessions').select('*').eq('campaign_id',campaignId).order('session_number',{ascending:false}),
    sb.from('dice_rolls').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:false}).limit(30)
  ]);
  if(me||le||ce||ne||ee||se||re) throw (me||le||ce||ne||ee||se||re);
  state.members=members||[]; state.locations=locations||[]; state.characters=characters||[]; state.npcs=npcs||[]; state.entities=entities||[]; state.sessions=sessions||[]; state.rolls=rolls||[];
  const mine=state.members.find(m=>m.user_id===state.user.id); state.role=state.campaign.owner_id===state.user.id?'owner':(mine?.role||'player');
  state.profiles=new Map();
  const ids=[...new Set(state.members.map(m=>m.user_id).filter(Boolean))];
  if(ids.length){ const {data:profiles}=await sb.from('profiles').select('id,display_name,avatar_url').in('id',ids); (profiles||[]).forEach(p=>state.profiles.set(p.id,p)); }
  if(!state.locations.length && canEdit()) await initializeWorld();
  else { await loadFloors(); }
  ensureFloor();
  state.selectedSessionId=currentSession()?.id||null;
  renderAll(); await subscribeRealtime();
}

async function initializeWorld(){
  const {data:location,error:le}=await sb.from('locations').insert({campaign_id:state.campaign.id,name:'Mundo de '+state.campaign.name,description:'Local principal da campanha',created_by:state.user.id}).select().single(); if(le) throw le;
  state.location=location; state.locations=[location];
  const floorDefs=[{name:'2º andar',floor_number:2,sort_order:0},{name:'1º andar',floor_number:1,sort_order:1},{name:'Térreo',floor_number:0,sort_order:2},{name:'Subsolo',floor_number:-1,sort_order:3}];
  const {data:floors,error:fe}=await sb.from('floors').insert(floorDefs.map(f=>({...f,location_id:location.id}))).select(); if(fe) throw fe; state.floors=floors||[];
  const mapByNumber=new Map(state.floors.map(f=>[f.floor_number,f.id]));
  const starter=[
    ['Sala do Trono',2,55,48,38,32],['Corredor Norte',2,7,18,36,22],['Escritório',2,7,49,36,30],
    ['Grande Hall',1,12,19,76,58],['Cozinha',0,6,18,27,28],['Salão da Taverna',0,38,15,55,62]
  ];
  const {data:rooms,error:re}=await sb.from('rooms').insert(starter.map(([name,fl,x,y,w,h],i)=>({floor_id:mapByNumber.get(fl),name,description:'',x,y,width:w,height:h,sort_order:i}))).select(); if(re) throw re;
  state.rooms=rooms||[]; state.floor=mapByNumber.get(2); state.location=location; setSave('Mundo inicial criado');
}

async function loadFloors(){
  const ids=state.locations.map(l=>l.id); if(!ids.length)return;
  const {data,error}=await sb.from('floors').select('*').in('location_id',ids).order('sort_order'); if(error) throw error; state.floors=data||[];
  if(state.floors.length){const floorIds=state.floors.map(f=>f.id); const {data:rooms,error:re}=await sb.from('rooms').select('*').in('floor_id',floorIds).order('sort_order'); if(re) throw re; state.rooms=rooms||[];}
  state.location=state.locations[0]||null;
}
function ensureFloor(){ if(!state.floor || !state.floors.some(f=>f.id===state.floor)) state.floor=state.floors[0]?.id||null; }

async function subscribeRealtime(){
  if(state.audioChannel) await sb.removeChannel(state.audioChannel).catch(()=>{});
  if(state.presenceChannel) await sb.removeChannel(state.presenceChannel).catch(()=>{});
  const sid=currentSession()?.id || state.campaign.id;
  const channel=sb.channel(`rpg-hub-session-${sid}`);
  channel.on('broadcast',{event:'dice_roll'},({payload})=>{ if(payload?.user_id!==state.user.id) receiveRoll(payload); });
  channel.on('broadcast',{event:'audio'},({payload})=>{ if(payload?.user_id!==state.user.id) receiveAudio(payload); });
  channel.subscribe(); state.audioChannel=channel;
  const presence=sb.channel(`rpg-hub-presence-${state.campaign.id}`,{config:{presence:{key:state.user.id}}});
  presence.on('presence',{event:'sync'},()=>{state.online=Object.keys(presence.presenceState()).length; $('onlineCount').textContent=`${Math.max(1,state.online)} online`;});
  presence.subscribe(async status=>{if(status==='SUBSCRIBED')await presence.track({user_id:state.user.id,display_name:state.profile?.display_name||'Aventureiro'});});
  state.presenceChannel=presence;
}
function receiveRoll(payload){ state.rolls=[payload,...state.rolls].slice(0,30); renderDiceResult(payload); if(state.view!=='dice') $('rollResult').classList.add('rollPulse'); setTimeout(()=>$('rollResult')?.classList.remove('rollPulse'),280); }

function renderAll(){renderShell();renderTable();renderCharacters();renderWorld();renderSessions();renderNpcs();renderDice();renderView();}
function renderShell(){
  $('campaignRole').textContent=isMaster()?'Conta mestre · '+(isCampaignMaster()?'Mestre da campanha':state.role==='co_master'?'Co-mestre':'membro'):'Conta jogador · '+(state.role==='player'?'Jogador':state.role); $('masterBadge').classList.toggle('hidden',!isCampaignMaster()); const accountTypeLabel=$('accountTypeLabel'); if(accountTypeLabel)accountTypeLabel.textContent=isMaster()?'Mestre':'Jogador';
  $('workspaceTitle').textContent=state.campaign?.name||'RPG HUB'; $('workspaceSubtitle').textContent=state.campaign?.description||'Campanha persistente'; $('boardLocationName').textContent=currentLocation()?.name||'Sem local'; $('userName').textContent=state.profile?.display_name||state.user?.email?.split('@')[0]||'Aventureiro';
  $('userAvatar').innerHTML=state.profile?.avatar_url?`<img src="${escapeHtml(state.profile.avatar_url)}" alt="">`:'?';
  $('newRoomBtn').disabled=!canEdit(); $('newFloorBtn').disabled=!canEdit(); $('newSessionBtn').disabled=!canEdit(); $('newNpcBtn').disabled=!canEdit(); $('newCharacterBtn').disabled=false;
  const active=currentSession(); $('activeSessionLabel').textContent=active?`Sessão #${active.session_number} · ${active.status.toUpperCase()}`:'Nenhuma sessão ativa'; $('activeSessionTitle').textContent=active?.title||'Crie uma sessão para começar';
  const list=state.campaigns.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');$('campaignSelect').innerHTML=list; if(state.campaign)$('campaignSelect').value=state.campaign.id;
}
function renderView(){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $(`view${state.view.charAt(0).toUpperCase()+state.view.slice(1)}`)?.classList.add('active'); document.querySelectorAll('#sideNav button').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view)); }

function renderTable(){
  const f=currentFloor(); $('contextFloor').textContent=f?.name||'Sem andar'; $('boardFloorName').textContent=f?.name?.toUpperCase()||'—'; ensureFloor();
  $('floorSwitch').innerHTML=state.floors.map(x=>`<button class="${x.id===state.floor?'chosen':''}" data-floor="${x.id}">${escapeHtml(x.name)}</button>`).join('') || '<span class="muted">Nenhum andar</span>';
  document.querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>{state.floor=b.dataset.floor;state.selected=null;renderTable();});
  const rooms=state.rooms.filter(r=>r.floor_id===state.floor); const entities=state.entities.filter(e=>e.floor_id===state.floor && e.visible!==false);
  $('roomLayer').innerHTML=rooms.map(r=>`<div class="room ${state.selected?.type==='room'&&state.selected.id===r.id?'roomSelected':''}" data-room-id="${r.id}" style="left:${r.x}%;top:${r.y}%;width:${r.width}%;height:${r.height}%"><span>${escapeHtml(r.name)}</span><div class="roomResize" title="Redimensionar"></div></div>`).join('');
  $('roomList').innerHTML=rooms.map(r=>`<button class="roomItem ${state.selected?.type==='room'&&state.selected.id===r.id?'roomChosen':''}" data-room-list="${r.id}"><span class="roomIcon">▧</span><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description||'Sem descrição')}</small></div><span>›</span></button>`).join('') || '<div class="emptySelect">Nenhum cômodo neste andar.</div>';
  $('entityCount').textContent=entities.length;
  $('tokenLayer').innerHTML=entities.map(e=>`<div class="tokenBig ${state.selected?.type==='entity'&&state.selected.id===e.id?'selected':''}" data-entity-id="${e.id}" style="left:${e.x}%;top:${e.y}%;--token-color:${escapeHtml(e.color||'#9487ff')}"><div>${escapeHtml(e.icon||'◆')}</div><span>${escapeHtml(e.display_name)}</span></div>`).join('');
  $('entityList').innerHTML=entities.map(e=>`<button class="entityItem ${state.selected?.type==='entity'&&state.selected.id===e.id?'entityChosen':''}" data-entity-list="${e.id}"><span class="entityAvatar">${escapeHtml(e.icon||'◆')}</span><div><b>${escapeHtml(e.display_name)}</b><small>${escapeHtml(e.entity_kind)}</small></div><span>›</span></button>`).join('') || '<div class="emptySelect">Nenhuma entidade neste andar.</div>';
  $('selectedCard').innerHTML=renderSelection(); bindTableInteractions(); applyZoom();
}
function renderSelection(){
  if(!state.selected)return '<div class="emptySelect">Selecione uma entidade ou cômodo.</div>';
  if(state.selected.type==='room'){const r=state.rooms.find(x=>x.id===state.selected.id);if(!r)return '';return `<div class="eyebrow">CÔMODO</div><div class="selectedRow"><div class="selectedEmoji">▧</div><div><h3>${escapeHtml(r.name)}</h3><p>${escapeHtml(r.description||'Sem descrição')}</p></div></div><div class="selectionActions"><button data-edit-room="${r.id}">Editar</button>${canEdit()?`<button class="dangerGhost" data-delete-room="${r.id}">Excluir</button>`:''}</div>`;}
  const e=state.entities.find(x=>x.id===state.selected.id);if(!e)return ''; const character=e.character_id?state.characters.find(x=>x.id===e.character_id):null; const npc=e.npc_id?state.npcs.find(x=>x.id===e.npc_id):null; const source=character||npc; return `<div class="eyebrow">ENTIDADE</div><div class="selectedRow"><div class="selectedEmoji">${escapeHtml(e.icon||'◆')}</div><div><h3>${escapeHtml(e.display_name)}</h3><p>${escapeHtml(e.entity_kind)} · posição salva</p></div></div><div class="statGrid"><div><span>HP</span><b>${character?.hp_current!=null?`${character.hp_current}/${character.hp_max??'—'}`:'—'}</b></div><div><span>ORIGEM</span><b>${source?escapeHtml(source.name):'—'}</b></div></div><div class="selectionActions"><button data-edit-entity="${e.id}">Detalhes</button></div>`;
}
function bindTableInteractions(){
  document.querySelectorAll('[data-room-list]').forEach(b=>b.onclick=()=>{state.selected={type:'room',id:b.dataset.roomList};renderTable();});
  document.querySelectorAll('[data-entity-list]').forEach(b=>b.onclick=()=>{state.selected={type:'entity',id:b.dataset.entityList};renderTable();});
  document.querySelectorAll('[data-edit-room]').forEach(b=>b.onclick=()=>openRoomModal(b.dataset.editRoom));
  document.querySelectorAll('[data-delete-room]').forEach(b=>b.onclick=()=>deleteRoom(b.dataset.deleteRoom));
  document.querySelectorAll('[data-edit-entity]').forEach(b=>b.onclick=()=>openEntityModal(b.dataset.editEntity));
  document.querySelectorAll('.tokenBig').forEach(el=>{el.onpointerdown=e=>startEntityDrag(e,el);el.onclick=e=>{e.stopPropagation();state.selected={type:'entity',id:el.dataset.entityId};renderTable();};});
  document.querySelectorAll('.room').forEach(el=>{el.onclick=e=>{if(e.target.closest('.roomResize'))return;state.selected={type:'room',id:el.dataset.roomId};renderTable();};el.onpointerdown=e=>startRoomDrag(e,el);});
  document.querySelectorAll('.roomResize').forEach(el=>el.onpointerdown=e=>startRoomResize(e,el.parentElement));
}
function startEntityDrag(e,el){if(state.tool!=='move')return;e.preventDefault();const id=el.dataset.entityId, board=$('board'), rect=board.getBoundingClientRect();el.classList.add('dragging');const move=ev=>{const x=Math.max(3,Math.min(97,((ev.clientX-rect.left)/rect.width)*100));const y=Math.max(7,Math.min(93,((ev.clientY-rect.top)/rect.height)*100));el.style.left=x+'%';el.style.top=y+'%';el.dataset.x=x;el.dataset.y=y;};const up=async()=>{document.removeEventListener('pointermove',move);el.classList.remove('dragging');const x=Number(el.dataset.x),y=Number(el.dataset.y);if(Number.isFinite(x)&&Number.isFinite(y)){const {data,error}=await sb.from('world_entities').update({x,y}).eq('id',id).select().single();if(error){toast(error.message,'error');return;}state.entities=state.entities.map(e=>e.id===id?data:e);setSave('Posição da entidade salva');}};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});}
function startRoomDrag(e,el){if(!canEdit()||state.tool!=='move'||e.target.closest('.roomResize'))return;e.preventDefault();e.stopPropagation();const r=state.rooms.find(x=>x.id===el.dataset.roomId),board=$('board'),rect=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ox=Number(r.x),oy=Number(r.y);const move=ev=>{const x=Math.max(2,Math.min(98-Number(r.width),ox+((ev.clientX-sx)/rect.width)*100));const y=Math.max(5,Math.min(95-Number(r.height),oy+((ev.clientY-sy)/rect.height)*100));el.style.left=x+'%';el.style.top=y+'%';el.dataset.x=x;el.dataset.y=y;};const up=async()=>{document.removeEventListener('pointermove',move);const x=Number(el.dataset.x),y=Number(el.dataset.y);if(Number.isFinite(x)&&Number.isFinite(y)){const {data,error}=await sb.from('rooms').update({x,y}).eq('id',r.id).select().single();if(error){toast(error.message,'error');return;}state.rooms=state.rooms.map(q=>q.id===r.id?data:q);setSave('Cômodo reposicionado');}};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});}
function startRoomResize(e,el){if(!canEdit()||state.tool!=='move')return;e.preventDefault();e.stopPropagation();const r=state.rooms.find(x=>x.id===el.dataset.roomId),board=$('board'),rect=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ow=Number(r.width),oh=Number(r.height);const move=ev=>{const w=Math.max(10,Math.min(85,ow+((ev.clientX-sx)/rect.width)*100)),h=Math.max(8,Math.min(75,oh+((ev.clientY-sy)/rect.height)*100));el.style.width=w+'%';el.style.height=h+'%';el.dataset.w=w;el.dataset.h=h;};const up=async()=>{document.removeEventListener('pointermove',move);const width=Number(el.dataset.w),height=Number(el.dataset.h);if(Number.isFinite(width)&&Number.isFinite(height)){const {data,error}=await sb.from('rooms').update({width,height}).eq('id',r.id).select().single();if(error){toast(error.message,'error');return;}state.rooms=state.rooms.map(q=>q.id===r.id?data:q);setSave('Área do cômodo salva');}};document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});}
function applyZoom(){ $('board').style.setProperty('--board-zoom',String(state.zoom/100));$('zoomValue').textContent=state.zoom+'%'; }

function renderCharacters(){
  const grid=$('charactersGrid'); if(!state.characters.length){grid.innerHTML='<div class="emptyPanel">Ainda não existem personagens nesta campanha.<br><span>O primeiro personagem pode ser criado agora.</span></div>';return;}
  grid.innerHTML=state.characters.map(c=>{const p=profileFor(c.player_id);const avatar=c.avatar_url||p?.avatar_url;return `<article class="dataCard"><div class="cardAvatar">${avatar?`<img src="${escapeHtml(avatar)}" alt="">`:'♙'}</div><div class="dataCardMain"><div class="cardKicker">NÍVEL ${c.level??0}</div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.ancestry_name||'—')} · ${escapeHtml(c.class_name||'Classe não definida')}</p><div class="miniStats"><span>HP <b>${c.hp_current??'—'}/${c.hp_max??'—'}</b></span><span>CA <b>${c.armor_class??'—'}</b></span><span>SORTE <b>${c.luck??0}</b></span></div><small class="playerLine">Jogador: ${escapeHtml(p?.display_name || (c.player_id===state.user.id?'Você':'ID '+String(c.player_id||'—').slice(0,8)))}</small></div><div class="cardActions"><button data-edit-character="${c.id}">Abrir ficha</button>${canEdit()?`<button class="softButton" data-add-char="${c.id}">${state.entities.some(e=>e.character_id===c.id)?'Na mesa':'Colocar na mesa'}</button>`:''}</div></article>`;}).join('');
  document.querySelectorAll('[data-edit-character]').forEach(b=>b.onclick=()=>openCharacterModal(b.dataset.editCharacter)); document.querySelectorAll('[data-add-char]').forEach(b=>b.onclick=()=>addCharacterToBoard(b.dataset.addChar));
}

function renderWorld(){
  const f=state.floors; $('worldStats').innerHTML=`<div class="statsHead"><div><span>LOCais</span><b>${state.locations.length}</b></div><div><span>ANDARES</span><b>${f.length}</b></div><div><span>CÔMODOS</span><b>${state.rooms.length}</b></div><div><span>ENTIDADES</span><b>${state.entities.length}</b></div></div>`;
  $('worldLocations').innerHTML=state.locations.map(l=>`<article class="locationCard"><div><div class="eyebrow">LOCAL</div><h3>${escapeHtml(l.name)}</h3><p>${escapeHtml(l.description||'Sem descrição')}</p></div><button class="softButton" data-edit-location="${l.id}" ${canEdit()?'':'disabled'}>Editar</button><div class="floorStack">${f.filter(x=>x.location_id===l.id).map(x=>`<button class="floorCard" data-world-floor="${x.id}"><span>${escapeHtml(x.name)}</span><small>${state.rooms.filter(r=>r.floor_id===x.id).length} cômodo(s)</small><b>→</b></button>`).join('')||'<div class="emptySelect">Nenhum andar.</div>'}</div></article>`).join('') || '<div class="emptyPanel">Crie um local para começar.</div>';
  document.querySelectorAll('[data-edit-location]').forEach(b=>b.onclick=()=>openLocationModal(b.dataset.editLocation));document.querySelectorAll('[data-world-floor]').forEach(b=>b.onclick=()=>{state.floor=b.dataset.worldFloor;state.view='table';renderAll();});
}
function renderSessions(){
  $('sessionsList').innerHTML=state.sessions.map(s=>`<article class="sessionCard"><div><div class="sessionNumber">SESSÃO #${s.session_number}</div><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.summary||'Sem resumo')}</p><small>${fmtDate(s.starts_at)}</small></div><div class="sessionStatus"><span class="status ${s.status}">${s.status}</span><div class="sessionCardActions"><button data-session-open="${s.id}">Abrir</button>${canEdit()?`<button class="softButton" data-session-edit="${s.id}">Editar</button>`:''}</div></div></article>`).join('') || '<div class="emptyPanel">Nenhuma sessão cadastrada.</div>';
  document.querySelectorAll('[data-session-open]').forEach(b=>b.onclick=async()=>{await activateSession(b.dataset.sessionOpen);});document.querySelectorAll('[data-session-edit]').forEach(b=>b.onclick=()=>openSessionModal(b.dataset.sessionEdit));
}
function renderNpcs(){
  $('npcsGrid').innerHTML=state.npcs.map(n=>`<article class="dataCard"><div class="cardAvatar npc">${n.avatar_url?`<img src="${escapeHtml(n.avatar_url)}" alt="">`:'♜'}</div><div class="dataCardMain"><div class="cardKicker">NPC / MONSTRO</div><h3>${escapeHtml(n.name)}</h3><p>${escapeHtml(n.description||'Sem descrição')}</p><small class="privateNote">Anotação do mestre: ${escapeHtml(n.notes_private||'—')}</small></div><div class="cardActions"><button data-edit-npc="${n.id}">Editar</button>${canEdit()?`<button class="softButton" data-add-npc="${n.id}">${state.entities.some(e=>e.npc_id===n.id)?'Na mesa':'Colocar na mesa'}</button>`:''}</div></article>`).join('') || '<div class="emptyPanel">Nenhum NPC ou monstro cadastrado.</div>';
  document.querySelectorAll('[data-edit-npc]').forEach(b=>b.onclick=()=>openNpcModal(b.dataset.editNpc));document.querySelectorAll('[data-add-npc]').forEach(b=>b.onclick=()=>addNpcToBoard(b.dataset.addNpc));
}
function renderDice(){
  const recent=state.rolls.slice(0,12); $('rollHistory').innerHTML=recent.map(r=>`<article class="rollLog"><div><b>${escapeHtml(r.notation)}</b><small>${fmtDate(r.created_at)}</small></div><strong>${r.final_result}</strong></article>`).join('') || '<div class="emptyPanel">Nenhuma rolagem ainda.</div>';
  const active=currentSession(); $('sessionAudioCard').innerHTML=audioPanel(active);
  setTimeout(wireAudioControls,0);
}
function renderDiceResult(payload){
  if(!payload)return;
  const results=(payload.base_results||[]).map((n,i)=>`<span class="dieResultChip"><small>dado ${i+1}</small><b>${n}</b></span>`).join("");
  $("bigRoll").textContent=payload.final_result;
  $("rollBreakdown").innerHTML=`<div class="rollBreakdownHead"><b>${escapeHtml(payload.notation)}</b><span>${escapeHtml(payload.rule_results?.label||"Normal")}</span></div><div class="dieResults">${results||'<span class="muted">Sem resultados individuais.</span>'}</div><div class="rollSummary">Total <strong>${payload.final_result}</strong>${Number(payload.rule_results?.modifier||0)?`<small>modificador ${payload.rule_results.modifier>0?"+":""}${payload.rule_results.modifier}</small>`:""}</div>`;
  $("rollResult").innerHTML=`<span>${escapeHtml(payload.notation)}</span><b>${payload.final_result}</b>`;
}
function audioPanel(){ if(!canEdit()){return `<div class="audioCard"><div class="eyebrow">SOM DA SESSÃO</div><h3>Áudio sincronizado pelo mestre</h3><p>Ative o áudio para receber músicas e efeitos durante a sessão.</p><button id="enableAudioBtn" class="primarySmall">${state.audioEnabled?'Áudio ativo':'Ativar áudio'}</button></div>`; } return `<div class="audioCard"><div class="eyebrow">PAINEL DO MESTRE</div><h3>Música & efeitos</h3><p>Envie um arquivo ou cole uma URL. Música fica em loop; efeitos tocam uma vez. Play/stop é transmitido em tempo real.</p><div class="audioForm"><input id="audioUrl" placeholder="https://.../audio.mp3"><input id="audioFile" type="file" accept="audio/*"><select id="audioKind"><option value="music">Música · loop</option><option value="effect">Efeito sonoro · uma vez</option></select><div class="audioActions"><input id="audioVolume" type="range" min="0" max="1" step="0.05" value="0.75"><button id="playAudioBtn" class="primarySmall">▶ Tocar</button><button id="stopAudioBtn" class="softButton">■ Parar</button></div></div></div>`; }

function openNoCampaignState(){
  showModal(`<div class="modalHeader"><div><div class="eyebrow">PRIMEIRO PASSO</div><h3>Você ainda não participa de uma campanha</h3></div></div>
  <p class="modalHint">Sua conta está configurada como Jogador. Para entrar em uma campanha, use um convite/código do mestre. Você também pode mudar seu tipo de conta para Mestre no seu perfil sem ganhar acesso às campanhas de outras pessoas.</p>
  <div class="modalActions"><button class="primarySmall" id="openProfileFromEmpty">Abrir perfil</button><button class="softButton" data-close>Fechar</button></div>`);
  $('openProfileFromEmpty').onclick=()=>{closeModal();profileModal();};
}

async function createCampaign(name,description){
  if(!canCreateCampaign()) throw new Error('Somente contas Mestre podem criar campanhas.');
  const {data,error}=await sb.from('campaigns').insert({owner_id:state.user.id,name,description,system_name:'Sistema próprio',invite_code:Math.random().toString(36).slice(2,10).toUpperCase()}).select().single(); if(error) throw error;
  const {error:me}=await sb.from('campaign_members').insert({campaign_id:data.id,campaign_owner_id:state.user.id,user_id:state.user.id,role:'owner'}); if(me) throw me;
  state.campaign=data; await loadCampaigns(); await initializeWorld(); await loadCampaignData(); closeModal();toast('Campanha criada');
}
function openCampaignCreate(initial=false){
  showModal(`<div class="modalHeader"><div><div class="eyebrow">${initial?'PRIMEIRO PASSO':'NOVA CAMPANHA'}</div><h3>${initial?'Crie sua primeira campanha':'Nova campanha'}</h3></div></div><label>Nome<input id="mCampaignName" maxlength="120" placeholder="Ex.: Sombras de Valedorn"></label><label>Descrição<textarea id="mCampaignDesc" rows="4" placeholder="Uma frase sobre sua campanha."></textarea></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveCampaign" class="primarySmall">Criar campanha</button></div>`);
  $('saveCampaign').onclick=async()=>{try{const n=$('mCampaignName').value.trim();if(!n){toast('Informe um nome.','error');return;}await createCampaign(n,$('mCampaignDesc').value.trim());}catch(e){toast(e.message,'error');}};
}
function openRoomModal(id){
  const room=id?state.rooms.find(x=>x.id===id):null; const g=window.__roomGeom; const r=room||{name:'Novo cômodo',description:'',x:g?.x??20,y:g?.y??20,width:g?.width??30,height:g?.height??25};
  showModal(`<div class="modalHeader"><div><div class="eyebrow">MAPA</div><h3>${room?'Editar cômodo':'Novo cômodo'}</h3></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Nome<input id="roomName" value="${escapeHtml(r.name)}"></label><label>Descrição<textarea id="roomDesc" rows="3">${escapeHtml(r.description||'')}</textarea></label><label>X %<input id="roomX" type="number" min="0" max="100" step="0.5" value="${r.x}"></label><label>Y %<input id="roomY" type="number" min="0" max="100" step="0.5" value="${r.y}"></label><label>Largura %<input id="roomW" type="number" min="5" max="95" step="0.5" value="${r.width}"></label><label>Altura %<input id="roomH" type="number" min="5" max="90" step="0.5" value="${r.height}"></label></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveRoom" class="primarySmall">Salvar</button></div>`);
  $('saveRoom').onclick=async()=>{try{if(!requireMaster())return;const payload={floor_id:state.floor,name:$('roomName').value.trim(),description:$('roomDesc').value.trim(),x:Number($('roomX').value),y:Number($('roomY').value),width:Number($('roomW').value),height:Number($('roomH').value)};if(!payload.name)throw new Error('Informe o nome do cômodo.');let result;if(room){result=await sb.from('rooms').update(payload).eq('id',room.id).select().single();}else{result=await sb.from('rooms').insert(payload).select().single();}if(result.error)throw result.error;if(room)state.rooms=state.rooms.map(x=>x.id===room.id?result.data:x);else state.rooms.push(result.data);state.selected={type:'room',id:result.data.id};closeModal();renderAll();setSave('Cômodo salvo');}catch(e){toast(e.message,'error');}};
}
async function deleteRoom(id){if(!requireMaster())return; if(!confirm('Excluir este cômodo? Entidades vinculadas serão mantidas, mas sem o cômodo.'))return;const {error}=await sb.from('rooms').delete().eq('id',id);if(error){toast(error.message,'error');return;}state.rooms=state.rooms.filter(r=>r.id!==id);state.selected=null;renderAll();toast('Cômodo excluído');}

function openCharacterModal(id){
  const existing=id?state.characters.find(x=>x.id===id):null; if(existing && !canEdit() && existing.player_id!==state.user.id){toast('Você só pode editar sua própria ficha.','error');return;}
  const c=existing||{name:'',class_name:'',ancestry_name:'',level:1,hp_current:'',hp_max:'',armor_class:'',luck:0,luck_points:0,notes:'',attributes:{},sheet_data:{},avatar_url:''}; const self=state.user.id; const members=state.members;
  const memberOptions=members.map(m=>{const p=profileFor(m.user_id);return `<option value="${m.user_id}" ${(c.player_id||self)===m.user_id?'selected':''}>${escapeHtml(p?.display_name || (m.user_id===self?'Você':'Jogador '+m.user_id.slice(0,8)))}</option>`}).join('');
  showModal(`<div class="modalHeader"><div><div class="eyebrow">FICHA TÉCNICA</div><h3>${existing?'Editar personagem':'Novo personagem'}</h3></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Nome<input id="charName" value="${escapeHtml(c.name)}"></label><label>Classe<input id="charClass" value="${escapeHtml(c.class_name||'')}"></label><label>Ancestralidade<input id="charAncestry" value="${escapeHtml(c.ancestry_name||'')}"></label><label>Nível<input id="charLevel" type="number" min="0" value="${c.level??1}"></label><label>HP atual<input id="charHp" type="number" min="0" value="${c.hp_current??''}"></label><label>HP máximo<input id="charHpMax" type="number" min="0" value="${c.hp_max??''}"></label><label>CA<input id="charAc" type="number" min="0" value="${c.armor_class??''}"></label><label>Sorte<input id="charLuck" type="number" value="${c.luck??0}"></label><label>Pontos de sorte<input id="charLuckPoints" type="number" value="${c.luck_points??0}"></label><label>Jogador<select id="charPlayer" ${canEdit()?'':'disabled'}>${memberOptions}</select></label></div><label>URL ou avatar da ficha<input id="charAvatar" value="${escapeHtml(c.avatar_url||'')}" placeholder="https://.../imagem.webp"></label><label>Foto do personagem<input id="charAvatarFile" type="file" accept="image/*"></label><div class="attributeBlock"><div class="attributeTitle"><span>Atributos</span><small>Informe apenas os valores numéricos.</small></div><div class="attributeGrid">
<label class="attributeField"><span>Força</span><input id="attrForca" type="number" min="0" max="30" value="${Number(c.attributes?.forca ?? c.attributes?.strength ?? 0)}"></label>
<label class="attributeField"><span>Destreza</span><input id="attrDestreza" type="number" min="0" max="30" value="${Number(c.attributes?.destreza ?? c.attributes?.dexterity ?? 0)}"></label>
<label class="attributeField"><span>Constituição</span><input id="attrConstituicao" type="number" min="0" max="30" value="${Number(c.attributes?.constituicao ?? c.attributes?.constitution ?? 0)}"></label>
<label class="attributeField"><span>Inteligência</span><input id="attrInteligencia" type="number" min="0" max="30" value="${Number(c.attributes?.inteligencia ?? c.attributes?.intelligence ?? 0)}"></label>
<label class="attributeField"><span>Sabedoria</span><input id="attrSabedoria" type="number" min="0" max="30" value="${Number(c.attributes?.sabedoria ?? c.attributes?.wisdom ?? 0)}"></label>
<label class="attributeField"><span>Carisma</span><input id="attrCarisma" type="number" min="0" max="30" value="${Number(c.attributes?.carisma ?? c.attributes?.charisma ?? 0)}"></label>
</div></div><label>Ficha técnica / habilidades / equipamentos / notas<textarea id="charSheet" rows="8">${escapeHtml(c.notes||'')}</textarea></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveCharacter" class="primarySmall">Salvar ficha</button></div>`);
  $('saveCharacter').onclick=async()=>{try{const payload={campaign_id:state.campaign.id,player_id:$('charPlayer').value||self,name:$('charName').value.trim(),class_name:$('charClass').value.trim(),ancestry_name:$('charAncestry').value.trim(),level:Number($('charLevel').value)||0,hp_current:$('charHp').value===''?null:Number($('charHp').value),hp_max:$('charHpMax').value===''?null:Number($('charHpMax').value),armor_class:$('charAc').value===''?null:Number($('charAc').value),luck:Number($('charLuck').value)||0,luck_points:Number($('charLuckPoints').value)||0,avatar_url:$('charAvatar').value.trim()||null,notes:$('charSheet').value.trim()};payload.attributes={
  forca:Number($('attrForca').value)||0,
  destreza:Number($('attrDestreza').value)||0,
  constituicao:Number($('attrConstituicao').value)||0,
  inteligencia:Number($('attrInteligencia').value)||0,
  sabedoria:Number($('attrSabedoria').value)||0,
  carisma:Number($('attrCarisma').value)||0
};if(!payload.name)throw new Error('Informe o nome do personagem.');if(canEdit()){if(existing?.id){payload.player_id=$('charPlayer').value||null;}}else{payload.player_id=self;}if(existing){const {data,error}=await sb.from('characters').update(payload).eq('id',existing.id).select().single();if(error)throw error;state.characters=state.characters.map(x=>x.id===existing.id?data:x);}else{const {data,error}=await sb.from('characters').insert(payload).select().single();if(error)throw error;state.characters.push(data);}const file=$('charAvatarFile').files[0];if(file){payload.avatar_url=await uploadMedia(file,`characters/${uid()}`);const targetId=existing?.id||state.characters.at(-1).id;const {data,error}=await sb.from('characters').update({avatar_url:payload.avatar_url}).eq('id',targetId).select().single();if(error)throw error;state.characters=state.characters.map(x=>x.id===targetId?data:x);}closeModal();renderAll();toast('Ficha salva');}catch(e){toast(e.message,'error');}};
}

async function openLocationModal(id){const l=state.locations.find(x=>x.id===id);if(!l)return;showModal(`<div class="modalHeader"><div><div class="eyebrow">LOCAL</div><h3>Editar local</h3></div><button class="closeButton" data-close>×</button></div><label>Nome<input id="locName" value="${escapeHtml(l.name)}"></label><label>Descrição<textarea id="locDesc" rows="4">${escapeHtml(l.description||'')}</textarea></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveLocation" class="primarySmall">Salvar</button></div>`);$('saveLocation').onclick=async()=>{if(!requireMaster())return;const {data,error}=await sb.from('locations').update({name:$('locName').value.trim(),description:$('locDesc').value.trim()}).eq('id',id).select().single();if(error){toast(error.message,'error');return;}state.locations=state.locations.map(x=>x.id===id?data:x);closeModal();renderAll();toast('Local atualizado');};}

$('newFloorBtn').onclick=()=>{if(!requireMaster())return;showModal(`<div class="modalHeader"><div><div class="eyebrow">MUNDO</div><h3>Novo andar</h3></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Nome<input id="floorName" placeholder="Ex.: Torre norte"></label><label>Número<input id="floorNum" type="number" value="3"></label></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveFloor" class="primarySmall">Criar andar</button></div>`);$('saveFloor').onclick=async()=>{try{const {data,error}=await sb.from('floors').insert({location_id:currentLocation().id,name:$('floorName').value.trim(),floor_number:Number($('floorNum').value),sort_order:state.floors.length}).select().single();if(error)throw error;state.floors.push(data);state.floor=data.id;closeModal();renderAll();toast('Andar criado');}catch(e){toast(e.message,'error');}};};

function openSessionModal(id){
  if(!canEdit()){toast('Apenas o mestre desta campanha pode criar ou editar sessões.','error');return;}
  const s=id?state.sessions.find(x=>x.id===id):null;
  const next=state.sessions.reduce((m,x)=>Math.max(m,x.session_number||0),0)+1;
  showModal(`<div class="modalHeader"><div><div class="eyebrow">SESSÃO</div><h3>${s?'Editar sessão':'Nova sessão'}</h3></div><button class="closeButton" data-close>×</button></div>
  <div class="formGrid">
    <label>Número<input id="sessNumber" type="number" min="1" value="${s?.session_number||next}"></label>
    <label>Status<select id="sessStatus">${['planned','live','finished','cancelled'].map(x=>`<option value="${x}" ${s?.status===x?'selected':''}>${x}</option>`).join('')}</select></label>
    <label>Título<input id="sessTitle" maxlength="160" value="${escapeHtml(s?.title||'Nova sessão')}" placeholder="Ex.: O Reino Submerso"></label>
    <label>Data e hora <span class="optional">(opcional)</span><input id="sessStarts" type="datetime-local" value="${s?.starts_at?new Date(s.starts_at).toISOString().slice(0,16):''}"></label>
  </div>
  <label>Descrição da sessão <span class="optional">(opcional)</span><textarea id="sessSummary" rows="7" maxlength="4000" placeholder="Você pode deixar em branco e preencher depois.">${escapeHtml(s?.summary||'')}</textarea></label>
  <p class="modalHint">A descrição não é obrigatória. Só o título é necessário para salvar a sessão.</p>
  <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveSession" class="primarySmall">${s?'Salvar alterações':'Criar sessão'}</button></div>`);
  $('saveSession').onclick=async()=>{
    try{
      const title=$('sessTitle').value.trim();
      if(!title){toast('Informe o título da sessão.','error');$('sessTitle').focus();return;}
      const payload={campaign_id:state.campaign.id,session_number:Number($('sessNumber').value)||next,title,summary:$('sessSummary').value.trim(),starts_at:$('sessStarts').value?new Date($('sessStarts').value).toISOString():null,status:$('sessStatus').value,created_by:s?s.created_by:state.user.id};
      const result=s?await sb.from('sessions').update(payload).eq('id',s.id).select().single():await sb.from('sessions').insert(payload).select().single();
      if(result.error)throw result.error;
      if(s)state.sessions=state.sessions.map(x=>x.id===s.id?result.data:x);else state.sessions.push(result.data);
      state.selectedSessionId=result.data.id;closeModal();await subscribeRealtime();renderAll();toast(s?'Sessão atualizada':'Sessão criada');
    }catch(e){toast(e.message||'Não foi possível salvar a sessão.','error');}
  };
}
async function activateSession(id){if(!id)return;const session=state.sessions.find(x=>x.id===id);if(!session)return;state.selectedSessionId=id;state.floor=session.active_floor_id||state.floor;state.selected=null;renderAll();await subscribeRealtime();toast(`Sessão #${session.session_number} aberta`);}

function openNpcModal(id){if(!requireMaster())return;const n=id?state.npcs.find(x=>x.id===id):null;const v=n||{name:'',description:'',notes_private:'',avatar_url:'',data:{}};showModal(`<div class="modalHeader"><div><div class="eyebrow">BESTIÁRIO</div><h3>${n?'Editar entidade':'Novo NPC / monstro'}</h3></div><button class="closeButton" data-close>×</button></div><label>Nome<input id="npcName" value="${escapeHtml(v.name)}"></label><label>Descrição<textarea id="npcDesc" rows="4">${escapeHtml(v.description||'')}</textarea></label><label>Notas privadas do mestre<textarea id="npcNotes" rows="5">${escapeHtml(v.notes_private||'')}</textarea></label><label>Avatar URL<input id="npcAvatar" value="${escapeHtml(v.avatar_url||'')}" placeholder="https://..."></label><label>Avatar do NPC<input id="npcFile" type="file" accept="image/*"></label><label>Dados / ficha (JSON)<textarea id="npcData" rows="6">${escapeHtml(JSON.stringify(v.data||{},null,2))}</textarea></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveNpc" class="primarySmall">Salvar</button></div>`);$('saveNpc').onclick=async()=>{try{const payload={campaign_id:state.campaign.id,name:$('npcName').value.trim(),description:$('npcDesc').value.trim(),notes_private:$('npcNotes').value.trim(),avatar_url:$('npcAvatar').value.trim()||null,data:JSON.parse($('npcData').value||'{}')};if(!payload.name)throw new Error('Informe o nome.');const file=$('npcFile').files[0];if(file)payload.avatar_url=await uploadMedia(file,`npcs/${uid()}`);const result=n?await sb.from('npcs').update(payload).eq('id',n.id).select().single():await sb.from('npcs').insert(payload).select().single();if(result.error)throw result.error;if(n)state.npcs=state.npcs.map(x=>x.id===n.id?result.data:x);else state.npcs.push(result.data);closeModal();renderAll();toast('NPC salvo');}catch(e){toast(e.message,'error');}};}

async function addCharacterToBoard(id){if(!requireMaster())return;const c=state.characters.find(x=>x.id===id);if(!c)return;if(state.entities.some(e=>e.character_id===id)){toast('Esse personagem já está na mesa.');return;}const payload={campaign_id:state.campaign.id,character_id:id,entity_kind:'character',display_name:c.name,icon:'♙',color:colors[state.entities.length%colors.length],floor_id:state.floor,x:50,y:50,room_id:null,visible:true,metadata:{}};const {data,error}=await sb.from('world_entities').insert(payload).select().single();if(error){toast(error.message,'error');return;}state.entities.push(data);renderAll();toast(`${c.name} entrou na mesa`);}
async function addNpcToBoard(id){if(!requireMaster())return;const n=state.npcs.find(x=>x.id===id);if(!n)return;if(state.entities.some(e=>e.npc_id===id)){toast('Essa entidade já está na mesa.');return;}const payload={campaign_id:state.campaign.id,npc_id:id,entity_kind:'npc',display_name:n.name,icon:'♜',color:colors[state.entities.length%colors.length],floor_id:state.floor,x:50,y:50,room_id:null,visible:true,metadata:{}};const {data,error}=await sb.from('world_entities').insert(payload).select().single();if(error){toast(error.message,'error');return;}state.entities.push(data);renderAll();toast(`${n.name} entrou na mesa`);}
function openEntityModal(id){const e=state.entities.find(x=>x.id===id);if(!e)return;const c=e.character_id?state.characters.find(x=>x.id===e.character_id):null;const n=e.npc_id?state.npcs.find(x=>x.id===e.npc_id):null;showModal(`<div class="modalHeader"><div><div class="eyebrow">ENTIDADE</div><h3>${escapeHtml(e.display_name)}</h3></div><button class="closeButton" data-close>×</button></div><div class="statGrid"><div><span>TIPO</span><b>${escapeHtml(e.entity_kind)}</b></div><div><span>POSIÇÃO</span><b>${Number(e.x).toFixed(1)} / ${Number(e.y).toFixed(1)}</b></div></div><p class="modalHint">${c?'Ficha do personagem vinculada.':n?'NPC/monstro vinculado.':'Entidade independente.'}</p><div class="modalActions"><button class="softButton" data-close>Fechar</button>${canEdit()?`<button id="removeEntity" class="dangerButton">Remover da mesa</button>`:''}</div>`);if(canEdit())$('removeEntity').onclick=async()=>{const {error}=await sb.from('world_entities').delete().eq('id',id);if(error){toast(error.message,'error');return;}state.entities=state.entities.filter(x=>x.id!==id);state.selected=null;closeModal();renderAll();toast('Entidade removida da mesa');};}

async function uploadMedia(file,prefix){const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');const path=`${state.user.id}/${prefix}-${Date.now()}.${ext}`;const {error}=await sb.storage.from('rpg-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});if(error)throw error;return sb.storage.from('rpg-media').getPublicUrl(path).data.publicUrl;}
async function playLocalAudio(payload){ if(!state.audioEnabled) return; if(state.audio){state.audio.pause();state.audio=null;}if(payload.action==='stop')return;const audio=new Audio(payload.url);audio.volume=Number(payload.volume??0.75);audio.loop=payload.kind==='music';state.audio=audio;try{await audio.play();}catch(e){console.warn('Autoplay bloqueado',e);toast('Clique em “Ativar áudio” para ouvir o som da sessão.','error');} }
function receiveAudio(payload){playLocalAudio(payload);}
async function broadcastAudio(payload){if(!state.audioChannel)return;if(canEdit())state.audioEnabled=true;await state.audioChannel.send({type:'broadcast',event:'audio',payload:{...payload,user_id:state.user.id}});await playLocalAudio(payload);}

async function performRoll(notation,rule='normal'){
  const parsed=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(notation.trim());if(!parsed)throw new Error('Use uma notação como 1d20 ou 2d6+3.');
  const count=Math.min(50,Math.max(1,Number(parsed[1]))),sides=Math.min(1000,Math.max(2,Number(parsed[2]))),modifier=Number(parsed[3]||0);
  const rollOnce=n=>{const arr=[];const limit=Math.floor((2**32)/sides)*sides;while(arr.length<n){const v=new Uint32Array(1);crypto.getRandomValues(v);if(v[0]>=limit)continue;arr.push((v[0]%sides)+1);}return arr;};
  let base=[];let finalBase=[];let appliedRule='Normal';
  if((rule==='advantage'||rule==='disadvantage')&&count===1&&sides===20){const a=rollOnce(1)[0],b=rollOnce(1)[0];base=[a,b];finalBase=[rule==='advantage'?Math.max(a,b):Math.min(a,b)];appliedRule=rule==='advantage'?'Vantagem (maior)':'Desvantagem (menor)';}else{base=rollOnce(count);finalBase=base;appliedRule='Normal';}
  const final=finalBase.reduce((a,b)=>a+b,0)+modifier;
  const payload={campaign_id:state.campaign.id,session_id:currentSession()?.id||null,roller_user_id:state.user.id,character_id:state.characters.find(c=>c.player_id===state.user.id)?.id||null,notation:notation.trim(),base_results:base,rule_results:{label:appliedRule,selected:finalBase,modifier},final_result:final,created_at:new Date().toISOString()};
  const {data,error}=await sb.from('dice_rolls').insert(payload).select().single();if(error)throw error;state.rolls=[data,...state.rolls].slice(0,30);renderDiceResult(data);renderDice();await state.audioChannel?.send({type:'broadcast',event:'dice_roll',payload:{...data,user_id:state.user.id}});return data;
}

async function profileModal(){
  const current=state.profile?.account_type==='master'?'master':'player';
  showModal(`<div class="modalHeader"><div><div class="eyebrow">PERFIL</div><h3>Sua conta de mesa</h3></div><button class="closeButton" data-close>×</button></div>
  <div class="profileEditor">
    <div class="profilePreview">${state.profile?.avatar_url?`<img src="${escapeHtml(state.profile.avatar_url)}" alt="">`:'✦'}</div>
    <label>Nome de exibição<input id="profileName" value="${escapeHtml(state.profile?.display_name||'')}"></label>
    <label>Tipo de conta<select id="profileAccountType"><option value="player" ${current==='player'?'selected':''}>Jogador</option><option value="master" ${current==='master'?'selected':''}>Mestre</option></select></label>
    <p class="modalHint">Mudar para Mestre libera a criação de novas campanhas. Isso <strong>não</strong> transforma você em mestre de campanhas existentes: cada campanha continua protegida pelo dono e pelos vínculos dela.</p>
    <label>Avatar<input id="profileUrl" value="${escapeHtml(state.profile?.avatar_url||'')}" placeholder="https://..."></label>
    <label>Enviar foto<input id="profileFile" type="file" accept="image/*"></label>
    <label>Bio<textarea id="profileBio" rows="4">${escapeHtml(state.profile?.bio||'')}</textarea></label>
  </div>
  <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveProfile" class="primarySmall">Salvar perfil</button></div>`);
  $('saveProfile').onclick=async()=>{
    try{
      let avatar=$('profileUrl').value.trim()||null;const file=$('profileFile').files[0];if(file)avatar=await uploadMedia(file,'profile');
      const account_type=$('profileAccountType').value;
      const {data,error}=await sb.from('profiles').update({display_name:$('profileName').value.trim()||'Aventureiro',account_type,avatar_url:avatar,bio:$('profileBio').value.trim()}).eq('id',state.user.id).select().single();
      if(error)throw error;state.profile=data;closeModal();renderAll();toast(account_type==='master'?'Conta definida como Mestre':'Conta definida como Jogador');
    }catch(e){toast(e.message||'Não foi possível salvar o perfil.','error');}
  };
}

async function ensureActiveAudioHandlers(){ const active=currentSession(); if(!active)return; if(!$('enableAudioBtn'))return; $('enableAudioBtn').onclick=async()=>{try{state.audioEnabled=true;const ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')await ctx.resume();const osc=ctx.createOscillator();osc.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.01);renderDice();toast('Áudio ativado para esta mesa');}catch(e){toast('Não foi possível ativar o áudio.','error');}}; }

// Navigation
$('sideNav').querySelectorAll('button').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;renderView();if(state.view==='dice'){renderDice();setTimeout(wireAudioControls,0);}});
$('campaignSelect').onchange=async e=>{const next=state.campaigns.find(c=>c.id===e.target.value);if(!next)return;state.campaign=next;state.floor=null;state.selected=null;await loadCampaignData();};
let accountMenuOpen=false;
function toggleAccountMenu(force){
  accountMenuOpen=typeof force==='boolean'?force:!accountMenuOpen;
  $('accountDropdown').classList.toggle('open',accountMenuOpen);
  $('profileBtn').setAttribute('aria-expanded',String(accountMenuOpen));
}
$('profileBtn').onclick=e=>{e.stopPropagation();toggleAccountMenu();};
$('profileMenuBtn')?.addEventListener('click',()=>{toggleAccountMenu(false);profileModal();});
$('signOutBtn').onclick=async()=>{toggleAccountMenu(false);await sb.auth.signOut();};
document.addEventListener('click',e=>{if(accountMenuOpen&&!e.target.closest('#accountMenu'))toggleAccountMenu(false);});
$('newCampaignBtn').onclick=()=>{if(!canCreateCampaign()){toast('Mude sua conta para Mestre no perfil para criar campanhas.','error');return;}openCampaignCreate(false);}; $('openSessionsBtn').onclick=()=>{state.view='sessions';renderView();}; $('openDiceBtn').onclick=()=>{state.view='dice';renderView();renderDice();setTimeout(wireAudioControls,0);};
$('newRoomBtn').onclick=()=>{if(requireMaster())openRoomModal();};
$('structureBtn').onclick=()=>{state.tool=state.tool==='draw'?'move':'draw';$('structureBtn').classList.toggle('chosen',state.tool==='draw');$('moveBtn').classList.toggle('chosen',state.tool==='move');$('board').classList.toggle('drawing',state.tool==='draw');$('boardHint').textContent=state.tool==='draw'?'Clique e arraste para desenhar um novo cômodo':'Arraste entidades e cômodos para reposicionar';};
$('moveBtn').onclick=()=>{state.tool='move';$('moveBtn').classList.add('chosen');$('structureBtn').classList.remove('chosen');$('board').classList.remove('drawing');};
$('zoomIn').onclick=()=>{state.zoom=Math.min(140,state.zoom+10);applyZoom();}; $('zoomOut').onclick=()=>{state.zoom=Math.max(70,state.zoom-10);applyZoom();};
$('newCharacterBtn').onclick=()=>openCharacterModal(); $('newNpcBtn').onclick=()=>openNpcModal(); $('newSessionBtn').onclick=()=>openSessionModal();
function getDiceBuilderNotation(){
  const count=Math.min(50,Math.max(1,Number($("diceCount").value)||1));
  const sides=Math.min(1000,Math.max(2,Number($("diceSides").value)||20));
  const modifier=Number($("diceModifier").value)||0;
  return String(count)+"d"+String(sides)+(modifier>0?"+":"")+(modifier||"");
}
function syncDiceBuilder(){const el=$("diceNotationPreview");if(el)el.textContent=getDiceBuilderNotation();}
function setDiceBuilderPreset(notation){const m=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(notation);if(!m)return;$("diceCount").value=m[1];$("diceSides").value=m[2];$("diceModifier").value=m[3]||0;$("diceRule").value="normal";syncDiceBuilder();}
document.querySelectorAll("#diceCount,#diceSides,#diceModifier").forEach(el=>el.addEventListener("input",syncDiceBuilder));
document.querySelectorAll("[data-dice-preset]").forEach(b=>b.onclick=async()=>{try{setDiceBuilderPreset(b.dataset.dicePreset);state.view="dice";renderView();await performRoll(getDiceBuilderNotation(),"normal");renderDice();}catch(e){toast(e.message,"error");}});
$("diceRule").addEventListener("change",syncDiceBuilder);
$("rollBtn").onclick=async()=>{try{const notation=getDiceBuilderNotation();await performRoll(notation,$("diceRule").value);renderDice();}catch(e){toast(e.message,"error");}};
document.querySelectorAll("[data-quick-die]").forEach(b=>b.onclick=async()=>{try{setDiceBuilderPreset("1d"+b.dataset.quickDie);state.view="dice";renderView();await performRoll(getDiceBuilderNotation(),"normal");renderDice();}catch(e){toast(e.message,"error");}});
$('saveBtn').onclick=()=>{setSave('Conexão ativa · alterações salvas automaticamente');toast('Tudo que foi alterado já foi para o Supabase.');};

function wireAudioControls(){
  $('enableAudioBtn')?.addEventListener('click',async()=>{state.audioEnabled=true;try{const ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')await ctx.resume();const o=ctx.createOscillator();o.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.01);renderDice();toast('Áudio ativado');}catch(e){toast('Não foi possível ativar o áudio.','error');}});
  $('playAudioBtn')?.addEventListener('click',async()=>{try{let url=$('audioUrl').value.trim();const file=$('audioFile').files[0];if(file)url=await uploadMedia(file,`audio/${uid()}`);if(!url)throw new Error('Cole uma URL ou selecione um arquivo.');await broadcastAudio({action:'play',url,volume:Number($('audioVolume').value),kind:$('audioKind')?.value||'music',name:file?.name||($('audioKind')?.value==='effect'?'Efeito sonoro':'Música')});toast('Áudio enviado para a sessão');}catch(e){toast(e.message,'error');}});
  $('stopAudioBtn')?.addEventListener('click',async()=>{await broadcastAudio({action:'stop'});toast('Áudio interrompido');});
}
$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});document.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeModal();});

// Drawing tool: create room based on the dragged area.
let drawStart=null;$('board').addEventListener('pointerdown',e=>{if(state.tool!=='draw'||e.target.closest('.tokenBig')||e.target.closest('.room'))return;const r=$('board').getBoundingClientRect();drawStart={x:e.clientX-r.left,y:e.clientY-r.top};});$('board').addEventListener('pointerup',e=>{if(state.tool!=='draw'||!drawStart)return;const r=$('board').getBoundingClientRect();const x=Math.min(drawStart.x,e.clientX-r.left)/r.width*100,y=Math.min(drawStart.y,e.clientY-r.top)/r.height*100,w=Math.max(10,Math.abs(e.clientX-r.left-drawStart.x)/r.width*100),h=Math.max(8,Math.abs(e.clientY-r.top-drawStart.y)/r.height*100);drawStart=null;openRoomModalWithGeometry({x,y,width:w,height:h});});
function openRoomModalWithGeometry(g){const oldOpen=window.__roomGeom;window.__roomGeom=g;openRoomModal();setTimeout(()=>{if(window.__roomGeom){$('roomX').value=g.x.toFixed(1);$('roomY').value=g.y.toFixed(1);$('roomW').value=g.width.toFixed(1);$('roomH').value=g.height.toFixed(1);window.__roomGeom=null;}},0);}
const originalOpenRoom=openRoomModal;

boot()function syncDiceBuilder(){
  const el=$("diceNotationPreview");
  const count=Math.min(50,Math.max(1,Number($("diceCount").value)||1));
  const sides=Math.min(1000,Math.max(2,Number($("diceSides").value)||20));
  const ruleSelect=$("diceRule");
  const limited=!(count===1&&sides===20);
  if(limited&&ruleSelect.value!=="normal")ruleSelect.value="normal";
  [...ruleSelect.options].forEach(o=>o.disabled=o.value!=="normal"&&limited);
  if(el)el.textContent=getDiceBuilderNotation();
}
function setDiceBuilderPreset(notation){const m=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(notation);if(!m)return;$("diceCount").value=m[1];$("diceSides").value=m[2];$("diceModifier").value=m[3]||0;$("diceRule").value="normal";syncDiceBuilder();}
document.querySelectorAll("#diceCount,#diceSides,#diceModifier").forEach(el=>el.addEventListener("input",syncDiceBuilder));
document.querySelectorAll("[data-dice-preset]").forEach(b=>b.onclick=async()=>{try{setDiceBuilderPreset(b.dataset.dicePreset);state.view="dice";renderView();await performRoll(getDiceBuilderNotation(),"normal");renderDice();}catch(e){toast(e.message,"error");}});
$("diceRule").addEventListener("change",syncDiceBuilder);
$("rollBtn").onclick=async()=>{try{const notation=getDiceBuilderNotation();await performRoll(notation,$("diceRule").value);renderDice();}catch(e){toast(e.message,"error");}};
document.querySelectorAll("[data-quick-die]").forEach(b=>b.onclick=async()=>{try{setDiceBuilderPreset("1d"+b.dataset.quickDie);state.view="dice";renderView();await performRoll(getDiceBuilderNotation(),"normal");renderDice();}catch(e){toast(e.message,"error");}});
$('saveBtn').onclick=()=>{setSave('Conexão ativa · alterações salvas automaticamente');toast('Tudo que foi alterado já foi para o Supabase.');};

function wireAudioControls(){
  $('enableAudioBtn')?.addEventListener('click',async()=>{state.audioEnabled=true;try{const ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')await ctx.resume();const o=ctx.createOscillator();o.connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.01);renderDice();toast('Áudio ativado');}catch(e){toast('Não foi possível ativar o áudio.','error');}});
  $('playAudioBtn')?.addEventListener('click',async()=>{try{let url=$('audioUrl').value.trim();const file=$('audioFile').files[0];if(file)url=await uploadMedia(file,`audio/${uid()}`);if(!url)throw new Error('Cole uma URL ou selecione um arquivo.');await broadcastAudio({action:'play',url,volume:Number($('audioVolume').value),kind:$('audioKind')?.value||'music',name:file?.name||($('audioKind')?.value==='effect'?'Efeito sonoro':'Música')});toast('Áudio enviado para a sessão');}catch(e){toast(e.message,'error');}});
  $('stopAudioBtn')?.addEventListener('click',async()=>{await broadcastAudio({action:'stop'});toast('Áudio interrompido');});
}
$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});document.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeModal();});

// Drawing tool: create room based on the dragged area.
let drawStart=null;$('board').addEventListener('pointerdown',e=>{if(state.tool!=='draw'||e.target.closest('.tokenBig')||e.target.closest('.room'))return;const r=$('board').getBoundingClientRect();drawStart={x:e.clientX-r.left,y:e.clientY-r.top};});$('board').addEventListener('pointerup',e=>{if(state.tool!=='draw'||!drawStart)return;const r=$('board').getBoundingClientRect();const x=Math.min(drawStart.x,e.clientX-r.left)/r.width*100,y=Math.min(drawStart.y,e.clientY-r.top)/r.height*100,w=Math.max(10,Math.abs(e.clientX-r.left-drawStart.x)/r.width*100),h=Math.max(8,Math.abs(e.clientY-r.top-drawStart.y)/r.height*100);drawStart=null;openRoomModalWithGeometry({x,y,width:w,height:h});});
function openRoomModalWithGeometry(g){const oldOpen=window.__roomGeom;window.__roomGeom=g;openRoomModal();setTimeout(()=>{if(window.__roomGeom){$('roomX').value=g.x.toFixed(1);$('roomY').value=g.y.toFixed(1);$('roomW').value=g.width.toFixed(1);$('roomH').value=g.height.toFixed(1);window.__roomGeom=null;}},0);}
const originalOpenRoom=openRoomModal;

boot();