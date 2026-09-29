const sb = window.rpgSupabase;
const $ = id => document.getElementById(id);
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const floorsLabel = n => n === 0 ? 'Térreo' : n > 0 ? `${n}º andar` : `Subsolo ${Math.abs(n)}`;
const fmtDate = value => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : 'Sem data';
const uid = () => crypto.randomUUID();
const colors = ['#9487ff','#6ee7b7','#e8c986','#7dd3fc','#f3a8ca','#fb7185','#f59e0b','#22c55e'];

const state = {
  user:null, profile:null, campaigns:[], campaign:null, role:'player', members:[], profiles:new Map(),
  locations:[], floors:[], rooms:[], characters:[], characterFields:[], npcs:[], entities:[], sessions:[], rolls:[], audioAssets:[], audioPlaylists:[], audioPlaylistItems:[],
  location:null, floor:null, selected:null, view:'table', tool:'move', zoom:100, campaignChannel:null, sessionChannel:null, audioPlayers:new Map(), audioLayers:new Map(),
  audioEnabled:false, presenceChannel:null, online:1, isLoading:true, campaignChronicle:null, campaignAudioState:null, chatMessages:[], activity:[]
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

// A Mesa consulta a camada de visão antes de expor nomes/objetos no painel.
// O mapa continua sendo a fonte visual, mas o painel não pode "furar" o Fog of War.
function mapPointVisible(x,y){
  try{
    if(canEdit()) return true;
    if(typeof window.rpgVttPointVisible === 'function') return !!window.rpgVttPointVisible(Number(x)||0,Number(y)||0);
    if(window.rpgVttVisibilityReady) return false;
  }catch(err){ console.warn('RPG HUB map visibility:',err); }
  return true;
}
function entityVisibleOnMap(entity){
  if(!entity) return false;
  return mapPointVisible(entity.x,entity.y);
}
function roomVisibleOnMap(room){
  if(!room) return false;
  try{
    if(typeof window.rpgVttRoomVisible === 'function') return !!window.rpgVttRoomVisible(room.x,room.y,room.width,room.height,room.rotation||0);
  }catch(err){ console.warn('RPG HUB room visibility:',err); }
  return mapPointVisible(Number(room.x)+Number(room.width)/2, Number(room.y)+Number(room.height)/2);
}

async window.addEventListener('online',()=>scheduleRealtimeRecovery('browser-online'));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleRealtimeRecovery('tab-visible')});
function boot(){
  try{
    const {data,error}=await sb.auth.getSession(); if(error) throw error;
    if(!data.session){location.href='login.html';return;}
    state.user=data.session.user;
    if(data.session.access_token && sb.realtime?.setAuth) await sb.realtime.setAuth(data.session.access_token);
    await ensureProfile();
    await loadCampaigns();
    if(!state.campaign){ if(canCreateCampaign()) openCampaignCreate(true); else openNoCampaignState(); }
    else { await loadCampaignData(); }
    attachAuthListener();
  }catch(err){console.error(err);toast(err.message||'Falha ao carregar a mesa.','error');setSave('Falha de conexão',false);} finally {state.isLoading=false;}
}

function attachAuthListener(){ sb.auth.onAuthStateChange((event,session)=>{ if(event==='SIGNED_OUT'){location.href='login.html';} else if(session?.user){state.user=session.user;if(session.access_token&&sb.realtime?.setAuth)sb.realtime.setAuth(session.access_token);} }); }

async function ensureProfile(){
  const {data,error}=await sb.from('profiles').select('*').eq('id',state.user.id).maybeSingle(); if(error) throw error;
  if(data){state.profile=data;return;}
  const display=state.user.user_metadata?.display_name || state.user.email?.split('@')[0] || 'Aventureiro';
  const {data:created,error:insertError}=await sb.from('profiles').insert({id:state.user.id,display_name:display,account_type:'player' }).select('*').maybeSingle();
  if(insertError) throw insertError; if(!created) throw new Error('O perfil não foi confirmado pelo servidor.'); state.profile=created;
}

async function loadCampaigns(){
  const {data,error}=await sb.from('campaigns')
    .select('id,owner_id,name,description,system_name,cover_url,discord_url,discord_guild_id,timezone,created_at,updated_at')
    .order('created_at',{ascending:true});
  if(error) throw error;
  state.campaigns=data||[];
  $('campaignSelect').innerHTML=state.campaigns.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if(state.campaign && !state.campaigns.some(c=>c.id===state.campaign.id)) state.campaign=null;
  let remembered=null;try{remembered=localStorage.getItem('rpg-hub-active-campaign')}catch(_){}
  if(!state.campaign&&state.campaigns.length)state.campaign=state.campaigns.find(c=>c.id===remembered)||state.campaigns[0];
  if(state.campaign)$('campaignSelect').value=state.campaign.id;
}

async function ensureCampaignWorld(campaignId){
  if(!campaignId||!canEdit())return null;
  const {data,error}=await sb.rpc('ensure_campaign_world',{p_campaign_id:campaignId});
  if(error)throw error;
  return data;
}

const ACTIVITY_LIMIT=120;
async function loadCampaignActivity(){
  if(!state.campaign)return;
  const {data,error}=await sb.from('campaign_activity').select('*').eq('campaign_id',state.campaign.id).order('created_at',{ascending:false}).limit(ACTIVITY_LIMIT);
  if(error){console.warn('RPG HUB activity:',error);state.activity=[];return;}
  state.activity=(data||[]).reverse();
  renderActivity();
}
function activityActorName(actorId){
  return profileFor(actorId)?.display_name || (actorId===state.user?.id?state.profile?.display_name:null) || 'Sistema';
}
function renderActivity(){
  const box=$('campaignActivityList'); if(!box)return;
  box.innerHTML=(state.activity||[]).map(a=>'<article class="activityItem"><div class="activityIcon">•</div><div class="activityBody"><b>'+escapeHtml(activityActorName(a.actor_id))+'</b><span>'+escapeHtml(a.summary)+'</span><time>'+escapeHtml(fmtDate(a.created_at))+'</time></div></article>').join('')||'<div class="activityEmpty">Nenhum evento da mesa ainda.</div>';
  box.scrollTop=box.scrollHeight;
}
async function logCampaignActivity(action,entityType,summary,entityId=null,metadata={}){
  if(!state.campaign||!state.user)return null;
  const payload={campaign_id:state.campaign.id,actor_id:state.user.id,action,entity_type:entityType,entity_id:entityId,summary:String(summary||'').slice(0,500),metadata};
  try{
    const {data,error}=await sb.from('campaign_activity').insert(payload).select('*').maybeSingle();
    if(error)throw error;
    const row=data||{...payload,id:uid(),created_at:new Date().toISOString()};
    if(!state.activity.some(x=>x.id===row.id)){state.activity=[...state.activity,row].slice(-ACTIVITY_LIMIT);renderActivity();}
    if(state.campaignChannel)await state.campaignChannel.send({type:'broadcast',event:'activity',payload:{...row,user_id:state.user.id}});
    return row;
  }catch(error){console.warn('RPG HUB activity log:',error);return null;}
}
function receiveCampaignActivity(row){
  if(!row?.id||row.campaign_id!==state.campaign?.id)return;
  if(!state.activity.some(x=>x.id===row.id)){
    state.activity=[...state.activity,row].slice(-ACTIVITY_LIMIT);
    renderActivity();
  }
}
async function loadCampaignChat(){
  if(!state.campaign)return; const {data,error}=await sb.from('campaign_chat_messages').select('*').eq('campaign_id',state.campaign.id).order('created_at',{ascending:true}).limit(200); if(error){console.warn('RPG HUB chat:',error);state.chatMessages=[];return;} state.chatMessages=data||[];
}
function renderChat(){const box=$('campaignChatMessages');if(!box)return;box.innerHTML=state.chatMessages.map(m=>{const p=profileFor(m.user_id);return '<article class="chatMessage '+(m.user_id===state.user?.id?'mine':'')+'"><div class="chatMessageMeta"><b>'+escapeHtml(p?.display_name||'Aventureiro')+'</b><time>'+escapeHtml(fmtDate(m.created_at))+'</time></div><div class="chatMessageBody">'+escapeHtml(m.content).replace(/\n/g,'<br>')+'</div></article>';}).join('')||'<div class="chatEmpty">Nenhuma mensagem ainda. Comece a conversa da mesa.</div>';box.scrollTop=box.scrollHeight;}
async function sendChatMessage(){const input=$('campaignChatInput');if(!input||!state.campaign)return;const content=input.value.trim();if(!content)return;input.disabled=true;try{const {data,error}=await sb.from('campaign_chat_messages').insert({campaign_id:state.campaign.id,user_id:state.user.id,content,message_type:canEdit()?'master':'chat'}).select('*').maybeSingle();if(error)throw error;if(data&&!state.chatMessages.some(m=>m.id===data.id))state.chatMessages.push(data);input.value='';renderChat();await logCampaignActivity('chat_message','chat',canEdit()?'Mestre enviou uma mensagem no chat':'Enviou uma mensagem no chat',data?.id||null,{message_type:canEdit()?'master':'chat'});}catch(e){toast(e.message||'Não foi possível enviar a mensagem.','error');}finally{input.disabled=false;input.focus();}}
function wireChatControls(){$('campaignChatSend')?.addEventListener('click',sendChatMessage);$('campaignChatInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage();}});}

async function loadCampaignData(){
  if(!state.campaign)return;
  const campaignId=state.campaign.id;
  const [
    {data:members,error:me},{data:locations,error:le},{data:characters,error:ce},{data:characterFields,error:cfe},
    {data:npcs,error:ne},{data:entities,error:ee},{data:sessions,error:se},{data:rolls,error:re}
  ]=await Promise.all([
    sb.from('campaign_members').select('*').eq('campaign_id',campaignId),
    sb.from('locations').select('*').eq('campaign_id',campaignId).order('sort_order'),
    sb.from('characters').select('*').eq('campaign_id',campaignId).order('name'),
    sb.from('character_field_definitions').select('*').eq('campaign_id',campaignId).order('sort_order'),
    sb.from('npcs').select('*').eq('campaign_id',campaignId).order('name'),
    sb.from('world_entities').select('*').eq('campaign_id',campaignId).order('created_at'),
    sb.from('sessions').select('*').eq('campaign_id',campaignId).order('session_number',{ascending:false}),
    canEdit()?sb.from('dice_rolls').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:false}):Promise.resolve({data:[],error:null})
  ]);

  const coreErrors=[['membros',me],['locais',le],['personagens',ce],['campos da ficha',cfe],['NPCs',ne],['entidades',ee],['sessões',se],['rolagens',re]].filter(([,error])=>error);
  if(coreErrors.length){
    const [label,error]=coreErrors[0];
    console.error('[RPG HUB] Falha ao carregar campanha',label,error);
    throw new Error('Falha ao carregar '+label+': '+(error?.message||'erro desconhecido'));
  }

  state.members=members||[];state.locations=locations||[];state.characters=characters||[];
  state.characterFields=characterFields||[];state.npcs=npcs||[];state.entities=entities||[];
  state.sessions=sessions||[];state.rolls=rolls||[];

  const mine=state.members.find(m=>m.user_id===state.user.id);
  state.role=state.campaign.owner_id===state.user.id?'owner':(mine?.role||'player');

  state.profiles=new Map();
  const ids=[...new Set(state.members.map(m=>m.user_id).filter(Boolean))];
  if(ids.length){
    const {data:profiles,error:profilesError}=await sb.from('profiles').select('id,display_name,avatar_url').in('id',ids);
    if(profilesError)console.warn('[RPG HUB] Perfis indisponíveis:',profilesError);
    (profiles||[]).forEach(p=>state.profiles.set(p.id,p));
  }

  await ensureCharacterFields();

  if(!state.locations.length&&canEdit()){
    await ensureCampaignWorld(campaignId);
    const {data:fixedLocations,error:fixedLocationsError}=await sb.from('locations').select('*').eq('campaign_id',campaignId).order('sort_order');
    if(fixedLocationsError)throw fixedLocationsError;
    state.locations=fixedLocations||[];
  }

  await loadFloors();
  await loadCampaignChat();
  await loadCampaignActivity();
  if(state.locations.length&&!state.floors.length&&canEdit()){
    await ensureCampaignWorld(campaignId);
    await loadFloors();
  }

  ensureFloor();
  state.selectedSessionId=currentSession()?.id||null;
  const active=currentSession();
  if(active?.active_floor_id&&state.floors.some(f=>f.id===active.active_floor_id))state.floor=active.active_floor_id;
  state.selected=active?.active_room_id&&state.rooms.some(r=>r.id===active.active_room_id)?{type:'room',id:active.active_room_id}:null;
  const activeFloor=state.floors.find(f=>f.id===state.floor);
  if(activeFloor)state.location=state.locations.find(l=>l.id===activeFloor.location_id)||state.location;

  renderAll();
  await subscribeRealtime();

  // Os módulos auxiliares ficam fora do caminho crítico da campanha.
  state.audioAssets=[];state.audioPlaylists=[];state.audioPlaylistItems=[];state.campaignAudioState=null;state.campaignChronicle=null;
  try{
    const {data,error}=await sb.from('audio_assets').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:true});
    if(!error)state.audioAssets=data||[];else console.warn('[RPG HUB] Áudios:',error);
  }catch(error){console.warn('[RPG HUB] Áudios:',error);}
  try{
    const {data,error}=await sb.from('audio_playlists').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:true});
    if(!error){
      state.audioPlaylists=data||[];
      if(state.audioPlaylists.length){
        const {data:items,error:itemError}=await sb.from('audio_playlist_items').select('*').in('playlist_id',state.audioPlaylists.map(p=>p.id));
        if(!itemError)state.audioPlaylistItems=items||[];
      }
    }else console.warn('[RPG HUB] Playlists:',error);
  }catch(error){console.warn('[RPG HUB] Playlists:',error);}
  try{
    const {data,error}=await sb.from('campaign_audio_state').select('*').eq('campaign_id',campaignId).limit(1).maybeSingle();
    if(!error)state.campaignAudioState=data||null;else console.warn('[RPG HUB] Estado de áudio:',error);
  }catch(error){console.warn('[RPG HUB] Estado de áudio:',error);}
  if(canEdit()){
    try{
      const {data,error}=await sb.from('campaign_chronicles').select('*').eq('campaign_id',campaignId).limit(1).maybeSingle();
      if(!error)state.campaignChronicle=data||null;else console.warn('[RPG HUB] Crônica:',error);
    }catch(error){console.warn('[RPG HUB] Crônica:',error);}
  }
  renderAll();
}

async function initializeWorld(){
  if(!state.campaign||!canEdit())throw new Error('Somente o mestre pode inicializar o mundo.');
  await ensureCampaignWorld(state.campaign.id);
  const {data:locations,error}=await sb.from('locations').select('*').eq('campaign_id',state.campaign.id).order('sort_order');
  if(error)throw error;
  state.locations=locations||[];
  await loadFloors();
  ensureFloor();
}

async function loadFloors(){
  const ids=state.locations.map(l=>l.id);
  if(!ids.length){state.floors=[];state.rooms=[];state.floor=null;state.location=null;return;}
  const {data,error}=await sb.from('floors').select('*').in('location_id',ids).order('sort_order');
  if(error)throw error;
  state.floors=data||[];
  if(state.floors.length){
    const floorIds=state.floors.map(f=>f.id);
    const {data:rooms,error:re}=await sb.from('rooms').select('*').in('floor_id',floorIds).order('sort_order');
    if(re)throw re;
    state.rooms=rooms||[];
  }else state.rooms=[];
  state.location=state.locations[0]||null;
}
function ensureFloor(){ if(!state.floor || !state.floors.some(f=>f.id===state.floor)) state.floor=state.floors[0]?.id||null; }

function realtimeRecordPayload(message){
  const data=message?.payload||{};
  return {
    table:data.table||null,
    operation:data.operation||message?.event||null,
    record:data.record||null,
    old_record:data.old_record||null
  };
}

let realtimeRefreshTimer=null;
const realtimeRefreshQueue=new Set();

function queueRealtimeCollection(name){
  realtimeRefreshQueue.add(name);
  clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer=setTimeout(async()=>{
    const jobs=[...realtimeRefreshQueue];
    realtimeRefreshQueue.clear();
    realtimeRefreshTimer=null;
    for(const job of jobs){
      try{
        if(job==='locations'||job==='floors'){
          const ids=state.locations.map(l=>l.id);
          const {data:locations,error:le}=job==='locations'
            ?await sb.from('locations').select('*').eq('campaign_id',state.campaign.id).order('sort_order')
            :{data:state.locations,error:null};
          if(le)throw le;
          if(job==='locations')state.locations=locations||[];
          const locIds=state.locations.map(l=>l.id);
          if(!locIds.length){state.floors=[];state.rooms=[];}
          else{
            const {data:floors,error:fe}=await sb.from('floors').select('*').in('location_id',locIds).order('sort_order');
            if(fe)throw fe;
            state.floors=floors||[];
            const floorIds=state.floors.map(f=>f.id);
            if(floorIds.length){
              const {data:rooms,error:re}=await sb.from('rooms').select('*').in('floor_id',floorIds).order('sort_order');
              if(re)throw re;
              state.rooms=rooms||[];
            }else state.rooms=[];
          }
          ensureFloor();
          state.location=state.locations.find(l=>l.id===state.floors.find(f=>f.id===state.floor)?.location_id)||state.locations[0]||null;
          renderAll();
          window.rpgVttContextChanged?.();
          continue;
        }
        if(job==='sessions'){
          const previous=currentSession();
          const previousFloor=previous?.active_floor_id||null;
          const previousRoom=previous?.active_room_id||null;
          const {data,error}=await sb.from('sessions').select('*').eq('campaign_id',state.campaign.id).order('session_number',{ascending:false});
          if(error)throw error;
          state.sessions=data||[];
          state.selectedSessionId=state.selectedSessionId&&state.sessions.some(s=>s.id===state.selectedSessionId)?state.selectedSessionId:(currentSession()?.id||null);
          const active=currentSession();
          renderAll();
          if(!canEdit()&&active&&active.id===previous?.id&&(active.active_floor_id!==previousFloor||active.active_room_id!==previousRoom)){
            applySessionScene(active,{silent:true});
          }
          continue;
        }
        if(job==='members'){
          const {data,error}=await sb.from('campaign_members').select('*').eq('campaign_id',state.campaign.id);
          if(error)throw error;
          state.members=data||[];
          const ids=[...new Set(state.members.map(m=>m.user_id).filter(Boolean))];
          if(ids.length){
            const {data:profiles}=await sb.from('profiles').select('id,display_name,avatar_url').in('id',ids);
            (profiles||[]).forEach(p=>state.profiles.set(p.id,p));
          }
          renderAll();
          continue;
        }
        if(job==='character_fields'){
          const {data,error}=await sb.from('character_field_definitions').select('*').eq('campaign_id',state.campaign.id).order('sort_order');
          if(error)throw error;
          state.characterFields=data||[];
          renderAll();
          continue;
        }
        if(job==='audio'){
          const [{data:assets,error:ae},{data:playlists,error:pe}]=await Promise.all([
            sb.from('audio_assets').select('*').eq('campaign_id',state.campaign.id).order('created_at',{ascending:true}),
            sb.from('audio_playlists').select('*').eq('campaign_id',state.campaign.id).order('created_at',{ascending:true})
          ]);
          if(ae||pe)throw (ae||pe);
          state.audioAssets=assets||[];
          state.audioPlaylists=playlists||[];
          if(state.audioPlaylists.length){
            const {data:items,error:ie}=await sb.from('audio_playlist_items').select('*').in('playlist_id',state.audioPlaylists.map(p=>p.id));
            if(ie)throw ie;
            state.audioPlaylistItems=items||[];
          }else state.audioPlaylistItems=[];
          renderDice();
          continue;
        }
        if(job==='audio_state'){
          const {data,error}=await sb.from('campaign_audio_state').select('*').eq('campaign_id',state.campaign.id).maybeSingle();
          if(error)throw error;
          state.campaignAudioState=data||null;
          renderDice();
          renderMasterDashboard();
          continue;
        }
        if(job==='chronicle'){
          if(!canEdit())continue;
          const {data,error}=await sb.from('campaign_chronicles').select('*').eq('campaign_id',state.campaign.id).maybeSingle();
          if(error)throw error;
          state.campaignChronicle=data||null;
          renderChronicle();
          continue;
        }
      }catch(err){
        console.warn('RPG HUB realtime refresh:',job,err);
      }
    }
  },40);
}

function receiveRealtimeBroadcast(message){
  const change=realtimeRecordPayload(message);
  if(!change.table||!change.operation)return;
  const row=change.record||change.old_record;
  if(row?.campaign_id&&row.campaign_id!==state.campaign?.id)return;

  switch(change.table){
    case 'characters':
      receiveCharacterChange({eventType:change.operation,new:change.record,old:change.old_record});
      return;
    case 'npcs':{
      const id=(row||{}).id;
      if(change.operation==='INSERT'&&change.record)state.npcs=state.npcs.some(x=>x.id===id)?state.npcs:[...state.npcs,change.record];
      else if(change.operation==='UPDATE'&&change.record)state.npcs=state.npcs.map(x=>x.id===id?change.record:x);
      else if(change.operation==='DELETE')state.npcs=state.npcs.filter(x=>x.id!==id);
      renderNpcs();renderTable();return;
    }
    case 'world_entities':
      receiveEntityChange({eventType:change.operation,new:change.record,old:change.old_record});
      return;
    case 'rooms':
      receiveRoomChange({eventType:change.operation,new:change.record,old:change.old_record});
      return;
    case 'locations':
      queueRealtimeCollection('locations'); return;
    case 'floors':
      queueRealtimeCollection('floors'); return;
    case 'sessions':
      if(!canEdit()&&change.record?.id===currentSession()?.id){
        const row=change.record;
        const current=currentSession();
        if(row.active_floor_id!==current?.active_floor_id||row.active_room_id!==current?.active_room_id){
          applySessionScene(row,{silent:true});
        }
      }
      queueRealtimeCollection('sessions'); return;
    case 'campaign_members':
      queueRealtimeCollection('members'); return;
    case 'character_field_definitions':
      queueRealtimeCollection('character_fields'); return;
    case 'audio_assets':
    case 'audio_playlists':
    case 'audio_playlist_items':
      queueRealtimeCollection('audio'); return;
    case 'campaign_audio_state':
      queueRealtimeCollection('audio_state'); return;
    case 'campaign_chronicles':
      queueRealtimeCollection('chronicle'); return;
    case 'dice_rolls':{
      if(change.record?.id&&!state.rolls.some(r=>r.id===change.record.id))state.rolls=[change.record,...state.rolls];
      if(change.operation==='UPDATE'&&change.record)state.rolls=state.rolls.map(r=>r.id===change.record.id?change.record:r);
      if(change.operation==='DELETE'&&change.old_record)state.rolls=state.rolls.filter(r=>r.id!==change.old_record.id);
      renderDice();renderMasterDashboard();return;
    }
    case 'map_settings':
    case 'map_walls':
    case 'fog_regions':
    case 'aoe_effects':
    case 'vision_sources':
    case 'combat_encounters':
    case 'combatants':
      window.dispatchEvent(new CustomEvent('rpg:database-change',{detail:change}));
      window.rpgVttVisionRefresh?.();
      window.rpgVttRefreshMapLayout?.();
      return;
    default:
      window.dispatchEvent(new CustomEvent('rpg:database-change',{detail:change}));
  }
}

let realtimeRecoveryTimer=null;
let realtimeRecoveryRunning=false;
async function reconcileRealtimeState(reason='reconnect'){
  if(realtimeRecoveryRunning||!state.campaign?.id)return;
  realtimeRecoveryRunning=true;
  try{
    const cid=state.campaign.id;
    const [locations,entities,sessions,characters]=await Promise.all([
      sb.from('locations').select('*').eq('campaign_id',cid).order('sort_order'),
      sb.from('world_entities').select('*').eq('campaign_id',cid).order('created_at'),
      sb.from('sessions').select('*').eq('campaign_id',cid).order('session_number',{ascending:false}),
      sb.from('characters').select('*').eq('campaign_id',cid).order('name')
    ]);
    if(locations.error)throw locations.error;
    if(entities.error)throw entities.error;
    if(sessions.error)throw sessions.error;
    if(characters.error)throw characters.error;
    state.locations=locations.data||[];
    if(state.locations.length){
      const locIds=state.locations.map(l=>l.id);
      const floors=await sb.from('floors').select('*').in('location_id',locIds).order('sort_order');
      if(floors.error)throw floors.error;
      state.floors=floors.data||[];
      if(state.floors.length){
        const floorIds=state.floors.map(f=>f.id);
        const rooms=await sb.from('rooms').select('*').in('floor_id',floorIds).order('sort_order');
        if(rooms.error)throw rooms.error;
        state.rooms=rooms.data||[];
      }else state.rooms=[];
    }else{state.floors=[];state.rooms=[];}
    state.entities=entities.data||[];
    state.sessions=sessions.data||[];
    state.characters=characters.data||[];
    state.selectedSessionId=state.selectedSessionId&&state.sessions.some(s=>s.id===state.selectedSessionId)?state.selectedSessionId:(currentSession()?.id||null);
    const active=currentSession();
    if(active){
      state.floor=active.active_floor_id&&state.floors.some(f=>f.id===active.active_floor_id)?active.active_floor_id:(state.floors[0]?.id||null);
      state.selected=active.active_room_id&&state.rooms.some(r=>r.id===active.active_room_id)?{type:'room',id:active.active_room_id}:null;
      const floor=state.floors.find(f=>f.id===state.floor);
      state.location=floor?state.locations.find(l=>l.id===floor.location_id)||state.locations[0]||null:state.locations[0]||null;
    }else{
      ensureFloor();
      state.location=state.locations.find(l=>l.id===state.floors.find(f=>f.id===state.floor)?.location_id)||state.locations[0]||null;
      state.selected=null;
    }
    renderAll();
    window.rpgVttContextChanged?.();
    window.rpgVttVisionRefresh?.();
    window.dispatchEvent(new CustomEvent('rpg:realtime-reconnect'));
    window.rpgCombatReconnect?.();
  }catch(err){
    console.warn('RPG HUB state reconciliation:',reason,err);
  }finally{realtimeRecoveryRunning=false;}
}
function scheduleRealtimeRecovery(reason='reconnect'){
  clearTimeout(realtimeRecoveryTimer);
  realtimeRecoveryTimer=setTimeout(()=>reconcileRealtimeState(reason),350);
}
async function subscribeRealtime(){
  if(state.campaignChannel)await sb.removeChannel(state.campaignChannel).catch(()=>{});
  if(state.sessionChannel)await sb.removeChannel(state.sessionChannel).catch(()=>{});
  if(state.presenceChannel)await sb.removeChannel(state.presenceChannel).catch(()=>{});

  const campaignId=state.campaign?.id;
  if(campaignId){
    const campaign=sb.channel(`rpg-hub-campaign-${campaignId}`,{config:{private:true}});
    campaign.on('broadcast',{event:'entity_move'},({payload})=>{if(payload?.user_id!==state.user.id)receiveEntityMove(payload);});
    campaign.on('broadcast',{event:'room_move'},({payload})=>{if(payload?.user_id!==state.user.id)receiveRoomMove(payload);});
    campaign.on('broadcast',{event:'room_resize'},({payload})=>{if(payload?.user_id!==state.user.id)receiveRoomResize(payload);});
    campaign.on('broadcast',{event:'room_rotate'},({payload})=>{if(payload?.user_id!==state.user.id)receiveRoomRotate(payload);});
    campaign.on('broadcast',{event:'scene_change'},({payload})=>{if(payload?.user_id!==state.user.id)receiveSceneChange(payload);});
    campaign.on('broadcast',{event:'audio'},({payload})=>{if(payload?.user_id!==state.user.id)receiveAudio(payload);});
    campaign.on('broadcast',{event:'dice_roll'},({payload})=>{if(payload?.user_id!==state.user.id)receiveRoll(payload);});
    campaign.on('postgres_changes',{event:'INSERT',schema:'public',table:'campaign_chat_messages',filter:`campaign_id=eq.${campaignId}`},payload=>{const row=payload?.new;if(!row?.id||state.chatMessages.some(m=>m.id===row.id))return;state.chatMessages.push(row);renderChat();});
    campaign.on('broadcast',{event:'activity'},({payload})=>{if(payload?.user_id!==state.user.id)receiveCampaignActivity(payload);});
    campaign.on('postgres_changes',{event:'*',schema:'public',table:'campaign_audio_state',filter:`campaign_id=eq.${campaignId}`},async payload=>{
      if(canEdit()||!state.audioEnabled)return;
      const row=payload?.new;
      if(!row)return;
      state.campaignAudioState=row;
      await syncPersistedAudioState({broadcast:false}).catch(err=>console.warn('RPG HUB audio realtime:',err));
    });
    campaign.on('broadcast',{event:'INSERT'},payload=>receiveRealtimeBroadcast(payload));
    campaign.on('broadcast',{event:'UPDATE'},payload=>receiveRealtimeBroadcast(payload));
    campaign.on('broadcast',{event:'DELETE'},payload=>receiveRealtimeBroadcast(payload));
    campaign.on('postgres_changes',{event:'INSERT',schema:'public',table:'dice_rolls',filter:`campaign_id=eq.${campaignId}`},payload=>{
      const row=payload?.new;
      if(!row?.id)return;
      receiveRoll(row);
    });
    campaign.on('postgres_changes',{event:'*',schema:'public',table:'characters',filter:`campaign_id=eq.${campaignId}`},payload=>{receiveCharacterChange(payload);});
    campaign.subscribe((status,err)=>{if(status==='SUBSCRIBED'){scheduleRealtimeRecovery('campaign-subscribed');}if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){console.warn('Campanha realtime:',status,err);scheduleRealtimeRecovery('campaign-'+status);}});
    state.campaignChannel=campaign;
    startAudioDriftSync();
  }

  const sid=currentSession()?.id;
  if(sid){
    const session=sb.channel(`rpg-hub-session-${sid}`,{config:{private:true}});
    session.on('postgres_changes',{event:'UPDATE',schema:'public',table:'sessions',filter:`id=eq.${sid}`},payload=>{
      const row=payload.new;if(!row)return;
      const before=currentSession();
      const changed=row.id===before?.id&&(row.active_floor_id!==before?.active_floor_id||row.active_room_id!==before?.active_room_id);
      state.sessions=state.sessions.map(x=>x.id===row.id?row:x);
      if(changed&&!canEdit()){
        receiveSceneChange({
          floor_id:row.active_floor_id,
          room_id:row.active_room_id,
          room_name:state.rooms.find(r=>r.id===row.active_room_id)?.name,
          silent:true
        });
      }
    });
    session.on('postgres_changes',{event:'UPDATE',schema:'public',table:'world_entities',filter:`campaign_id=eq.${state.campaign.id}`},payload=>{
      const row=payload.new;
      if(!row||payload.old?.updated_at===row.updated_at)return;
      receiveEntityMove({entity_id:row.id,x:row.x,y:row.y,room_id:row.room_id,floor_id:row.floor_id});
    });
    session.on('postgres_changes',{event:'UPDATE',schema:'public',table:'rooms'},payload=>{
      const row=payload.new;
      if(row?.id)receiveRoomMove({room_id:row.id,x:row.x,y:row.y});
    });
    session.subscribe((status,err)=>{if(status==='SUBSCRIBED'){scheduleRealtimeRecovery('session-subscribed');}if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){console.warn('Sessão realtime:',status,err);scheduleRealtimeRecovery('session-'+status);}});
    state.sessionChannel=session;
  }

  const presence=sb.channel(`rpg-hub-presence-${state.campaign.id}`,{config:{private:true,presence:{key:state.user.id}}});
  presence.on('presence',{event:'sync'},()=>{state.online=Object.keys(presence.presenceState()).length;$('onlineCount').textContent=`${Math.max(1,state.online)} online`;});
  presence.subscribe(async status=>{if(status==='SUBSCRIBED'){await presence.track({user_id:state.user.id,display_name:state.profile?.display_name||'Aventureiro'});scheduleRealtimeRecovery('presence-subscribed');}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){console.warn('Presença realtime:',status);scheduleRealtimeRecovery('presence-'+status);}});
  state.presenceChannel=presence;
}

function receiveCharacterChange(payload){
  if(!payload)return;
  const eventType=payload.eventType;
  const row=payload.new;
  if(eventType==='INSERT'&&row?.id){
    if(!state.characters.some(c=>c.id===row.id))state.characters=[...state.characters,row];
    renderAll();
    if(row.player_id===state.user.id)toast('Seu personagem foi sincronizado com a campanha');
    else if(canEdit()){
      const owner=profileFor(row.player_id)?.display_name||'um jogador';
      toast(`Novo personagem criado por ${owner} · pronto para colocar na mesa`);
    }
    return;
  }
  if(eventType==='UPDATE'&&row?.id){
    state.characters=state.characters.map(c=>c.id===row.id?row:c);
    state.entities=state.entities.map(e=>e.character_id===row.id?{...e,display_name:row.name||e.display_name}:e);
    renderAll();
    return;
  }
  if(eventType==='DELETE'){
    const deletedId=payload.old?.id;
    if(!deletedId)return;
    state.characters=state.characters.filter(c=>c.id!==deletedId);
    state.entities=state.entities.filter(e=>e.character_id!==deletedId);
    if(state.selected?.type==='entity'&&state.entities.every(e=>e.id!==state.selected.id))state.selected=null;
    renderAll();
  }
}

function applySessionScene(session,payload={}){
  if(!session&&!payload.floor_id)return false;
  const floorId=payload.floor_id??session?.active_floor_id??null;
  const roomId=payload.room_id??session?.active_room_id??null;
  const floor=floorId?state.floors.find(f=>f.id===floorId):null;
  if(floor){
    state.floor=floor.id;
    state.location=state.locations.find(l=>l.id===floor.location_id)||state.location;
  }else if(floorId){
    window.rpgVttContextChanged?.();
    return false;
  }else{
    state.floor=state.floors[0]?.id||null;
  }
  state.selected=roomId?{type:'room',id:roomId}:null;
  state.tool='move';
  state.view='table';
  window.rpgVttSetTool?.('move');
  renderAll();
  window.rpgVttContextChanged?.();
  window.rpgVttVisionRefresh?.();
  return true;
}

function receiveSceneChange(payload){
  if(!payload)return;
  const changed=applySessionScene(null,payload);
  if(changed&&!payload.silent)toast(payload.room_name?('Cena: '+payload.room_name):'Cena atualizada');
}
function receiveEntityChange(payload){
  if(!payload)return;
  const type=payload.eventType,row=payload.new||payload.old,id=row?.id;
  if(!id)return;
  if(type==='INSERT'){
    if(row.campaign_id===state.campaign?.id&&!state.entities.some(e=>e.id===id))state.entities.push(row);
  }else if(type==='UPDATE'){
    state.entities=state.entities.map(e=>e.id===id?{...e,...row}:e);
  }else if(type==='DELETE'){
    state.entities=state.entities.filter(e=>e.id!==id);
    if(state.selected?.type==='entity'&&state.selected.id===id)state.selected=null;
  }
  renderTable();
}
function receiveRoomChange(payload){
  if(!payload)return;
  const type=payload.eventType,row=payload.new||payload.old,id=row?.id;
  if(!id)return;
  if(type==='INSERT'){
    if(!state.rooms.some(r=>r.id===id)&&state.floors.some(f=>f.id===row.floor_id))state.rooms.push(row);
  }else if(type==='UPDATE'){
    state.rooms=state.rooms.map(r=>r.id===id?{...r,...row}:r);
    if(state.selected?.type==='room'&&state.selected.id===id&&row.floor_id&&row.floor_id!==state.floor)state.selected=null;
  }else if(type==='DELETE'){
    state.rooms=state.rooms.filter(r=>r.id!==id);
    if(state.selected?.type==='room'&&state.selected.id===id)state.selected=null;
  }
  renderTable();
}
function receiveEntityMove(payload){
  if(!payload?.entity_id)return;
  receiveEntityChange({eventType:'UPDATE',new:payload});
}
function receiveRoomMove(payload){
  if(!payload?.room_id)return;
  receiveRoomChange({eventType:'UPDATE',new:{id:payload.room_id,x:payload.x,y:payload.y}});
}
function receiveRoomResize(payload){
  if(!payload?.room_id)return;
  receiveRoomChange({eventType:'UPDATE',new:{id:payload.room_id,width:payload.width,height:payload.height,x:payload.x,y:payload.y}});
}
async function broadcastScene(payload){if(!state.campaignChannel||!canEdit())return;await state.campaignChannel.send({type:"broadcast",event:"scene_change",payload:{...payload,user_id:state.user.id}});}
async function setActiveScene(floorId,roomId=null){
  if(!canEdit())return;
  const floor=state.floors.find(f=>f.id===floorId);
  if(!floor){toast("Andar não encontrado.","error");return;}
  state.floor=floor.id;
  state.location=state.locations.find(l=>l.id===floor.location_id)||state.location;
  state.selected=roomId?{type:"room",id:roomId}:null;
  window.rpgVttSetTool?.('move');
  window.rpgVttContextChanged?.();

  const session=currentSession();
  if(session){
    const result=await sb.from("sessions").update({active_floor_id:floor.id,active_room_id:roomId||null}).eq("id",session.id).select("*").maybeSingle();
    if(result.error){toast(result.error.message||"Não foi possível salvar a cena.","error");return;}
    let data=result.data;
    if(!data){
      const verify=await sb.from("sessions").select("*").eq("id",session.id).maybeSingle();
      if(verify.error){toast(verify.error.message||"Não foi possível confirmar a cena.","error");return;}
      data=verify.data;
    }
    if(data)state.sessions=state.sessions.map(x=>x.id===session.id?data:x);
    else state.sessions=state.sessions.map(x=>x.id===session.id?{...x,active_floor_id:floor.id,active_room_id:roomId||null}:x);
    await broadcastScene({
      floor_id:floor.id,
      room_id:roomId,
      room_name:roomId?state.rooms.find(r=>r.id===roomId)?.name:null,
      session_id:session.id,
      scene_revision:Date.now()
    });
    await logCampaignActivity('scene_change','session',roomId?`Cena alterada para ${state.rooms.find(r=>r.id===roomId)?.name||'cômodo'}`:`Andar alterado para ${floor.name}`,roomId||floor.id,{floor_id:floor.id,room_id:roomId||null,session_id:session.id});
    setSave(roomId?'Cena transmitida aos jogadores':'Andar transmitido aos jogadores');
  }else{
    setSave('Andar selecionado · sem sessão ativa');
  }
  renderAll();
}
const movementSync={entity:new Map(),room:new Map(),seq:new Map(),last:new Map()};
function movementSeq(key){
  const next=Math.max(movementSync.seq.get(key)||0,loadMovementRevision(key))+1;
  movementSync.seq.set(key,next);persistMovementRevision(key,next);
  return next;
}
function movementRevisionKey(key){return 'rpg-movement-revision:'+state.campaign?.id+':'+key}
function persistMovementRevision(key,seq){
  try{localStorage.setItem(movementRevisionKey(key),String(seq))}catch(_){}
}
function loadMovementRevision(key){
  try{return Number(localStorage.getItem(movementRevisionKey(key))||0)}catch(_){return 0}
}
async function sendMovement(event,payload,key){
  if(!state.campaignChannel||!canEdit())return;
  const seq=movementSeq(key);
  movementSync.last.set(key,{seq,ts:Date.now()});
  await state.campaignChannel.send({type:'broadcast',event,payload:{...payload,user_id:state.user.id,move_seq:seq,move_ts:Date.now()}});
}
async function broadcastEntityMove(payload){return sendMovement('entity_move',payload,'entity:'+payload.entity_id);}
async function broadcastRoomMove(payload){return sendMovement('room_move',payload,'room:'+payload.room_id);}
async function broadcastRoomResize(payload){return sendMovement('room_resize',payload,'room:'+payload.room_id);}
function acceptRemoteMovement(key,payload){
  if(!payload?.move_seq)return true;
  const previous=movementSync.last.get(key);
  if(previous&&Number(payload.move_seq)<Number(previous.seq))return false;
  movementSync.last.set(key,{seq:Number(payload.move_seq),ts:Number(payload.move_ts)||Date.now()});
  return true;
}
function applyRemoteEntityPosition(payload,render=true){
  if(!payload?.entity_id||!acceptRemoteMovement('entity:'+payload.entity_id,payload))return;
  state.entities=state.entities.map(e=>e.id===payload.entity_id?{...e,x:Number(payload.x),y:Number(payload.y),room_id:payload.room_id??null,floor_id:payload.floor_id??e.floor_id}:e);
  if(render)renderTable();
}
function applyRemoteRoomPosition(payload,render=true){
  if(!payload?.room_id||!acceptRemoteMovement('room:'+payload.room_id,payload))return;
  state.rooms=state.rooms.map(r=>r.id===payload.room_id?{...r,x:Number(payload.x),y:Number(payload.y)}:r);
  if(render)renderTable();
}
function receiveEntityMove(payload){applyRemoteEntityPosition(payload,true);}
function receiveRoomMove(payload){applyRemoteRoomPosition(payload,true);}
function receiveRoomResize(payload){
  if(!payload?.room_id||!acceptRemoteMovement('room:'+payload.room_id,payload))return;
  state.rooms=state.rooms.map(r=>r.id===payload.room_id?{...r,width:Number(payload.width),height:Number(payload.height),x:Number(payload.x),y:Number(payload.y)}:r);
  renderTable();
}
function receiveRoomRotate(payload){if(!payload?.room_id)return;state.rooms=state.rooms.map(r=>r.id===payload.room_id?{...r,rotation:Number(payload.rotation)||0}:r);renderTable();}
async function broadcastRoomRotate(payload){if(!state.campaignChannel||!canEdit())return;await state.campaignChannel.send({type:"broadcast",event:"room_rotate",payload:{...payload,user_id:state.user.id}});}

function receiveRoll(payload){
  if(!payload?.id&&!payload?.final_result)return;
  if(payload.id&&!state.rolls.some(r=>r.id===payload.id))state.rolls=[payload,...state.rolls].slice(0,30);
  renderDiceResult(payload); renderDice();
  if(state.view!=='dice') $('rollResult')?.classList.add('rollPulse');
  setTimeout(()=>$('rollResult')?.classList.remove('rollPulse'),280);
  if(payload.roller_user_id!==state.user?.id)toast('Rolagem de '+(payload.roller_display_name||'Jogador')+': '+payload.final_result);
}

function renderMasterDashboard(){
  if(!canEdit()){
    return;
  }
  const status=$('masterDashboardSessionStatus');
  const active=currentSession();
  if(status) status.textContent=active ? 'Sessão #'+active.session_number+' · '+(active.status||'').toUpperCase() : 'Nenhuma sessão ativa';

  const audio=$('masterDashboardAudio');
  if(audio) audio.innerHTML=audioPanel(active);

  const history=$('masterDashboardRollHistory');
  if(history){
    const rows=state.rolls.map(r=>{
      const roller=r.roller_display_name||profileFor(r.roller_user_id)?.display_name||'Jogador';
      const character=state.characters.find(c=>c.id===r.character_id);
      const session=state.sessions.find(s=>s.id===r.session_id);
      const values=Array.isArray(r.base_results)?r.base_results.join(' · '):'—';
      const modifier=Number(r.rule_results?.modifier||0);
      const modifierText=modifier?' '+(modifier>0?'+':'')+modifier:'';
      const sessionText=session?'Sessão #'+session.session_number:'Sem sessão';
      return '<article class="masterDashboardRoll"><div class="masterDashboardRollMain"><div class="masterDashboardRollTop"><b>'+escapeHtml(roller)+'</b><strong>'+escapeHtml(r.final_result)+'</strong></div><small>'+escapeHtml(character?.name||'Sem personagem')+' · '+escapeHtml(sessionText)+'</small><span>'+escapeHtml(r.notation||'Rolagem')+' · dados: '+escapeHtml(values)+escapeHtml(modifierText)+'</span><em>'+escapeHtml(fmtDate(r.created_at))+'</em></div></article>';
    }).join('');
    history.innerHTML=rows||'<div class="masterDashboardEmpty">Nenhuma rolagem registrada nesta campanha.</div>';
  }

  const characters=$('masterDashboardCharacters');
  if(characters){
    characters.innerHTML=state.characters.map(c=>{
      const p=profileFor(c.player_id);
      const avatar=c.avatar_url||p?.avatar_url;
      return '<article class="masterCharacterMini"><div class="masterCharacterAvatar">'+(avatar?'<img src="'+escapeHtml(avatar)+'" alt="">':'♙')+'</div><div class="masterCharacterInfo"><b>'+escapeHtml(c.name)+'</b><small>'+escapeHtml(c.class_name||'Classe não definida')+' · '+escapeHtml(p?.display_name||(c.player_id===state.user.id?'Você':'Jogador'))+'</small><span>HP '+escapeHtml(c.hp_current??'—')+'/'+escapeHtml(c.hp_max??'—')+' · DEF '+escapeHtml(c.armor_class??'—')+'</span></div><button class="softButton" data-master-open-character="'+escapeHtml(c.id)+'">Abrir ficha</button></article>';
    }).join('')||'<div class="masterDashboardEmpty">Nenhuma ficha cadastrada ainda.</div>';

    characters.querySelectorAll('[data-master-open-character]').forEach(btn=>{
      btn.addEventListener('click',()=>openCharacterModal(btn.dataset.masterOpenCharacter));
    });
  }

  const openAll=$('openMasterCharactersBtn');
  if(openAll){
    openAll.onclick=()=>{state.view='characters';renderView();};
  }

  setTimeout(wireAudioControls,0);
}

function renderAll(){renderShell();renderTable();renderCharacters();renderWorld();renderSessions();renderNpcs();renderDice();renderMasterDashboard();renderChronicle();renderChat();renderView();}
function renderShell(){
  $('campaignRole').textContent=isCampaignMaster()?'Mestre da mesa · controle total':state.role==='co_master'?'Co-mestre · permissões da campanha':isMaster()?'Conta Mestre · participante':'Jogador'; const mobileUserName=$('mobileUserName');if(mobileUserName)mobileUserName.textContent=state.profile?.display_name||'Usuário'; $('masterBadge').classList.toggle('hidden',!isCampaignMaster()); const accountTypeLabel=$('accountTypeLabel'); if(accountTypeLabel)accountTypeLabel.textContent=isMaster()?'Mestre':'Jogador';
  $('workspaceTitle').textContent=state.campaign?.name||'RPG HUB'; $('workspaceSubtitle').textContent=state.campaign?.description||'Campanha persistente'; $('boardLocationName').textContent=currentLocation()?.name||'Sem local'; $('userName').textContent=state.profile?.display_name||state.user?.email?.split('@')[0]||'Aventureiro';
  $('userAvatar').innerHTML=state.profile?.avatar_url?`<img src="${escapeHtml(state.profile.avatar_url)}" alt="">`:'?';
  $('newRoomBtn').disabled=!canEdit(); $('newFloorBtn').disabled=!canEdit(); $('newSessionBtn').disabled=!canEdit(); $('newNpcBtn').disabled=!canEdit(); $('newCharacterBtn').disabled=false;
  const active=currentSession(); $('activeSessionLabel').textContent=active?`Sessão #${active.session_number} · ${active.status.toUpperCase()}`:'Nenhuma sessão ativa'; $('activeSessionTitle').textContent=active?.title||'Crie uma sessão para começar';
  $('enablePlayerAudioBtn')?.classList.toggle('hidden',canEdit());
  const list=state.campaigns.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  $('campaignSelect').innerHTML=list;
  const mobileSelect=$('mobileCampaignSelect');
  if(mobileSelect)mobileSelect.innerHTML=list;
  if(state.campaign){$('campaignSelect').value=state.campaign.id;if(mobileSelect)mobileSelect.value=state.campaign.id;}
  $('campaignInviteBtn').classList.toggle('hidden',!canEdit());
  $('joinCampaignBtn').classList.remove('hidden');
  const deleteCampaignBtn=$('deleteCampaignBtn');if(deleteCampaignBtn)deleteCampaignBtn.classList.toggle('hidden',!canEdit());
  $('mobileNewCampaignBtn')?.classList.toggle('hidden',!canCreateCampaign());
  $('chronicleNav')?.classList.toggle('hidden',!canEdit());
  $('mobileChronicleNav')?.classList.toggle('hidden',!canEdit());
  $('masterDashboardNav')?.classList.toggle('hidden',!canEdit());
  $('mobileMasterDashboardNav')?.classList.toggle('hidden',!canEdit());
  $('viewMasterdashboard')?.classList.toggle('hidden',!canEdit());
  $('mobileJoinCampaignBtn')?.classList.remove('hidden');
}
function renderView(){ if((state.view==='chronicle'||state.view==='masterdashboard')&&!canEdit())state.view='table'; document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $(`view${state.view.charAt(0).toUpperCase()+state.view.slice(1)}`)?.classList.add('active'); document.querySelectorAll('#sideNav button, #mobileBottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view)); }

function entityAvatarUrl(entity){
  if(!entity)return null;
  const character=entity.character_id?state.characters.find(x=>x.id===entity.character_id):null;
  const npc=entity.npc_id?state.npcs.find(x=>x.id===entity.npc_id):null;
  const player=character?profileFor(character.player_id):null;
  return character?.avatar_url||player?.avatar_url||npc?.avatar_url||null;
}
function entityFallbackIcon(entity){
  return entity?.icon || (entity?.entity_kind==='character'?'♙':entity?.entity_kind==='npc'?'♜':'◆');
}
function entityAvatarMarkup(entity,small=false){
  const avatar=entityAvatarUrl(entity);
  const icon=escapeHtml(entityFallbackIcon(entity));
  return avatar
    ? '<span class="'+(small?'entityAvatar entityAvatarWithImage':'tokenAvatar')+'"><img src="'+escapeHtml(avatar)+'" alt="" loading="lazy"><span class="tokenFallback">'+icon+'</span></span>'
    : '<span class="'+(small?'entityAvatar':'tokenAvatar')+'"><span class="tokenFallback">'+icon+'</span></span>';
}
function pointInsideRoom(x,y,r){
  const w=Number(r.width),h=Number(r.height),cx=Number(r.x)+w/2,cy=Number(r.y)+h/2;
  const angle=-(Number(r.rotation)||0)*Math.PI/180;
  const dx=x-cx,dy=y-cy;
  const lx=dx*Math.cos(angle)-dy*Math.sin(angle);
  const ly=dx*Math.sin(angle)+dy*Math.cos(angle);
  return Math.abs(lx)<=w/2&&Math.abs(ly)<=h/2;
}
async function moveEntityToFloor(id,floorId){
  if(!requireMaster())return;
  const entity=state.entities.find(x=>x.id===id);
  const floor=state.floors.find(x=>x.id===floorId);
  if(!entity||!floor){toast('Personagem ou andar não encontrado.','error');return;}
  if(entity.floor_id===floor.id){toast('O personagem já está neste andar.');return;}
  const x=Math.max(3,Math.min(97,Number(entity.x)||50));
  const y=Math.max(7,Math.min(93,Number(entity.y)||50));
  const room=roomAtPosition(x,y,floor.id);
  const result=await sb.from('world_entities').update({floor_id:floor.id,room_id:room?.id||null,x,y}).eq('id',id).select().maybeSingle();
  if(result.error){toast(result.error.message||'Não foi possível mudar o personagem de andar.','error');return;}
  if(!result.data){toast('A alteração não retornou a entidade atualizada.','error');return;}
  const data=result.data;
  state.entities=state.entities.map(e=>e.id===id?data:e);
  state.floor=floor.id;
  state.location=state.locations.find(l=>l.id===floor.location_id)||state.location;
  state.selected={type:'entity',id};
  await broadcastEntityMove({entity_id:id,x,y,room_id:room?.id||null,floor_id:floor.id});
  renderAll();
  await logCampaignActivity('entity_move','character',`${entity.display_name} foi movido para ${floor.name}${room?` · ${room.name}`:''}`,id,{floor_id:floor.id,room_id:room?.id||null});
  setSave('Personagem movido para '+floor.name);
  toast(room?entity.display_name+' movido para '+floor.name+' · '+room.name:entity.display_name+' movido para '+floor.name);
}

function renderTable(){
  ensureFloor();
  const f=currentFloor();
  $('contextFloor').textContent=f?.name||'Sem andar';
  $('boardFloorName').textContent=f?.name?.toUpperCase()||'—';
  $('floorSwitch').innerHTML=state.floors.map(x=>`<button class="${x.id===state.floor?'chosen':''}" data-floor="${x.id}">${escapeHtml(x.name)}</button>`).join('') || '<span class="muted">Nenhum andar</span>';
  document.querySelectorAll('[data-floor]').forEach(b=>b.onclick=async()=>{
    const id=b.dataset.floor;
    if(canEdit()) await setActiveScene(id,null);
    else { state.floor=id; state.selected=null; state.tool='move'; window.rpgVttSetTool?.('move'); window.rpgVttContextChanged?.(); renderTable(); }
  });

  const allRooms=state.rooms.filter(r=>r.floor_id===state.floor);
  const allEntities=state.entities.filter(e=>e.floor_id===state.floor && e.visible!==false);
  const rooms=canEdit()?allRooms:allRooms.filter(roomVisibleOnMap);
  const entities=canEdit()?allEntities:allEntities.filter(entityVisibleOnMap);

  if(state.selected?.type==='entity' && !canEdit()){
    const selectedEntity=allEntities.find(e=>e.id===state.selected.id);
    if(selectedEntity && !entityVisibleOnMap(selectedEntity)) state.selected=null;
  }
  if(state.selected?.type==='room' && !canEdit()){
    const selectedRoom=allRooms.find(r=>r.id===state.selected.id);
    if(selectedRoom && !roomVisibleOnMap(selectedRoom)) state.selected=null;
  }

  $('roomLayer').innerHTML=rooms.map(r=>`<div class="room ${state.selected?.type==='room'&&state.selected.id===r.id?'roomSelected':''}" data-room-id="${r.id}" style="left:${r.x}%;top:${r.y}%;width:${r.width}%;height:${r.height}%;transform:rotate(${Number(r.rotation)||0}deg)"><span>${escapeHtml(r.name)}</span><div class="roomResize" title="Redimensionar"></div></div>`).join('');
  $('roomList').innerHTML=rooms.map(r=>`<button class="roomItem ${state.selected?.type==='room'&&state.selected.id===r.id?'roomChosen':''}" data-room-list="${r.id}"><span class="roomIcon">▧</span><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description||'Sem descrição')}</small></div><span>›</span></button>`).join('') || '<div class="emptySelect">Nenhum cômodo visível neste momento.</div>';
  $('entityCount').textContent=entities.length;
  $('tokenLayer').innerHTML=entities.map(e=>`<div class="tokenBig ${state.selected?.type==='entity'&&state.selected.id===e.id?'selected':''}" data-entity-id="${e.id}" style="left:${e.x}%;top:${e.y}%;--token-color:${escapeHtml(e.color||'#9487ff')}">${entityAvatarMarkup(e)}<span>${escapeHtml(e.display_name)}</span></div>`).join('');
  $('entityList').innerHTML=entities.map(e=>`<button class="entityItem ${state.selected?.type==='entity'&&state.selected.id===e.id?'entityChosen':''}" data-entity-list="${e.id}">${entityAvatarMarkup(e,true)}<div><b>${escapeHtml(e.display_name)}</b><small>${escapeHtml(e.entity_kind)}</small></div><span>›</span></button>`).join('') || '<div class="emptySelect">Nenhuma entidade visível neste momento.</div>';
  $('selectedCard').innerHTML=renderSelection();
  bindTableInteractions();
  applyZoom();
}
function renderSelection(){
  if(!state.selected)return '<div class="emptySelect">Selecione uma entidade ou cômodo.</div>';
  if(state.selected.type==='room'){const r=state.rooms.find(x=>x.id===state.selected.id);if(!r)return '';return `<div class="eyebrow">CÔMODO</div><div class="selectedRow"><div class="selectedEmoji">▧</div><div><h3>${escapeHtml(r.name)}</h3><p>${escapeHtml(r.description||'Sem descrição')}</p></div></div><div class="selectionActions"><button data-edit-room="${r.id}">Editar</button>${canEdit()?`<button data-broadcast-room="${r.id}" class="primarySmall">Transmitir cena</button><button class="dangerGhost" data-delete-room="${r.id}">Excluir</button>`:''} </div>`;}
  const e=state.entities.find(x=>x.id===state.selected.id);if(!e)return ''; const character=e.character_id?state.characters.find(x=>x.id===e.character_id):null; const npc=e.npc_id?state.npcs.find(x=>x.id===e.npc_id):null; const source=character||npc; const moveOptions=state.floors.map(f=>`<option value="${f.id}" ${f.id===e.floor_id?'selected':''}>${escapeHtml(f.name)}</option>`).join(''); return `<div class="eyebrow">ENTIDADE</div><div class="selectedRow"><div class="selectedEmoji">${entityAvatarMarkup(e,true)}</div><div><h3>${escapeHtml(e.display_name)}</h3><p>${escapeHtml(e.entity_kind)} · posição salva</p></div></div><div class="statGrid"><div><span>HP</span><b>${character?.hp_current!=null?`${character.hp_current}/${character.hp_max??'—'}`:'—'}</b></div><div><span>ORIGEM</span><b>${source?escapeHtml(source.name):'—'}</b></div></div>${canEdit()?`<div class="selectionMoveFloor"><label>Transferir para<select data-selected-entity-floor>${moveOptions}</select></label><button class="primarySmall" data-move-entity="${e.id}">Mover</button></div>`:''}<div class="selectionActions"><button data-edit-entity="${e.id}">Detalhes</button></div>`;
}
function bindTableInteractions(){
  document.querySelectorAll('[data-room-list]').forEach(b=>b.onclick=()=>{state.selected={type:'room',id:b.dataset.roomList};renderTable();});
  document.querySelectorAll('[data-entity-list]').forEach(b=>b.onclick=()=>{state.selected={type:'entity',id:b.dataset.entityList};renderTable();});
  document.querySelectorAll('[data-edit-room]').forEach(b=>b.onclick=()=>openRoomModal(b.dataset.editRoom));
  document.querySelectorAll('[data-broadcast-room]').forEach(b=>b.onclick=()=>setActiveScene(state.floor,b.dataset.broadcastRoom));
  document.querySelectorAll('[data-delete-room]').forEach(b=>b.onclick=()=>deleteRoom(b.dataset.deleteRoom));
  document.querySelectorAll('[data-edit-entity]').forEach(b=>b.onclick=()=>openEntityModal(b.dataset.editEntity));
  document.querySelectorAll('[data-move-entity]').forEach(b=>b.onclick=()=>{const select=b.closest('.selectionMoveFloor')?.querySelector('[data-selected-entity-floor]');moveEntityToFloor(b.dataset.moveEntity,select?.value);});
  document.querySelectorAll('.tokenBig').forEach(el=>{el.onpointerdown=e=>startEntityDrag(e,el);el.onclick=e=>{e.stopPropagation();state.selected={type:'entity',id:el.dataset.entityId};renderTable();};});
  document.querySelectorAll('.room').forEach(el=>{el.onclick=e=>{if(e.target.closest('.roomResize')||e.target.closest('.rpgRoomRotateHandle'))return;state.selected={type:'room',id:el.dataset.roomId};renderTable();};el.onpointerdown=e=>startRoomDrag(e,el);});
  document.querySelectorAll('.roomResize').forEach(el=>el.onpointerdown=e=>startRoomResize(e,el.parentElement));
}
function clientToBoardPercent(clientX,clientY,rect){
  return {x:Math.max(0,Math.min(100,(clientX-rect.left)/Math.max(1,rect.width)*100)),y:Math.max(0,Math.min(100,(clientY-rect.top)/Math.max(1,rect.height)*100))};
}
function movementProfile(entity){
  const rules=window.rpgCampaignRules||{};
  const cfg=rules.config||{};
  const source=entity?.character_id?state.characters.find(x=>x.id===entity.character_id):null;
  const speed=Number(source?.movement_speed??source?.speed??cfg.movementUnits??6);
  return {speed:Math.max(0,speed),unitsPerPercent:Number(cfg.percentPerUnit||1)};
}
function movementCost(entity,from,to){
  const dx=Number(to.x)-Number(from.x),dy=Number(to.y)-Number(from.y);
  return Math.sqrt(dx*dx+dy*dy);
}
function canMoveEntity(entity,from,to){
  const p=movementProfile(entity),cost=movementCost(entity,from,to);
  return {ok:cost<=p.speed*p.unitsPerPercent+0.001,cost,remaining:Math.max(0,p.speed-cost/p.unitsPerPercent)};
}
function startEntityDrag(e,el){
  if(!canEdit()||state.tool!=='move'||e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  const id=el.dataset.entityId,current=state.entities.find(q=>q.id===id);if(!current)return;
  const board=$('board'),rect=board.getBoundingClientRect(),start=clientToBoardPercent(e.clientX,e.clientY,rect);
  const previous={x:Number(current.x),y:Number(current.y),room_id:current.room_id??null,floor_id:current.floor_id};
  const grabOffset={x:start.x-previous.x,y:start.y-previous.y};
  let latestX=previous.x,latestY=previous.y,finished=false,lastMoveBroadcast=0;
  const movementKey='entity:'+id;
  el.classList.add('dragging');el.dataset.wasDragged='1';el.setPointerCapture?.(e.pointerId);
  const cleanup=()=>{if(finished)return;finished=true;try{el.releasePointerCapture?.(e.pointerId)}catch(_){}el.classList.remove('dragging');el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);};
  const move=ev=>{
    const raw=clientToBoardPercent(ev.clientX,ev.clientY,rect),target={x:raw.x-grabOffset.x,y:raw.y-grabOffset.y};
    const snapped=window.rpgSnapPoint?window.rpgSnapPoint(target.x,target.y):target;
    latestX=Math.max(1,Math.min(99,snapped.x));latestY=Math.max(1,Math.min(99,snapped.y));
    const room=roomAtPosition(latestX,latestY,current.floor_id||state.floor);
    const validation=canMoveEntity(current,moveStart,{x:latestX,y:latestY});
    if(!validation.ok){latestX=previous.x;latestY=previous.y;el.style.left=latestX+'%';el.style.top=latestY+'%';return;}
    const now=performance.now();
    if(now-lastMoveBroadcast>30){
      lastMoveBroadcast=now;
      broadcastEntityMove({entity_id:id,x:latestX,y:latestY,room_id:room?.id||null,floor_id:current.floor_id}).catch(()=>{});
    }
    state.entities=state.entities.map(item=>item.id===id?{...item,x:latestX,y:latestY,room_id:room?.id||null}:item);
    el.style.left=latestX+'%';el.style.top=latestY+'%';
  };
  const up=async()=>{
    cleanup();const room=roomAtPosition(latestX,latestY,current.floor_id||state.floor);
    const result=await sb.from('world_entities').update({x:latestX,y:latestY,room_id:room?.id||null,updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',current.updated_at).select().maybeSingle();
    if(result.error){state.entities=state.entities.map(item=>item.id===id?{...item,...previous}:item);renderTable();toast(result.error.message||'Não foi possível salvar a posição.','error');return;}
    if(!result.data){state.entities=state.entities.map(item=>item.id===id?{...item,...previous}:item);renderTable();toast('A entidade não pôde ser localizada após o movimento.','error');return;}
    const data=result.data;
    data.movement_remaining=canMoveEntity(data,moveStart,data).remaining;
    state.entities=state.entities.map(item=>item.id===id?data:item);
    await broadcastEntityMove({entity_id:id,x:latestX,y:latestY,room_id:room?.id||null,floor_id:current.floor_id,movement_cost:canMoveEntity(data,moveStart,data).cost,movement_remaining:data.movement_remaining});
    setSave(room?'Entidade posicionada em '+room.name+' · deslocamento '+data.movement_remaining.toFixed(1):'Posição da entidade salva');
  };
  const cancel=()=>{cleanup();state.entities=state.entities.map(item=>item.id===id?{...item,...previous}:item);renderTable();};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up,{once:true});el.addEventListener('pointercancel',cancel,{once:true});
}
function rotatedRoomInsets(room){
  const w=Number(room?.width)||0,h=Number(room?.height)||0,deg=Number(room?.rotation)||0,rad=Math.abs(deg)*Math.PI/180;
  const bboxW=Math.abs(w*Math.cos(rad))+Math.abs(h*Math.sin(rad)),bboxH=Math.abs(w*Math.sin(rad))+Math.abs(h*Math.cos(rad));
  return {x:Math.max(0,(bboxW-w)/2),y:Math.max(0,(bboxH-h)/2)};
}
function constrainRoomPosition(room,x,y){
  const i=rotatedRoomInsets(room),maxX=Math.max(i.x,100-Number(room.width)-i.x),maxY=Math.max(i.y,100-Number(room.height)-i.y);
  return {x:Math.max(i.x,Math.min(maxX,x)),y:Math.max(i.y,Math.min(maxY,y))};
}
function startRoomDrag(e,el){
  if(!canEdit()||state.tool!=='move'||e.target.closest('.roomResize')||e.target.closest('.rpgRoomRotateHandle'))return;
  e.preventDefault();e.stopPropagation();
  const r=state.rooms.find(x=>x.id===el.dataset.roomId);if(!r)return;
  const board=$('board'),rect=board.getBoundingClientRect(),click=clientToBoardPercent(e.clientX,e.clientY,rect),ox=Number(r.x),oy=Number(r.y),grabOffset={x:click.x-ox,y:click.y-oy},previous={x:ox,y:oy};
  let latestX=ox,latestY=oy,finished=false,lastMoveBroadcast=0;el.classList.add('dragging');el.setPointerCapture?.(e.pointerId);
  const cleanup=()=>{if(finished)return;finished=true;try{el.releasePointerCapture?.(e.pointerId)}catch(_){}el.classList.remove('dragging');el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);};
  const move=ev=>{
    const p=clientToBoardPercent(ev.clientX,ev.clientY,rect),raw={x:p.x-grabOffset.x,y:p.y-grabOffset.y},snapped=window.rpgSnapPoint?window.rpgSnapPoint(raw.x,raw.y):raw;
    const constrained=constrainRoomPosition({...r,x:latestX,y:latestY},snapped.x,snapped.y);latestX=constrained.x;latestY=constrained.y;
    const now=performance.now();
    if(now-lastMoveBroadcast>30){lastMoveBroadcast=now;broadcastRoomMove({room_id:r.id,x:latestX,y:latestY}).catch(()=>{});}
    state.rooms=state.rooms.map(item=>item.id===r.id?{...item,x:latestX,y:latestY}:item);el.style.left=latestX+'%';el.style.top=latestY+'%';
  };
  const up=async()=>{cleanup();const {data,error}=await sb.from('rooms').update({x:latestX,y:latestY,updated_at:new Date().toISOString()}).eq('id',r.id).eq('updated_at',r.updated_at).select('*').maybeSingle();if(error||!data){state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);renderTable();toast(error?.message||'O cômodo não pôde ser localizado após o movimento.','error');return;}state.rooms=state.rooms.map(item=>item.id===r.id?data:item);await broadcastRoomMove({room_id:r.id,x:latestX,y:latestY});setSave('Cômodo reposicionado');};
  const cancel=()=>{cleanup();state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);renderTable();};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up,{once:true});el.addEventListener('pointercancel',cancel,{once:true});
}
function startRoomResize(e,el){
  if(!canEdit()||state.tool!=='move')return;
  e.preventDefault();e.stopPropagation();
  const r=state.rooms.find(x=>x.id===el.dataset.roomId);if(!r)return;
  const board=$('board'),rect=board.getBoundingClientRect(),sx=e.clientX,sy=e.clientY,ow=Number(r.width),oh=Number(r.height),previous={x:Number(r.x),y:Number(r.y),width:ow,height:oh};
  let latestW=ow,latestH=oh,latestX=previous.x,latestY=previous.y,finished=false,lastResizeBroadcast=0;el.setPointerCapture?.(e.pointerId);el.classList.add('resizing');
  const cleanup=()=>{if(finished)return;finished=true;try{el.releasePointerCapture?.(e.pointerId)}catch(_){}el.classList.remove('resizing');el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);};
  const move=ev=>{
    const rawW=Math.max(5,Math.min(90,ow+(ev.clientX-sx)/Math.max(1,rect.width)*100)),rawH=Math.max(5,Math.min(90,oh+(ev.clientY-sy)/Math.max(1,rect.height)*100)),snapped=window.rpgSnapSize?window.rpgSnapSize(rawW,rawH):{width:rawW,height:rawH};
    latestW=Math.max(5,Math.min(90,snapped.width));latestH=Math.max(5,Math.min(90,snapped.height));
    const constrained=constrainRoomPosition({...r,width:latestW,height:latestH},latestX,latestY);latestX=constrained.x;latestY=constrained.y;
    const now=performance.now();
    if(now-lastResizeBroadcast>30){lastResizeBroadcast=now;broadcastRoomResize({room_id:r.id,width:latestW,height:latestH,x:latestX,y:latestY}).catch(()=>{});}
    state.rooms=state.rooms.map(item=>item.id===r.id?{...item,width:latestW,height:latestH,x:latestX,y:latestY}:item);el.style.width=latestW+'%';el.style.height=latestH+'%';el.style.left=latestX+'%';el.style.top=latestY+'%';
  };
  const up=async()=>{cleanup();const {data,error}=await sb.from('rooms').update({width:latestW,height:latestH,x:latestX,y:latestY,updated_at:new Date().toISOString()}).eq('id',r.id).eq('updated_at',r.updated_at).select('*').maybeSingle();if(error||!data){state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);renderTable();toast(error?.message||'O cômodo não pôde ser localizado após redimensionar.','error');return;}state.rooms=state.rooms.map(item=>item.id===r.id?data:item);await broadcastRoomResize({room_id:r.id,width:latestW,height:latestH,x:latestX,y:latestY});setSave('Área do cômodo salva');};
  const cancel=()=>{cleanup();state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);renderTable();};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up,{once:true});el.addEventListener('pointercancel',cancel,{once:true});
}
function applyZoom(){
  const board=$('board');
  if(!board)return;
  const frame=board.closest('.boardFrame');
  const zoom=Math.max(75,Math.min(200,Number(state.zoom)||100));
  state.zoom=zoom;
  const factor=zoom/100;
  const baseHeight=window.matchMedia?.('(max-width:760px)').matches?460:650;
  let centerRatioX=0.5,centerRatioY=0.5;
  if(frame){
    const maxX=Math.max(1,frame.scrollWidth-frame.clientWidth),maxY=Math.max(1,frame.scrollHeight-frame.clientHeight);
    centerRatioX=(frame.scrollLeft+frame.clientWidth/2)/Math.max(1,frame.scrollWidth);
    centerRatioY=(frame.scrollTop+frame.clientHeight/2)/Math.max(1,frame.scrollHeight);
  }
  board.style.removeProperty('--board-zoom');
  board.style.transform='none';
  board.style.width='100%';
  board.style.height=baseHeight+'px';
  board.style.minWidth='0';
  board.style.minHeight='0';
  void board.offsetWidth;
  const baseWidth=Math.max(280,Math.round(board.getBoundingClientRect().width));
  board.dataset.rpgBaseWidth=String(baseWidth);
  board.style.width=Math.max(280,Math.round(baseWidth*factor))+'px';
  board.style.height=Math.round(baseHeight*factor)+'px';
  frame?.style.setProperty('--map-zoom',String(factor));
  $('zoomValue').textContent=zoom+'%';
  window.rpgVttRefreshGrid?.();
  window.rpgVttRefreshMapLayout?.();
  if(frame){
    requestAnimationFrame(()=>{
      frame.scrollLeft=Math.max(0,(frame.scrollWidth*centerRatioX)-frame.clientWidth/2);
      frame.scrollTop=Math.max(0,(frame.scrollHeight*centerRatioY)-frame.clientHeight/2);
    });
  }
}

function renderCharacters(){
  const grid=$('charactersGrid');
  $('characterFieldsBtn')?.classList.toggle('hidden',!canEdit());
  if(!state.characters.length){
    grid.innerHTML='<div class="emptyPanel">Ainda não existem personagens nesta campanha.<br><span>O primeiro personagem pode ser criado agora.</span></div>';
    return;
  }
  grid.innerHTML=state.characters.map(c=>{
    const p=profileFor(c.player_id), avatar=c.avatar_url||p?.avatar_url;
    return `<article class="dataCard"><div class="cardAvatar">${avatar?`<img src="${escapeHtml(avatar)}" alt="">`:'♙'}</div><div class="dataCardMain"><div class="cardKicker">${c.level!=null?'NÍVEL '+escapeHtml(c.level):'PERSONAGEM'}</div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.class_name||'—')} · ${escapeHtml(c.ancestry_name||'Sem origem definida')}</p><div class="miniStats"><span>HP <b>${c.hp_current??'—'}/${c.hp_max??'—'}</b></span><span>DEFESA <b>${c.armor_class??'—'}</b></span><span>SORTE <b>${c.luck??0}</b></span></div><small class="playerLine">Jogador: ${escapeHtml(p?.display_name || (c.player_id===state.user.id?'Você':'Jogador'))}</small></div><div class="cardActions"><button data-edit-character="${c.id}">Abrir ficha</button>${canEdit()?`<button class="softButton" data-add-char="${c.id}">${state.entities.some(e=>e.character_id===c.id)?'Na mesa':'Colocar na mesa'}</button>`:''}</div></article>`;
  }).join('');
  document.querySelectorAll('[data-edit-character]').forEach(b=>b.onclick=()=>openCharacterModal(b.dataset.editCharacter));
  document.querySelectorAll('[data-add-char]').forEach(b=>b.onclick=()=>addCharacterToBoard(b.dataset.addChar));
}

function renderWorld(){
  const floors=state.floors||[];
  const rooms=state.rooms||[];
  $('worldStats').innerHTML=`<div class="statsHead">
    <div><span>LOCAIS</span><b>${state.locations.length}</b></div>
    <div><span>ANDARES</span><b>${floors.length}</b></div>
    <div><span>CÔMODOS</span><b>${rooms.length}</b></div>
    <div><span>ENTIDADES</span><b>${state.entities.length}</b></div>
  </div>
  <div class="worldActionsCard">
    <div><span class="eyebrow">GERENCIAMENTO</span><b>Seu mundo continua salvo entre as sessões.</b><small>Crie locais, organize andares e edite cada cômodo sem precisar reconstruir a mesa.</small></div>
    ${canEdit()?'<button id="newLocationWorldBtn" class="primarySmall">+ Novo cenário</button>':''}
  </div>`;

  const locations=state.locations.map(l=>{
    const locationFloors=floors.filter(f=>f.location_id===l.id).sort((x,y)=>Number(x.sort_order)-Number(y.sort_order));
    return `<article class="worldLocationCard">
      <div class="worldLocationHeader">
        <div class="worldLocationIdentity">
          <div class="worldLocationIcon">${l.image_url?'<img src="'+escapeHtml(l.image_url)+'" alt="">':'◇'}</div>
          <div>
            <div class="eyebrow">${escapeHtml(l.location_type||'LOCAL')}</div>
            <h3>${escapeHtml(l.name)}</h3>
            <p>${escapeHtml(l.description||'Sem descrição')}</p>
          </div>
        </div>
        ${canEdit()?'<div class="worldActionGroup"><button class="softButton" data-edit-location="'+l.id+'">Editar local</button><button class="dangerGhost" data-delete-location="'+l.id+'">Excluir</button></div>':''}
      </div>
      ${l.notes?`<div class="worldNote"><span>ANOTAÇÕES DO MESTRE</span><p>${escapeHtml(l.notes)}</p></div>`:''}
      <div class="worldFloorSection">
        <div class="worldSubhead"><div><span class="eyebrow">ESTRUTURA</span><b>${locationFloors.length} andar(es)</b></div>${canEdit()?'<button class="textButton" data-new-floor="'+l.id+'">+ Novo andar</button>':''}</div>
        <div class="worldFloorList">
          ${locationFloors.map(f=>{
            const floorRooms=rooms.filter(r=>r.floor_id===f.id).sort((x,y)=>Number(x.sort_order)-Number(y.sort_order));
            return `<details class="worldFloorCard">
              <summary>
                <div><span class="floorIndex">#${Number(f.floor_number)===0?'T':Number(f.floor_number)}</span><span class="floorSummaryText"><b>${escapeHtml(f.name)}</b><small>${floorRooms.length} cômodo(s)${f.description?' · '+escapeHtml(f.description):''}</small></span></div>
                <div class="worldFloorActions">
                  <span class="roomCountBadge">${floorRooms.length}</span>
                  ${canEdit()?'<button type="button" class="miniAction" data-edit-floor="'+f.id+'">Editar</button><button type="button" class="miniAction danger" data-delete-floor="'+f.id+'">Excluir</button>':''}
                </div>
              </summary>
              ${f.notes?`<div class="worldNote compact"><span>ANOTAÇÕES</span><p>${escapeHtml(f.notes)}</p></div>`:''}
              <div class="worldRoomTools">${canEdit()?'<button class="softButton" data-new-room-floor="'+f.id+'">+ Novo cômodo</button>':''}<button class="softButton" data-open-floor="'+f.id+'">Abrir na mesa</button></div>
              <div class="worldRoomList">
                ${floorRooms.map(r=>`<div class="worldRoomCard">
                  <div class="worldRoomMain"><div class="roomMiniIcon">▧</div><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.description||'Sem descrição')}</small></div></div>
                  <div class="worldRoomMeta"><span>${Number(r.width).toFixed(1)} × ${Number(r.height).toFixed(1)}%</span><span>${Number(r.x).toFixed(1)}, ${Number(r.y).toFixed(1)}%</span><span>Rotação ${Number(r.rotation||0).toFixed(0)}°</span></div>
                  ${canEdit()?'<div class="worldRoomActions"><button class="miniAction" data-edit-room-world="'+r.id+'">Editar</button><button class="miniAction danger" data-delete-room-world="'+r.id+'">Excluir</button></div>':''}
                </div>`).join('')||'<div class="emptySelect">Nenhum cômodo neste andar.</div>'}
              </div>
            </details>`;
          }).join('')||'<div class="emptySelect">Nenhum andar neste local.</div>'}
        </div>
      </div>
    </article>`;
  }).join('');
  $('worldLocations').innerHTML=locations||'<div class="emptyPanel">Nenhum local cadastrado. Crie o primeiro local para começar a construir seu mundo.</div>';

  $('newLocationWorldBtn')?.addEventListener('click',openLocationCreateModal);
  document.querySelectorAll('[data-edit-location]').forEach(b=>b.onclick=()=>openLocationModal(b.dataset.editLocation));
  document.querySelectorAll('[data-delete-location]').forEach(b=>b.onclick=()=>openDeleteLocationModal(b.dataset.deleteLocation));
  document.querySelectorAll('[data-new-floor]').forEach(b=>b.onclick=()=>openFloorModal(null,b.dataset.newFloor));
  document.querySelectorAll('[data-edit-floor]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openFloorModal(b.dataset.editFloor);});
  document.querySelectorAll('[data-delete-floor]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openDeleteFloorModal(b.dataset.deleteFloor);});
  document.querySelectorAll('[data-new-room-floor]').forEach(b=>b.onclick=()=>openRoomModal(null,b.dataset.newRoomFloor));
  document.querySelectorAll('[data-edit-room-world]').forEach(b=>b.onclick=()=>openRoomModal(b.dataset.editRoomWorld));
  document.querySelectorAll('[data-delete-room-world]').forEach(b=>b.onclick=()=>deleteRoom(b.dataset.deleteRoomWorld));
  document.querySelectorAll('[data-open-floor]').forEach(b=>b.onclick=async e=>{e.preventDefault();e.stopPropagation();const floorId=b.dataset.openFloor;if(canEdit())await setActiveScene(floorId,null);else{state.floor=floorId;state.selected=null;state.view='table';renderAll();}});
}

function openLocationCreateModal(){
  if(!requireMaster())return;
  showModal(`<div class="modalHeader"><div><div class="eyebrow">MUNDO</div><h3>Novo local</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="formGrid">
      <label>Nome do local<input id="locName" maxlength="120" placeholder="Ex.: Castelo de Velador"></label>
      <label>Tipo<select id="locType"><option>Local</option><option>Cidade</option><option>Edifício</option><option>Dungeon</option><option>Região</option><option>Outro</option></select></label>
    </div>
    <label>Descrição <span class="optional">(opcional)</span><textarea id="locDesc" rows="4" placeholder="O que é este lugar?"></textarea></label>
    <label>Imagem <span class="optional">(opcional)</span><input id="locImage" placeholder="https://..."></label>
    <label>Anotações do mestre <span class="optional">(opcional)</span><textarea id="locNotes" rows="4" placeholder="Informações que ajudam a organizar este local."></textarea></label>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="createLocation" class="primarySmall">Criar local</button></div>`);
  $('createLocation').onclick=async()=>{
    try{
      const name=$('locName').value.trim();if(!name){toast('Informe o nome do local.','error');$('locName').focus();return;}
      const {data,error}=await sb.from('locations').insert({campaign_id:state.campaign.id,name,location_type:$('locType').value,description:$('locDesc').value.trim(),image_url:$('locImage').value.trim()||null,notes:$('locNotes').value.trim()||null,created_by:state.user.id,sort_order:state.locations.length}).select().maybeSingle();
      if(error)throw error;
      if(!data)throw new Error('O servidor não confirmou a criação do local.');
      state.locations.push(data);state.location=data;closeModal();renderAll();toast('Local criado');
    }catch(e){toast(e.message||'Não foi possível criar o local.','error');}
  };
}

function openLocationModal(id){
  if(!requireMaster())return;
  const l=state.locations.find(x=>x.id===id);if(!l)return;
  showModal(`<div class="modalHeader"><div><div class="eyebrow">LOCAL</div><h3>Editar local</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="formGrid">
      <label>Nome<input id="locName" maxlength="120" value="${escapeHtml(l.name)}"></label>
      <label>Tipo<select id="locType">${['Local','Cidade','Edifício','Dungeon','Região','Outro'].map(x=>`<option ${x===l.location_type?'selected':''}>${x}</option>`).join('')}</select></label>
    </div>
    <label>Descrição <span class="optional">(opcional)</span><textarea id="locDesc" rows="4">${escapeHtml(l.description||'')}</textarea></label>
    <label>Imagem <span class="optional">(opcional)</span><input id="locImage" value="${escapeHtml(l.image_url||'')}" placeholder="https://..."></label>
    <label>Anotações do mestre <span class="optional">(opcional)</span><textarea id="locNotes" rows="5">${escapeHtml(l.notes||'')}</textarea></label>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveLocation" class="primarySmall">Salvar alterações</button></div>`);
  $('saveLocation').onclick=async()=>{
    try{
      const name=$('locName').value.trim();if(!name){toast('Informe o nome do local.','error');return;}
      const {data,error}=await sb.from('locations').update({name,location_type:$('locType').value,description:$('locDesc').value.trim(),image_url:$('locImage').value.trim()||null,notes:$('locNotes').value.trim()||null}).eq('id',id).select().maybeSingle();
      if(error)throw error;if(!data)throw new Error('O servidor não confirmou a atualização do local.');state.locations=state.locations.map(x=>x.id===id?data:x);if(state.location?.id===id)state.location=data;closeModal();renderAll();toast('Local atualizado');
    }catch(e){toast(e.message||'Não foi possível atualizar o local.','error');}
  };
}

function openDeleteLocationModal(id){
  if(!requireMaster())return;
  const l=state.locations.find(x=>x.id===id);if(!l)return;
  const countFloors=state.floors.filter(f=>f.location_id===id).length;
  showModal(`<div class="modalHeader"><div><div class="eyebrow dangerEyebrow">EXCLUSÃO</div><h3>Excluir local</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="dangerPanel"><strong>Excluir este local remove toda a estrutura dele.</strong><p>${countFloors} andar(es) e os cômodos vinculados serão apagados. Esta ação não pode ser desfeita.</p></div>
    <label>Digite o nome do local para confirmar <span class="requiredMark">*</span><input id="deleteLocationName" placeholder="${escapeHtml(l.name)}" autocomplete="off"></label>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="confirmDeleteLocation" class="dangerButton" disabled>Excluir local</button></div>`);
  const input=$('deleteLocationName'),btn=$('confirmDeleteLocation');input.oninput=()=>btn.disabled=input.value.trim()!==l.name.trim();
  btn.onclick=async()=>{try{const {error}=await sb.from('locations').delete().eq('id',id);if(error)throw error;state.locations=state.locations.filter(x=>x.id!==id);state.floors=state.floors.filter(x=>x.location_id!==id);state.rooms=state.rooms.filter(r=>state.floors.some(f=>f.id===r.floor_id));state.location=state.locations[0]||null;state.floor=state.floors[0]?.id||null;closeModal();renderAll();toast('Local excluído');}catch(e){toast(e.message||'Não foi possível excluir o local.','error');}};
}

function readWorldNumber(id,label,min,max){
  const el=$(id);
  if(!el)throw new Error('Campo '+label+' não encontrado.');
  const raw=String(el.value??'').trim().replace(/\s+/g,'').replace(',','.');
  if(raw==='')throw new Error('Informe '+label+'.');
  const value=Number(raw);
  if(!Number.isFinite(value))throw new Error(label+' inválido. Use apenas números, por exemplo 20 ou 20,5.');
  if(min!==undefined&&value<min)throw new Error(label+' deve ser no mínimo '+min+'.');
  if(max!==undefined&&value>max)throw new Error(label+' deve ser no máximo '+max+'.');
  return Math.round(value*100)/100;
}
function readWorldInteger(id,label,min,max){
  const value=readWorldNumber(id,label,min,max);
  if(!Number.isInteger(value))throw new Error(label+' deve ser um número inteiro.');
  return value;
}

function openFloorModal(id,locationId){
  if(!requireMaster())return;
  const floor=id?state.floors.find(x=>x.id===id):null;
  const defaultLocation=locationId||floor?.location_id||currentLocation()?.id||state.locations[0]?.id;
  if(!defaultLocation){toast('Crie um local/cenário antes de adicionar um andar.','error');return;}
  const f=floor||{name:'Novo andar',floor_number:0,description:'',notes:'',location_id:defaultLocation,sort_order:state.floors.length};
  const locationOptions=state.locations.map(l=>`<option value="${l.id}" ${l.id===f.location_id?'selected':''}>${escapeHtml(l.name)}</option>`).join('');
  showModal(`<div class="modalHeader"><div><div class="eyebrow">MUNDO</div><h3>${floor?'Editar andar':'Novo andar'}</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="formGrid">
      <label>Nome do andar<input id="floorName" maxlength="120" value="${escapeHtml(f.name)}" placeholder="Ex.: Subsolo"></label>
      <label>Número<input id="floorNum" type="number" inputmode="numeric" min="-50" max="100" step="1" value="${Number(f.floor_number)}"></label>
      <label>Local<select id="floorLocation">${locationOptions}</select></label>
    </div>
    <label>Descrição <span class="optional">(opcional)</span><textarea id="floorDesc" rows="4">${escapeHtml(f.description||'')}</textarea></label>
    <label>Anotações do mestre <span class="optional">(opcional)</span><textarea id="floorNotes" rows="4">${escapeHtml(f.notes||'')}</textarea></label>
    <div class="modalHint">O número do andar aceita valores negativos para subsolos.</div>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveFloor" class="primarySmall">${floor?'Salvar alterações':'Criar andar'}</button></div>`);
  $('saveFloor').onclick=async()=>{
    try{
      const name=$('floorName').value.trim();if(!name){toast('Informe o nome do andar.','error');$('floorName').focus();return;}
      const selectedLocation=$('floorLocation').value;
      if(!selectedLocation){toast('Selecione o local/cenário do andar.','error');$('floorLocation').focus();return;}
      const floorNumber=readWorldInteger('floorNum','Número do andar',-50,100);
      const payload={location_id:selectedLocation,name,floor_number:floorNumber,description:$('floorDesc').value.trim(),notes:$('floorNotes').value.trim()||null,sort_order:floor?.sort_order??state.floors.filter(x=>x.location_id===selectedLocation).length};
      const result=f?await sb.from('floors').update(payload).eq('id',f.id).select().maybeSingle():await sb.from('floors').insert(payload).select().maybeSingle();
      if(result.error)throw result.error;
      if(!result.data)throw new Error('O servidor não confirmou o andar.');
      if(f)state.floors=state.floors.map(x=>x.id===f.id?result.data:x);else state.floors.push(result.data);
      state.floor=result.data.id;state.location=state.locations.find(x=>x.id===selectedLocation)||state.location;closeModal();renderAll();toast(floor?'Andar atualizado':'Andar criado');
    }catch(e){toast(e.message||'Não foi possível salvar o andar.','error');}
  };
}

function openDeleteFloorModal(id){
  if(!requireMaster())return;
  const f=state.floors.find(x=>x.id===id);if(!f)return;
  const roomCount=state.rooms.filter(r=>r.floor_id===id).length;
  showModal(`<div class="modalHeader"><div><div class="eyebrow dangerEyebrow">EXCLUSÃO</div><h3>Excluir andar</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="dangerPanel"><strong>${escapeHtml(f.name)} será removido.</strong><p>${roomCount} cômodo(s) vinculado(s) também serão excluídos. Esta ação não pode ser desfeita.</p></div>
    <label>Digite o nome do andar para confirmar <span class="requiredMark">*</span><input id="deleteFloorName" placeholder="${escapeHtml(f.name)}"></label>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="confirmDeleteFloor" class="dangerButton" disabled>Excluir andar</button></div>`);
  const input=$('deleteFloorName'),btn=$('confirmDeleteFloor');input.oninput=()=>btn.disabled=input.value.trim()!==f.name.trim();
  btn.onclick=async()=>{try{const {error}=await sb.from('floors').delete().eq('id',id);if(error)throw error;state.floors=state.floors.filter(x=>x.id!==id);state.rooms=state.rooms.filter(r=>r.floor_id!==id);if(state.floor===id)state.floor=state.floors[0]?.id||null;closeModal();renderAll();toast('Andar excluído');}catch(e){toast(e.message||'Não foi possível excluir o andar.','error');}};
}

function openRoomModal(id,floorId){
  if(!requireMaster())return;
  if(!state.floors.length){toast('Crie um andar primeiro para adicionar um cômodo/cenário à mesa.','error');return;}
  const room=id?state.rooms.find(x=>x.id===id):null;
  const g=window.__roomGeom;
  const selectedFloor=floorId||state.floor||state.floors[0]?.id;
  const r=room||{name:'Novo cômodo',description:'',notes:'',image_url:'',x:g?.x??20,y:g?.y??20,width:g?.width??30,height:g?.height??25,rotation:0,floor_id:selectedFloor};
  const floorOptions=state.floors.map(f=>`<option value="${f.id}" ${f.id===r.floor_id?'selected':''}>${escapeHtml(f.name)}</option>`).join('');
  showModal(`<div class="modalHeader"><div><div class="eyebrow">MUNDO · CENÁRIO</div><h3>${room?'Editar cômodo':'Novo cômodo do cenário'}</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="formGrid">
      <label>Nome<input id="roomName" maxlength="120" value="${escapeHtml(r.name)}" placeholder="Ex.: Salão principal"></label>
      <label>Andar<select id="roomFloor">${floorOptions}</select></label>
      <label>Posição X %<input id="roomX" type="text" inputmode="decimal" value="${r.x}" placeholder="20 ou 20,5"></label>
      <label>Posição Y %<input id="roomY" type="text" inputmode="decimal" value="${r.y}" placeholder="20 ou 20,5"></label>
      <label>Largura %<input id="roomW" type="text" inputmode="decimal" value="${r.width}" placeholder="30 ou 30,5"></label>
      <label>Altura %<input id="roomH" type="text" inputmode="decimal" value="${r.height}" placeholder="25 ou 25,5"></label>
      <label>Rotação °<input id="roomRotation" type="text" inputmode="decimal" value="${Number(r.rotation||0)}" placeholder="Ex.: 45"></label>
    </div>
    <label>Descrição <span class="optional">(opcional)</span><textarea id="roomDesc" rows="4">${escapeHtml(r.description||'')}</textarea></label>
    <label>Imagem do cômodo <span class="optional">(opcional)</span><input id="roomImage" value="${escapeHtml(r.image_url||'')}" placeholder="https://..."></label>
    <label>Anotações do mestre <span class="optional">(opcional)</span><textarea id="roomNotes" rows="4">${escapeHtml(r.notes||'')}</textarea></label>
    <div class="rotationPresets"><span>Atalhos</span><button type="button" data-room-rotation="0">0°</button><button type="button" data-room-rotation="15">15°</button><button type="button" data-room-rotation="30">30°</button><button type="button" data-room-rotation="45">45°</button><button type="button" data-room-rotation="-45">−45°</button><button type="button" data-room-rotation="90">90°</button></div>
    <div class="modalHint">Use ponto ou vírgula nos valores decimais. A rotação permite criar cômodos diagonais, por exemplo <strong>45°</strong>. A posição e o tamanho também podem ser ajustados diretamente na mesa visual.</div>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveRoom" class="primarySmall">Salvar cômodo</button></div>`);
  document.querySelectorAll('[data-room-rotation]').forEach(b=>b.onclick=()=>{$('roomRotation').value=b.dataset.roomRotation;});
  $('saveRoom').onclick=async()=>{
    try{
      const name=$('roomName').value.trim();if(!name){toast('Informe o nome do cômodo.','error');$('roomName').focus();return;}
      const selectedFloor=$('roomFloor').value;
      if(!selectedFloor){toast('Selecione o andar do cômodo.','error');$('roomFloor').focus();return;}
      const x=readWorldNumber('roomX','Posição X',0,100);
      const y=readWorldNumber('roomY','Posição Y',0,100);
      const width=readWorldNumber('roomW','Largura',5,95);
      const height=readWorldNumber('roomH','Altura',5,90);
      const rotation=readWorldNumber('roomRotation','Rotação',-180,180);
      const payload={floor_id:selectedFloor,name,description:$('roomDesc').value.trim(),image_url:$('roomImage').value.trim()||null,notes:$('roomNotes').value.trim()||null,x,y,width,height,rotation};
      const roomId=room?.id||uid();const result=room?await sb.from('rooms').update(payload).eq('id',room.id).select('*').maybeSingle():await sb.from('rooms').insert({...payload,id:roomId,sort_order:state.rooms.filter(x=>x.floor_id===selectedFloor).length}).select('*').maybeSingle();
      if(result.error)throw result.error;
      if(!result.data){const verify=await sb.from('rooms').select('*').eq('id',room?.id||roomId).maybeSingle();if(verify.error)throw verify.error;if(!verify.data)throw new Error('O cômodo foi salvo, mas não pôde ser lido de volta.');result.data=verify.data;}
      if(room)state.rooms=state.rooms.map(x=>x.id===room.id?result.data:x);else state.rooms.push(result.data);
      if(room && Number(room.rotation||0)!==Number(result.data.rotation||0))await broadcastRoomRotate({room_id:result.data.id,rotation:Number(result.data.rotation||0)});
      state.floor=result.data.floor_id;state.location=state.locations.find(l=>state.floors.find(f=>f.id===result.data.floor_id)?.location_id===l.id)||state.location;state.selected={type:'room',id:result.data.id};closeModal();renderAll();setSave('Cômodo salvo');toast(room?'Cômodo atualizado':'Cômodo criado');
    }catch(e){toast(e.message||'Não foi possível salvar o cômodo.','error');}
  };
}

function renderSessions(){
  $('sessionsList').innerHTML=state.sessions.map(s=>`<article class="sessionCard"><div><div class="sessionNumber">SESSÃO #${s.session_number}</div><h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.summary||'Sem resumo')}</p><small>${fmtDate(s.starts_at)}</small>${s.history?'<small class="sessionHistoryHint">Histórico registrado</small>':'<small class="sessionHistoryHint muted">Histórico ainda não registrado</small>'}</div><div class="sessionStatus"><span class="status ${s.status}">${s.status}</span><div class="sessionCardActions"><button data-session-open="${s.id}">Abrir</button><button class="softButton" data-session-history="${s.id}">Histórico</button>${canEdit()?`<button class="softButton" data-session-edit="${s.id}">Editar</button><button class="dangerGhost" data-session-delete="${s.id}">Excluir</button>`:''}</div></div></article>`).join('') || '<div class="emptyPanel">Nenhuma sessão cadastrada.</div>';
  document.querySelectorAll('[data-session-open]').forEach(b=>b.onclick=async()=>{await activateSession(b.dataset.sessionOpen);});
  document.querySelectorAll('[data-session-history]').forEach(b=>b.onclick=()=>openSessionHistoryModal(b.dataset.sessionHistory));
  document.querySelectorAll('[data-session-edit]').forEach(b=>b.onclick=()=>openSessionModal(b.dataset.sessionEdit));
  document.querySelectorAll('[data-session-delete]').forEach(b=>b.onclick=()=>openDeleteSessionModal(b.dataset.sessionDelete));
}

function openSessionHistoryModal(id){
  const session=state.sessions.find(x=>x.id===id);if(!session)return;
  const history=session.history?.trim()||'O mestre ainda não registrou o que aconteceu nesta sessão.';
  showModal('<div class="modalHeader"><div><div class="eyebrow">MEMÓRIA DA AVENTURA</div><h3>Histórico da Sessão #'+escapeHtml(session.session_number)+' · '+escapeHtml(session.title)+'</h3></div><button class="closeButton" data-close>×</button></div>' +
    '<div class="sessionHistoryMeta"><span>'+escapeHtml(fmtDate(session.starts_at))+'</span><span class="status '+escapeHtml(session.status)+'">'+escapeHtml(session.status)+'</span></div>' +
    '<article class="sessionHistoryContent">'+escapeHtml(history)+'</article>' +
    '<div class="modalActions"><button class="primarySmall" data-close>Fechar</button></div>');
}
function openDeleteSessionModal(id){
  if(!canEdit())return;
  const session=state.sessions.find(x=>x.id===id); if(!session)return;
  showModal(`<div class="modalHeader"><div><div class="eyebrow dangerEyebrow">EXCLUSÃO</div><h3>Excluir sessão</h3></div><button class="closeButton" data-close>×</button></div><div class="dangerPanel"><strong>Esta ação não pode ser desfeita.</strong><p>A sessão será removida permanentemente. O histórico de rolagens associado também será apagado.</p></div><label>Digite o nome da sessão para confirmar <span class="requiredMark">*</span><input id="deleteSessionName" autocomplete="off" placeholder="${escapeHtml(session.title)}"></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="confirmDeleteSession" class="dangerButton" disabled>Excluir sessão</button></div>`);
  const input=$('deleteSessionName'),btn=$('confirmDeleteSession');
  const sync=()=>{btn.disabled=input.value.trim()!==session.title.trim();};
  input.addEventListener('input',sync);
  btn.onclick=async()=>{
    if(input.value.trim()!==session.title.trim())return;
    btn.disabled=true;
    try{const {error}=await sb.from('sessions').delete().eq('id',session.id);if(error)throw error;state.sessions=state.sessions.filter(x=>x.id!==session.id);if(state.selectedSessionId===session.id)state.selectedSessionId=currentSession()?.id||null;closeModal();await subscribeRealtime();renderAll();toast('Sessão excluída');}
    catch(e){btn.disabled=false;toast(e.message||'Não foi possível excluir a sessão.','error');}
  };
}
function renderChronicle(){
  const nav=$('chronicleNav'),mobileNav=$('mobileChronicleNav');
  nav?.classList.toggle('hidden',!canEdit());mobileNav?.classList.toggle('hidden',!canEdit());
  if(!canEdit()){if(state.view==='chronicle')state.view='table';return;}
  const field=$('chronicleContent');
  if(field)field.value=state.campaignChronicle?.content||'';
  const meta=$('chronicleMeta');
  if(meta){const updated=state.campaignChronicle?.updated_at;meta.textContent=updated?'Última edição · '+fmtDate(updated):'Ainda sem registros';}
  const save=$('saveChronicle');
  if(save)save.onclick=saveCampaignChronicle;
  if(field && !field.dataset.hotkey){field.dataset.hotkey='1';field.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveCampaignChronicle();}});}
}

async function saveCampaignChronicle(){
  if(!canEdit()||!state.campaign)return;
  const field=$('chronicleContent');if(!field)return;
  const save=$('saveChronicle');
  try{
    save?.setAttribute('disabled','disabled');if(save)save.textContent='Salvando…';
    const payload={campaign_id:state.campaign.id,content:field.value,updated_by:state.user.id,updated_at:new Date().toISOString()};
    const result=state.campaignChronicle?.campaign_id===state.campaign.id
      ?await sb.from('campaign_chronicles').update({content:payload.content,updated_by:payload.updated_by}) .eq('campaign_id',state.campaign.id).select('*').maybeSingle()
      :await sb.from('campaign_chronicles').insert(payload).select('*').maybeSingle();
    if(result.error)throw result.error;
    if(!result.data)throw new Error('O servidor não confirmou a crônica.');
    state.campaignChronicle=result.data;
    renderChronicle();
    setSave('Crônica da mesa salva');toast('História da mesa salva');
  }catch(e){toast(e.message||'Não foi possível salvar a crônica.','error');}
  finally{save?.removeAttribute('disabled');if(save)save.textContent='Salvar crônica';}
}

function renderNpcs(){
  $('npcsGrid').innerHTML=state.npcs.map(n=>`<article class="dataCard"><div class="cardAvatar npc">${n.avatar_url?`<img src="${escapeHtml(n.avatar_url)}" alt="">`:'♜'}</div><div class="dataCardMain"><div class="cardKicker">NPC / MONSTRO</div><h3>${escapeHtml(n.name)}</h3><p>${escapeHtml(n.description||'Sem descrição')}</p><small class="privateNote">Anotação do mestre: ${escapeHtml(n.notes_private||'—')}</small></div><div class="cardActions"><button data-edit-npc="${n.id}">Editar</button>${canEdit()?`<button class="softButton" data-add-npc="${n.id}">${state.entities.some(e=>e.npc_id===n.id)?'Na mesa':'Colocar na mesa'}</button>`:''}</div></article>`).join('') || '<div class="emptyPanel">Nenhum NPC ou monstro cadastrado.</div>';
  document.querySelectorAll('[data-edit-npc]').forEach(b=>b.onclick=()=>openNpcModal(b.dataset.editNpc));document.querySelectorAll('[data-add-npc]').forEach(b=>b.onclick=()=>addNpcToBoard(b.dataset.addNpc));
}
function renderDice(){
  const active=currentSession();
  const history=$('masterDashboardRollHistory');
  if(history && canEdit()){
    history.innerHTML=state.rolls.map(r=>{
      const roller=r.roller_display_name||profileFor(r.roller_user_id)?.display_name||'Jogador';
      const character=state.characters.find(c=>c.id===r.character_id);
      const session=state.sessions.find(s=>s.id===r.session_id);
      const values=Array.isArray(r.base_results)?r.base_results.join(' · '):'—';
      const modifier=Number(r.rule_results?.modifier||0);
      const modifierText=modifier?' '+(modifier>0?'+':'')+modifier:'';
      const sessionText=session?'Sessão #'+session.session_number:'Sem sessão';
      return '<article class="masterDashboardRoll"><div class="masterDashboardRollMain"><div class="masterDashboardRollTop"><b>'+escapeHtml(roller)+'</b><strong>'+escapeHtml(r.final_result)+'</strong></div><small>'+escapeHtml(character?.name||'Sem personagem')+' · '+escapeHtml(sessionText)+'</small><span>'+escapeHtml(r.notation||'Rolagem')+' · dados: '+escapeHtml(values)+escapeHtml(modifierText)+'</span><em>'+escapeHtml(fmtDate(r.created_at))+'</em></div></article>';
    }).join('')||'<div class="masterDashboardEmpty">Nenhuma rolagem registrada nesta campanha.</div>';
  }
  const activeAudio=$('masterDashboardAudio');
  if(activeAudio && canEdit()) activeAudio.innerHTML=audioPanel(active);
  const playerAudio=$('sessionAudioCard');
  if(playerAudio) playerAudio.innerHTML=canEdit()?'':audioPanel(active);
  setTimeout(wireAudioControls,0);
}
function renderDiceResult(payload){
  if(!payload)return;
  const results=(payload.base_results||[]).map((n,i)=>`<span class="dieResultChip"><small>dado ${i+1}</small><b>${n}</b></span>`).join("");
  $("bigRoll").textContent=payload.final_result;
  $("rollBreakdown").innerHTML=`<div class="rollBreakdownHead"><b>${escapeHtml(payload.notation)}</b><span>${escapeHtml(payload.rule_results?.label||"Normal")}</span></div><div class="dieResults">${results||'<span class="muted">Sem resultados individuais.</span>'}</div><div class="rollSummary">Total <strong>${payload.final_result}</strong>${Number(payload.rule_results?.modifier||0)?`<small>modificador ${payload.rule_results.modifier>0?"+":""}${payload.rule_results.modifier}</small>`:""}</div>`;
  $("rollResult").innerHTML=`<span>${escapeHtml(payload.notation)}</span><b>${payload.final_result}</b>`;
}
function audioKindLabel(kind){return ({music:'Música',ambient:'Ambiente',effect:'Efeito',voice:'Voz',other:'Outro'})[kind]||'Áudio';}
function audioLayerMarkup(){
  const layers=[...state.audioLayers.values()];
  if(!layers.length)return '<div class="audioEmpty">Nenhuma camada tocando agora.<small>Ambiente, música e efeitos podem tocar juntos.</small></div>';
  return layers.map(layer=>`<div class="audioLayerRow" data-layer-id="${layer.layerId}">
    <div class="audioLayerIcon ${escapeHtml(layer.kind||'other')}">${layer.kind==='effect'?'✦':layer.kind==='ambient'?'♧':layer.kind==='voice'?'◉':'♫'}</div>
    <div class="audioLayerInfo"><b>${escapeHtml(layer.name||'Áudio')}</b><small>${escapeHtml(audioKindLabel(layer.kind))}${layer.loop?' · loop':''}</small></div>
    <input class="audioLayerVolume" type="range" min="0" max="1" step="0.05" value="${Number(layer.volume??0.75)}">
    ${layer.asset_id?'<button class="audioLayerEdit" type="button" title="Editar áudio">✎</button>':''}
    ${layer.status==='paused'?'<button class="audioLayerResume" type="button" title="Retomar camada">▶</button>':'<button class="audioLayerPause" type="button" title="Pausar camada">Ⅱ</button>'}<button class="audioLayerStop" type="button" title="Parar camada">■</button>
  </div>`).join('');
}

function audioPanel(){
  if(!canEdit())return `<div class="audioCard audioPlayerCard"><div class="audioCardTop"><div><div class="eyebrow">SOM DA SESSÃO</div><h3>Áudio sincronizado</h3><p>O mestre controla o som da campanha. Todos os jogadores ouvem as mesmas camadas e recebem as alterações em tempo real.</p></div></div><button id="enableAudioBtn" class="primarySmall">${state.audioEnabled?'Áudio ativo':'Ativar áudio da campanha'}</button><div class="activeAudioLayers">${audioLayerMarkup()}</div></div>`;
  return `<div class="audioCard audioMixerCard"><div class="audioCardTop"><div><div class="eyebrow">PAINEL DO MESTRE</div><h3>Mixer da mesa</h3><p>Use várias camadas ao mesmo tempo. Música, ambientes e efeitos são transmitidos para todos os jogadores.</p></div><span class="audioLayerCount">${state.audioLayers.size} ativa${state.audioLayers.size===1?'':'s'}</span></div><div class="activeAudioLayers">${audioLayerMarkup()}</div><div class="audioForm"><div class="audioFieldRow"><label>Nome do áudio<input id="audioName" maxlength="120" placeholder="Ex.: Floresta à noite"></label><label>Tipo<select id="audioKind"><option value="ambient">Ambiente · contínuo</option><option value="music">Música · loop</option><option value="effect">Efeito · uma vez</option><option value="voice">Voz · uma vez</option><option value="other">Outro</option></select></label></div><input id="audioUrl" placeholder="https://.../audio.mp3"><div class="audioUploadHint">Até <strong>50 MB</strong> no projeto atual. Arquivos grandes usam upload resumível automaticamente.</div><input id="audioFile" type="file" accept="audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm"><div class="audioActions"><label class="audioVolumeField">Volume<input id="audioVolume" type="range" min="0" max="1" step="0.05" value="0.75"></label><label class="audioSaveToggle"><input id="audioSaveLibrary" type="checkbox" checked> Salvar na biblioteca</label><button id="playAudioBtn" class="primarySmall">▶ Tocar camada</button></div></div><div class="audioQuickActions"><button id="openAudioLibraryBtn" class="softButton">Biblioteca & playlists</button><button id="stopAllAudioBtn" class="softButton dangerAudioButton">■ Parar tudo</button></div></div>`;
}
function getAudioStoragePath(asset){
  if(asset?.storage_path)return asset.storage_path;
  const marker='/storage/v1/object/public/rpg-media/';
  const url=String(asset?.url||'');
  const i=url.indexOf(marker);
  if(i<0)return null;
  try{return decodeURIComponent(url.slice(i+marker.length));}catch(e){return url.slice(i+marker.length);}
}
async function deleteAudioStorageFile(asset){
  const path=getAudioStoragePath(asset);
  if(!path)return;
  const {error}=await sb.storage.from('rpg-media').remove([path]);
  if(error)throw error;
}
async function saveAudioAsset(asset){
  if(!asset.name)asset.name=audioKindLabel(asset.kind);
  const {data,error}=await sb.from('audio_assets').insert({
    campaign_id:state.campaign.id,name:asset.name,kind:asset.kind,url:asset.url,loop:asset.loop,
    default_volume:asset.volume,created_by:state.user.id,storage_path:asset.storagePath||null
  }).select().maybeSingle();
  if(error)throw error; if(!data)throw new Error('O áudio não foi confirmado pelo servidor.');
  state.audioAssets=[...state.audioAssets,data];
  return data;
}
async function openEditAudioAssetModal(id){
  if(!canEdit())return;
  const asset=state.audioAssets.find(x=>x.id===id);if(!asset)return;
  showModal(`<div class="modalHeader"><div><div class="eyebrow">BIBLIOTECA DE ÁUDIO</div><h3>Editar áudio</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="formGrid">
      <label>Nome<input id="editAudioName" maxlength="120" value="${escapeHtml(asset.name)}"></label>
      <label>Tipo<select id="editAudioKind">${['ambient','music','effect','voice','other'].map(k=>`<option value="${k}" ${k===asset.kind?'selected':''}>${escapeHtml(audioKindLabel(k))}</option>`).join('')}</select></label>
    </div>
    <label>URL do áudio<input id="editAudioUrl" value="${escapeHtml(asset.url)}"></label>
    <label>Novo arquivo <span class="optional">(opcional — substitui o arquivo atual)</span><input id="editAudioFile" type="file" accept="audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm"></label>
    <div class="configToggleGrid"><label><input id="editAudioLoop" type="checkbox" ${asset.loop?'checked':''}> Reproduzir em loop</label><label>Volume padrão<input id="editAudioVolume" type="range" min="0" max="1" step="0.05" value="${Number(asset.default_volume??0.75)}"></label></div>
    <p class="modalHint">Substituir o arquivo mantém o mesmo áudio nas playlists e atualiza o arquivo armazenado.</p>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveEditedAudio" class="primarySmall">Salvar alterações</button></div>`);
  $('saveEditedAudio').onclick=async()=>{
    try{
      const name=$('editAudioName').value.trim();if(!name){toast('Informe o nome do áudio.','error');return;}
      let url=$('editAudioUrl').value.trim(),storagePath=asset.storage_path||getAudioStoragePath(asset)||null;
      const file=$('editAudioFile').files[0];
      if(file){url=await uploadMedia(file,'audio');storagePath=uploadMedia.lastPath||null;}
      if(!url)throw new Error('Informe uma URL ou selecione um arquivo.');
      const oldPath=getAudioStoragePath(asset);
      const payload={name,kind:$('editAudioKind').value,url,loop:$('editAudioLoop').checked,default_volume:Number($('editAudioVolume').value)||0.75,storage_path:storagePath};
      const {data,error}=await sb.from('audio_assets').update(payload).eq('id',id).select().maybeSingle();
      if(error)throw error; if(!data)throw new Error('O áudio foi alterado ou removido em outra sessão.');
      if(file&&oldPath&&oldPath!==storagePath){try{await sb.storage.from('rpg-media').remove([oldPath]);}catch(e){console.warn('Arquivo anterior não pôde ser removido',e);}}
      for(const [layerId,layer] of state.audioLayers.entries()){if(layer.asset_id===id)await stopAudioLayer(layerId,{broadcast:true});}
      state.audioAssets=state.audioAssets.map(x=>x.id===id?data:x);
      closeModal();openAudioLibraryModal();toast('Áudio atualizado');
    }catch(e){toast(e.message||'Não foi possível editar o áudio.','error');}
  };
}
async function deleteAudioAsset(id){
  if(!canEdit())return;
  const asset=state.audioAssets.find(x=>x.id===id);if(!asset)return;
  const usedIn=state.audioPlaylists.filter(p=>state.audioPlaylistItems.some(i=>i.playlist_id===p.id&&i.audio_asset_id===id));
  if(!confirm(`Excluir "${asset.name}" definitivamente? Isso também remove o áudio de ${usedIn.length} playlist(s) e apaga o arquivo armazenado quando ele foi enviado para o RPG HUB.`))return;
  try{
    await deleteAudioStorageFile(asset).catch(e=>{if(getAudioStoragePath(asset))throw e;});
    for(const [layerId,layer] of state.audioLayers.entries()){if(layer.asset_id===id)await stopAudioLayer(layerId,{broadcast:true});}
    const {error}=await sb.from('audio_assets').delete().eq('id',id);if(error)throw error;
    state.audioPlaylistItems=state.audioPlaylistItems.filter(i=>i.audio_asset_id!==id);
    state.audioAssets=state.audioAssets.filter(x=>x.id!==id);
    closeModal();renderDice();openAudioLibraryModal();toast('Áudio excluído definitivamente');
  }catch(e){toast(e.message||'Não foi possível excluir o áudio.','error');}
}

function audioPlayerId(){return 'layer_'+Date.now()+'_'+Math.random().toString(36).slice(2,8);}
function getPersistedAudioLayers(){
  const raw=state.campaignAudioState?.layers;
  return Array.isArray(raw)?raw:[];
}
function serializeActiveAudioLayers(){
  return [...state.audioLayers.values()].map(layer=>({
    layer_id:layer.layerId,
    url:layer.url,
    name:layer.name||'Áudio',
    kind:layer.kind||'other',
    loop:!!layer.loop,
    status:layer.status||'playing',
    position:Number(layer.status==='paused'?layer.position:audioElapsed(layer)),
    volume:Number(layer.volume??0.75),
    asset_id:layer.asset_id||null,
    playlist_id:layer.playlist_id||null,
    started_at:layer.started_at||new Date().toISOString(),
    start_offset:Number(layer.start_offset||0)
  }));
}
async function persistAudioStateNow(){
  if(!canEdit()||!state.campaign)return;
  const layers=serializeActiveAudioLayers();
  const {data,error}=await sb.from('campaign_audio_state').upsert({
    campaign_id:state.campaign.id,
    layers,
    updated_by:state.user.id,
    updated_at:new Date().toISOString()
  },{onConflict:'campaign_id'}).select('*').maybeSingle();
  if(!error&&!data){
    const {data:verified,error:verifyError}=await sb.from('campaign_audio_state').select('*').eq('campaign_id',state.campaign.id).maybeSingle();
    if(verifyError)throw verifyError;
    state.campaignAudioState=verified||null;
    return verified||null;
  }
  if(error)throw error;
  state.campaignAudioState=data;
}
function scheduleAudioStatePersist(){
  if(!canEdit())return;
  clearTimeout(window.__audioPersistTimer);
  window.__audioPersistTimer=setTimeout(()=>persistAudioStateNow().catch(e=>console.warn('Falha ao persistir estado do áudio',e)),300);
}
function audioElapsed(layer){
  if(layer?.status==='paused')return Math.max(0,Number(layer.position||0));
  const started=layer?.started_at?new Date(layer.started_at).getTime():Date.now();
  const offset=Number(layer?.start_offset||0);
  return Math.max(0,(Date.now()-started)/1000)+offset;
}
let __audioDriftTimer=null;
function startAudioDriftSync(){
  clearInterval(__audioDriftTimer);
  if(!state.campaign)return;
  __audioDriftTimer=setInterval(async()=>{
    if(!state.audioEnabled||!state.campaign)return;
    const desired=getPersistedAudioLayers();
    for(const layer of desired){
      const local=state.audioLayers.get(layer.layer_id);
      if(!local?.audio||local.status==='paused')continue;
      const expected=audioElapsed(layer);
      const actual=Number(local.audio.currentTime)||0;
      const drift=expected-actual;
      if(Math.abs(drift)>0.6){
        try{local.audio.currentTime=Math.max(0,expected);local.position=expected;state.audioLayers.set(layer.layer_id,local);}catch(e){}
      }
    }
  },5000);
}
function stopAudioDriftSync(){clearInterval(__audioDriftTimer);__audioDriftTimer=null;}

async function syncPersistedAudioState(opts={}){
  if(!state.audioEnabled||!state.campaign)return;
  const desired=getPersistedAudioLayers();
  const desiredIds=new Set(desired.map(layer=>layer.layer_id));
  for(const layerId of [...state.audioLayers.keys()]){
    if(!desiredIds.has(layerId))await stopAudioLayer(layerId,{broadcast:false});
  }
  await Promise.all(desired.map(async layer=>{
    const current=audioElapsed(layer);
    const local=state.audioLayers.get(layer.layer_id);
    if(!local){
      await playAudioLayer({
        action:'play-layer',
        layer_id:layer.layer_id,url:layer.url,name:layer.name,kind:layer.kind,loop:layer.loop,
        volume:layer.volume,asset_id:layer.asset_id,playlist_id:layer.playlist_id,
        current_time:current,started_at:layer.started_at,start_offset:layer.start_offset
      },{broadcast:false,restored:true});
      return;
    }
    const volume=Math.max(0,Math.min(1,Number(layer.volume??0.75)));
    local.volume=volume;if(local.audio)local.audio.volume=volume;
    const drift=Math.abs((Number(local.audio?.currentTime)||0)-current);
    if(drift>1.5&&local.audio){try{local.audio.currentTime=Math.max(0,current);}catch(e){}}
    state.audioLayers.set(layer.layer_id,local);
  }));
  renderDice();
}
async function restoreCampaignAudioState(){
  if(!state.audioEnabled||!state.campaign)return;
  const layers=getPersistedAudioLayers();
  if(!layers.length)return;
  await Promise.all(layers.map(layer=>{
    const current=audioElapsed(layer);
    return playAudioLayer({
      action:'play-layer',
      layer_id:layer.layer_id,
      url:layer.url,
      name:layer.name,
      kind:layer.kind,
      loop:layer.loop,
      volume:layer.volume,
      asset_id:layer.asset_id,
      playlist_id:layer.playlist_id,
      current_time:current,
      started_at:layer.started_at,
      start_offset:layer.start_offset
    },{broadcast:false,restored:true}).catch(e=>console.warn('Não foi possível restaurar',layer.name,e));
  }));
}
async function unlockAudio(){
  const wasEnabled=state.audioEnabled;
  state.audioEnabled=true;
  try{
    const silent=new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQAAAAA=');
    silent.muted=true;
    await silent.play().catch(()=>{});
    silent.pause();
    silent.src='';
  }catch(e){console.warn('Audio unlock failed',e);}
  if(!canEdit()&&!wasEnabled)await restoreCampaignAudioState();
  if(!canEdit())await syncPersistedAudioState({broadcast:false});
  renderDice();
}

async function playAudioLayer(payload,opts={}){
  const broadcast=opts.broadcast!==false;
  if(!state.audioEnabled&&!canEdit())return;
  if(payload.action==='stop-layer'){await stopAudioLayer(payload.layer_id,{broadcast});return;}
  if(payload.action==='pause-layer'){await pauseAudioLayer(payload.layer_id,{broadcast});return;}
  if(payload.action==='resume-layer'){await resumeAudioLayer(payload.layer_id,{broadcast});return;}
  if(!payload.url)throw new Error('Este áudio não possui uma URL válida.');
  state.audioEnabled=true;
  if(payload.target_user_id&&payload.target_user_id!==state.user.id)return;

  const layerId=payload.layer_id||audioPlayerId();
  const old=state.audioPlayers.get(layerId);
  if(old){try{old.pause();old.currentTime=0;}catch(e){}state.audioPlayers.delete(layerId);state.audioLayers.delete(layerId);}

  const audio=new Audio(payload.url);
  audio.preload='auto';
  audio.loop=payload.loop!==undefined?!!payload.loop:['music','ambient'].includes(payload.kind);
  audio.volume=Math.max(0,Math.min(1,Number(payload.volume??0.75)));

  const startedAt=payload.started_at||new Date().toISOString();
  const currentTime=Number.isFinite(Number(payload.current_time))?Number(payload.current_time):0;
  const layer={...payload,layerId,volume:audio.volume,loop:audio.loop,audio,status:payload.status||'playing',position:Number(payload.position??currentTime),started_at:startedAt,start_offset:Number(payload.start_offset??currentTime)};
  state.audioPlayers.set(layerId,audio);
  state.audioLayers.set(layerId,layer);

  audio.onended=async()=>{
    if(!audio.loop){
      const finishedLayer=state.audioLayers.get(layerId);
      state.audioPlayers.delete(layerId);
      state.audioLayers.delete(layerId);
      renderDice();
      if(canEdit()&&broadcast){
        if(finishedLayer?.playlist_id&&finishedLayer?.queue_id){await playNextPlaylistTrack(finishedLayer).catch(e=>console.warn('Falha ao avançar playlist',e));return;}
        await persistAudioStateNow().catch(e=>console.warn('Falha ao persistir fim do áudio',e));
        await broadcastAudio({action:'stop-layer',layer_id:layerId});
      }
    }
  };

  try{
    if(Number.isFinite(currentTime)){
      audio.addEventListener('loadedmetadata',()=>{try{audio.currentTime=Math.max(0,currentTime);}catch(e){}},{once:true});
    }
    await audio.play();
    if(Number.isFinite(currentTime)&&audio.readyState>=1){try{audio.currentTime=Math.max(0,currentTime);}catch(e){}}
    if(layer.status==='paused'){audio.pause();layer.position=Math.max(0,currentTime);}
  }catch(e){
    state.audioPlayers.delete(layerId);state.audioLayers.delete(layerId);
    console.warn('Audio playback failed',payload.url,e);
    throw new Error('Não foi possível reproduzir este áudio. Em jogadores, use “Ativar áudio da campanha” uma vez; também verifique se o link/arquivo está acessível.');
  }

  renderDice();
  if(broadcast&&canEdit()){
    await persistAudioStateNow();
    await broadcastAudio({...payload,action:'play-layer',layer_id:layerId,started_at:startedAt,start_offset:Number(payload.start_offset??0),current_time:currentTime});
  }
  return layerId;
}

async function pauseAudioLayer(layerId,opts={}){const broadcast=opts.broadcast!==false;const layer=state.audioLayers.get(layerId);if(!layer)return;const audio=state.audioPlayers.get(layerId);const position=audio?Math.max(0,Number(audio.currentTime)||0):audioElapsed(layer);if(audio)audio.pause();layer.status='paused';layer.position=position;layer.start_offset=position;layer.started_at=new Date().toISOString();state.audioLayers.set(layerId,layer);renderDice();if(broadcast&&canEdit()){await persistAudioStateNow();await broadcastAudio({action:'pause-layer',layer_id:layerId,position});}}
async function resumeAudioLayer(layerId,opts={}){const broadcast=opts.broadcast!==false;const layer=state.audioLayers.get(layerId);if(!layer)return;const audio=state.audioPlayers.get(layerId);if(!audio)return;const position=Math.max(0,Number(layer.position||0));try{audio.currentTime=position;await audio.play();}catch(e){throw new Error('Não foi possível retomar este áudio.');}layer.status='playing';layer.position=position;layer.start_offset=position;layer.started_at=new Date().toISOString();state.audioLayers.set(layerId,layer);renderDice();if(broadcast&&canEdit()){await persistAudioStateNow();await broadcastAudio({action:'resume-layer',layer_id:layerId,position,started_at:layer.started_at,start_offset:position});}}
async function stopAudioLayer(layerId,opts={}){
  const broadcast=opts.broadcast!==false;
  const audio=state.audioPlayers.get(layerId);
  if(audio){try{audio.pause();audio.currentTime=0;}catch(e){}}
  state.audioPlayers.delete(layerId);state.audioLayers.delete(layerId);
  renderDice();
  if(broadcast&&canEdit()){await persistAudioStateNow();await broadcastAudio({action:'stop-layer',layer_id:layerId});}
}

async function stopAllAudioLayers(opts={}){
  const broadcast=opts.broadcast!==false;
  for(const audio of state.audioPlayers.values()){try{audio.pause();audio.currentTime=0;}catch(e){}}
  state.audioPlayers.clear();state.audioLayers.clear();
  renderDice();
  if(broadcast&&canEdit()){await persistAudioStateNow();await broadcastAudio({action:'stop-all'});}
}

async function setAudioLayerVolume(layerId,volume,opts={}){
  const broadcast=opts.broadcast!==false;
  const layer=state.audioLayers.get(layerId);if(!layer)return;
  const v=Math.max(0,Math.min(1,Number(volume)));layer.volume=v;if(layer.audio)layer.audio.volume=v;state.audioLayers.set(layerId,layer);
  if(broadcast&&canEdit()){await broadcastAudio({action:'set-volume',layer_id:layerId,volume:v});scheduleAudioStatePersist();}
}

async function playPlaylist(id){
  if(!canEdit())return;
  const items=state.audioPlaylistItems.filter(i=>i.playlist_id===id&&i.enabled).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
  const bundle=items.map(item=>({item,asset:state.audioAssets.find(a=>a.id===item.audio_asset_id)})).filter(x=>x.asset);
  if(!bundle.length){toast('Essa playlist não possui áudios ativos.','error');return;}
  state.audioPlaylistQueue={id,items:bundle.map(x=>({asset:x.asset,volume:x.item.volume??x.asset.default_volume})),index:0};
  const first=state.audioPlaylistQueue.items[0];
  await stopAllAudioLayers({broadcast:false});
  await playAudioLayer({action:'play-layer',layer_id:'pl_'+id,url:first.asset.url,name:first.asset.name,kind:first.asset.kind,loop:false,volume:first.volume,asset_id:first.asset.id,playlist_id:id,queue_id:id,queue_index:0});
  toast('Playlist transmitida para todos os jogadores');
}
async function playNextPlaylistTrack(layer){
  if(!canEdit()||!layer?.playlist_id)return;
  const q=state.audioPlaylistQueue;
  if(!q||q.id!==layer.playlist_id)return;
  const next=q.index+1;
  if(next>=q.items.length){state.audioPlaylistQueue=null;return;}
  q.index=next;const item=q.items[next];
  await playAudioLayer({action:'play-layer',layer_id:'pl_'+q.id,url:item.asset.url,name:item.asset.name,kind:item.asset.kind,loop:false,volume:item.volume,asset_id:item.asset.id,playlist_id:q.id,queue_id:q.id,queue_index:next});
}

async function broadcastAudio(payload){
  if(!state.campaignChannel||!canEdit())return;
  await state.campaignChannel.send({type:'broadcast',event:'audio',payload:{...payload,user_id:state.user.id,master_id:state.user.id,campaign_id:state.campaign.id}});
}
function openAudioLibraryModal(){
  if(!canEdit())return;
  const assets=[...state.audioAssets],playlists=[...state.audioPlaylists];
  const assetRows=assets.map(a=>`<label class="audioLibraryRow">
    <input type="checkbox" data-audio-select="${a.id}">
    <div class="audioLibraryIcon ${escapeHtml(a.kind)}">${a.kind==='effect'?'✦':a.kind==='ambient'?'♧':a.kind==='voice'?'◉':'♫'}</div>
    <div class="audioLibraryInfo"><b>${escapeHtml(a.name)}</b><small>${escapeHtml(audioKindLabel(a.kind))}${a.loop?' · loop':''}</small></div>
    <button type="button" class="miniAudioPlay" data-audio-one="${a.id}" title="Tocar">▶</button>
    <button type="button" class="miniAudioEdit" data-audio-edit="${a.id}" title="Editar">✎</button>
    <button type="button" class="miniAudioDelete" data-audio-delete="${a.id}" title="Excluir">×</button>
  </label>`).join('')||'<div class="audioEmpty">A biblioteca ainda está vazia.</div>';
    const playlistRows=playlists.map(p=>`<div class="playlistRow"><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.description||'')}</small><span>${state.audioPlaylistItems.filter(i=>i.playlist_id===p.id).length} áudio(s)</span></div><div class="playlistActions"><button class="softButton" data-play-playlist="${p.id}">▶ Tocar tudo</button><button class="softButton" data-edit-playlist="${p.id}">Gerenciar</button><button class="dangerGhost" data-delete-playlist="${p.id}">Excluir</button></div></div>`).join('')||'<div class="audioEmpty">Nenhuma playlist salva.</div>';
  showModal(`<div class="modalHeader"><div><div class="eyebrow">BIBLIOTECA DA CAMPANHA</div><h3>Áudios & playlists</h3></div><button class="closeButton" data-close>×</button></div>
    <div class="audioLibrarySection"><div class="librarySectionHead"><div><b>Biblioteca de áudios</b><small>Edite, substitua ou exclua arquivos enviados. Excluir também remove o áudio das playlists.</small></div><span>${assets.length} item(s)</span></div><div class="audioLibraryList">${assetRows}</div></div>
    <div class="playlistCreateBox"><label>Nome da playlist<input id="playlistName" maxlength="100" placeholder="Ex.: Floresta · Exploração"></label><label>Descrição <span class="optional">(opcional)</span><input id="playlistDesc" maxlength="240" placeholder="Ambientação de exploração"></label><button id="createPlaylistBtn" class="primarySmall">Salvar playlist com selecionados</button></div>
    <div class="audioLibrarySection"><div class="librarySectionHead"><div><b>Playlists salvas</b><small>Gerencie quais arquivos fazem parte de cada conjunto.</small></div><span>${playlists.length} playlist(s)</span></div><div class="playlistList">${playlistRows}</div></div>`);
  document.querySelectorAll('[data-audio-one]').forEach(b=>b.onclick=async e=>{e.preventDefault();const asset=state.audioAssets.find(x=>x.id===b.dataset.audioOne);if(asset)await playAudioLayer({url:asset.url,name:asset.name,kind:asset.kind,loop:asset.loop,volume:asset.default_volume,asset_id:asset.id});});
  document.querySelectorAll('[data-audio-edit]').forEach(b=>b.onclick=()=>openEditAudioAssetModal(b.dataset.audioEdit));
  document.querySelectorAll('[data-audio-delete]').forEach(b=>b.onclick=()=>deleteAudioAsset(b.dataset.audioDelete));
  document.querySelectorAll('[data-play-playlist]').forEach(b=>b.onclick=()=>{closeModal();playPlaylist(b.dataset.playPlaylist);});
  document.querySelectorAll('[data-edit-playlist]').forEach(b=>b.onclick=()=>openEditAudioPlaylistModal(b.dataset.editPlaylist));
  document.querySelectorAll('[data-delete-playlist]').forEach(b=>b.onclick=()=>deleteAudioPlaylist(b.dataset.deletePlaylist));
  $('createPlaylistBtn').onclick=async()=>{try{const name=$('playlistName').value.trim();if(!name){toast('Dê um nome para a playlist.','error');return;}const selected=[...document.querySelectorAll('[data-audio-select]:checked')].map(x=>x.dataset.audioSelect);if(!selected.length){toast('Selecione pelo menos um áudio.','error');return;}const {data:playlist,error}=await sb.from('audio_playlists').insert({campaign_id:state.campaign.id,name,description:$('playlistDesc').value.trim()||null,created_by:state.user.id}).select().maybeSingle();if(error)throw error;if(!playlist)throw new Error('A playlist não foi confirmada pelo servidor.');const rows=selected.map((id,index)=>({playlist_id:playlist.id,audio_asset_id:id,sort_order:index}));const {data:items,error:itemError}=await sb.from('audio_playlist_items').insert(rows).select();if(itemError)throw itemError;state.audioPlaylists=[...state.audioPlaylists,playlist];state.audioPlaylistItems=[...state.audioPlaylistItems,...(items||[])];closeModal();toast('Playlist criada');renderDice();openAudioLibraryModal();}catch(e){toast(e.message||'Não foi possível criar a playlist.','error');}};
}
async function openEditAudioPlaylistModal(id){
  if(!canEdit())return;
  const p=state.audioPlaylists.find(x=>x.id===id);if(!p)return;
  const items=state.audioPlaylistItems.filter(i=>i.playlist_id===id).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
  const rows=items.map((item,index)=>{const asset=state.audioAssets.find(a=>a.id===item.audio_asset_id);return asset?`<div class="playlistManageRow"><span class="playlistOrder">${index+1}</span><div class="audioLibraryIcon ${escapeHtml(asset.kind)}">${asset.kind==='effect'?'✦':asset.kind==='ambient'?'♧':'♫'}</div><div class="audioLibraryInfo"><b>${escapeHtml(asset.name)}</b><small>${escapeHtml(audioKindLabel(asset.kind))}</small></div><button class="miniAudioPlay" data-audio-manage-play="${asset.id}">▶</button><button class="miniAudioEdit" data-audio-manage-edit="${asset.id}" title="Editar áudio">✎</button><button class="miniAudioDelete" data-playlist-remove="${item.id}" title="Remover da playlist">×</button></div>`:''}).join('');
  const available=state.audioAssets.filter(a=>!items.some(i=>i.audio_asset_id===a.id));
  showModal(`<div class="modalHeader"><div><div class="eyebrow">PLAYLIST</div><h3>${escapeHtml(p.name)}</h3></div><button class="closeButton" data-close>×</button></div>
    <label>Nome da playlist<input id="editPlaylistName" maxlength="100" value="${escapeHtml(p.name)}"></label>
    <label>Descrição <span class="optional">(opcional)</span><input id="editPlaylistDesc" maxlength="240" value="${escapeHtml(p.description||'')}"></label>
    <div class="playlistManageList">${rows||'<div class="audioEmpty">Esta playlist ainda não possui áudios.</div>'}</div>
    <label>Adicionar áudio<select id="playlistAddAsset"><option value="">Selecione um áudio</option>${available.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select></label>
    <button id="addPlaylistAsset" class="softButton">+ Adicionar à playlist</button>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="savePlaylistChanges" class="primarySmall">Salvar playlist</button></div>`);
  document.querySelectorAll('[data-audio-manage-play]').forEach(b=>b.onclick=async()=>{const asset=state.audioAssets.find(x=>x.id===b.dataset.audioManagePlay);if(asset)await playAudioLayer({url:asset.url,name:asset.name,kind:asset.kind,loop:asset.loop,volume:asset.default_volume,asset_id:asset.id});});
  document.querySelectorAll('[data-audio-manage-edit]').forEach(b=>b.onclick=()=>openEditAudioAssetModal(b.dataset.audioManageEdit));
  document.querySelectorAll('[data-playlist-remove]').forEach(b=>b.onclick=async()=>{const item=state.audioPlaylistItems.find(x=>x.id===b.dataset.playlistRemove);if(!item)return;const {error}=await sb.from('audio_playlist_items').delete().eq('id',item.id);if(error){toast(error.message,'error');return;}state.audioPlaylistItems=state.audioPlaylistItems.filter(x=>x.id!==item.id);closeModal();openEditAudioPlaylistModal(id);toast('Áudio removido da playlist');});
  $('addPlaylistAsset').onclick=async()=>{const aid=$('playlistAddAsset').value;if(!aid){toast('Selecione um áudio.','error');return;}const order=state.audioPlaylistItems.filter(i=>i.playlist_id===id).length;const {data,error}=await sb.from('audio_playlist_items').insert({playlist_id:id,audio_asset_id:aid,sort_order:order}).select().maybeSingle();if(error){toast(error.message,'error');return;}if(!data){toast('O áudio não foi adicionado à playlist.','error');return;}state.audioPlaylistItems.push(data);closeModal();openEditAudioPlaylistModal(id);toast('Áudio adicionado à playlist');};
  $('savePlaylistChanges').onclick=async()=>{try{const name=$('editPlaylistName').value.trim();if(!name){toast('Informe um nome.','error');return;}const {data,error}=await sb.from('audio_playlists').update({name,description:$('editPlaylistDesc').value.trim()||null}).eq('id',id).select().maybeSingle();if(error)throw error;if(!data)throw new Error('A playlist foi alterada ou removida em outra sessão.');state.audioPlaylists=state.audioPlaylists.map(x=>x.id===id?data:x);closeModal();openAudioLibraryModal();toast('Playlist atualizada');}catch(e){toast(e.message||'Não foi possível atualizar a playlist.','error');}};
}

async function deleteAudioPlaylist(id){if(!canEdit())return;const p=state.audioPlaylists.find(x=>x.id===id);if(!p)return;if(!confirm('Excluir a playlist "'+p.name+'"? Os áudios da biblioteca serão mantidos.'))return;const {error}=await sb.from('audio_playlists').delete().eq('id',id);if(error){toast(error.message,'error');return;}state.audioPlaylistItems=state.audioPlaylistItems.filter(i=>i.playlist_id!==id);state.audioPlaylists=state.audioPlaylists.filter(x=>x.id!==id);closeModal();renderDice();openAudioLibraryModal();toast('Playlist excluída');}
function openNoCampaignState(){
  showModal(`<div class="modalHeader"><div><div class="eyebrow">PRIMEIRO PASSO</div><h3>Você ainda não participa de uma campanha</h3></div></div>
  <p class="modalHint">Sua conta está configurada como Jogador. Para entrar em uma campanha, use um convite/código do mestre. Você também pode mudar seu tipo de conta para Mestre no seu perfil sem ganhar acesso às campanhas de outras pessoas.</p>
  <div class="modalActions"><button class="primarySmall" id="openProfileFromEmpty">Abrir perfil</button><button class="softButton" data-close>Fechar</button></div>`);
  $('openProfileFromEmpty').onclick=()=>{closeModal();profileModal();};
}

async function seedCharacterFieldsForCampaign(campaignId){
  const defaults=[
    ['name','Nome do personagem','text','name',true,0],
    ['class_name','Classe / função','text','class_name',false,10],
    ['ancestry_name','Origem / ancestralidade','text','ancestry_name',false,20],
    ['level','Nível','number','level',false,30],
    ['hp_current','Vida atual','number','hp_current',false,40],
    ['hp_max','Vida máxima','number','hp_max',false,50],
    ['armor_class','Defesa / CA','number','armor_class',false,60],
    ['luck','Sorte','number','luck',false,70],
    ['luck_points','Pontos de sorte','number','luck_points',false,80],
    ['attr_forca','Força','number','attributes.forca',false,90],
    ['attr_destreza','Destreza','number','attributes.destreza',false,100],
    ['attr_constituicao','Constituição','number','attributes.constituicao',false,110],
    ['attr_inteligencia','Inteligência','number','attributes.inteligencia',false,120],
    ['attr_sabedoria','Sabedoria','number','attributes.sabedoria',false,130],
    ['attr_carisma','Carisma','number','attributes.carisma',false,140],
    ['avatar_url','Foto / avatar','url','avatar_url',false,150],
    ['notes','Ficha complementar','textarea','notes',false,160],
    ['current_items','Itens atuais / equipamentos em uso','textarea','sheet_data.current_items',false,165],
  ];
  const payload=defaults.map(([field_key,label,field_type,data_key,required,sort_order])=>({campaign_id:campaignId,field_key,label,field_type,data_key,required,sort_order}));
  const {error}=await sb.from('character_field_definitions').insert(payload);
  if(error && !/duplicate|unique/i.test(error.message||''))throw error;
  state.characterFields=payload.map(x=>({...x,id:crypto.randomUUID(),options:[],enabled:true,player_visible:true,player_editable:true}));
}

async function ensureCharacterFields(){
  if(state.characterFields.length||!state.campaign)return;
  if(canEdit()){await seedCharacterFieldsForCampaign(state.campaign.id);}
}

async function createCampaign(name,description){
  if(!canCreateCampaign())throw new Error('Somente contas Mestre podem criar campanhas.');
  const inviteCode=Math.random().toString(36).slice(2,12).toUpperCase();
  const fields='id,owner_id,name,description,system_name,cover_url,discord_url,discord_guild_id,timezone,created_at,updated_at';
  let {data,error}=await sb.from('campaigns').insert({owner_id:state.user.id,name,description,system_name:'Sistema próprio',invite_code:inviteCode}).select(fields).maybeSingle();
  if(error)throw error;
  if(!data){
    const fallback=await sb.from('campaigns').select(fields).eq('owner_id',state.user.id).eq('name',name).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(fallback.error)throw fallback.error;
    data=fallback.data;
  }
  if(!data)throw new Error('A campanha foi criada, mas não conseguimos recuperar os dados dela.');
  const membership=await sb.from('campaign_members').upsert({campaign_id:data.id,campaign_owner_id:state.user.id,user_id:state.user.id,role:'owner'},{onConflict:'campaign_id,user_id'});
  if(membership.error)throw membership.error;
  await seedCharacterFieldsForCampaign(data.id);
  state.campaign=data;
  try{localStorage.setItem('rpg-hub-active-campaign',data.id)}catch(_){}
  await loadCampaigns();
  state.campaign=state.campaigns.find(c=>c.id===data.id)||data;
  await ensureCampaignWorld(data.id);
  await loadCampaignData();
  closeModal();
  toast('Campanha criada');
}

async function openCampaignInvite(){
  if(!canEdit()||!state.campaign)return;
  try{
    const {data,error}=await sb.rpc('get_campaign_invite',{p_campaign_id:state.campaign.id});
    if(error)throw error;
    showModal(`<div class="modalHeader"><div><div class="eyebrow">ACESSO À CAMPANHA</div><h3>Código de convite</h3></div><button class="closeButton" data-close>×</button></div>
      <p class="modalHint">Envie este código somente para as pessoas que você quer dentro da campanha. Quem não tiver o código não consegue solicitar entrada.</p>
      <div class="inviteCodeBox"><span id="inviteCodeValue">${escapeHtml(data||'—')}</span><button id="copyInviteBtn" class="softButton">Copiar</button></div>
      <div class="inviteWarning">Renovar o código invalida o código anterior imediatamente.</div>
      <div class="modalActions"><button class="softButton" data-close>Fechar</button><button id="regenerateInviteBtn" class="primarySmall">Gerar novo código</button></div>`);
    $('copyInviteBtn').onclick=async()=>{try{await navigator.clipboard.writeText(data);toast('Código copiado');}catch(e){toast('Não foi possível copiar automaticamente.','error');}};
    $('regenerateInviteBtn').onclick=async()=>{try{if(!confirm('Gerar um novo código? O código atual deixará de funcionar.'))return;const {data:newCode,error}=await sb.rpc('regenerate_campaign_invite',{p_campaign_id:state.campaign.id});if(error)throw error;$('inviteCodeValue').textContent=newCode;toast('Novo código gerado');}catch(e){toast(e.message,'error');}};
  }catch(e){toast(e.message||'Não foi possível consultar o código.','error');}
}
function openJoinCampaignModal(){
  showModal(`<div class="modalHeader"><div><div class="eyebrow">ENTRAR NA CAMPANHA</div><h3>Usar código de convite</h3></div><button class="closeButton" data-close>×</button></div>
    <p class="modalHint">Peça o código ao mestre da campanha. Você só entra depois que o código for validado pelo RPG HUB.</p>
    <label>Código de convite<input id="joinCampaignCode" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="Ex.: 8F4B1A9C20"></label>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="joinCampaignBtnConfirm" class="primarySmall">Entrar na campanha</button></div>`);
  $('joinCampaignBtnConfirm').onclick=async()=>{
    const code=$('joinCampaignCode').value.trim().toUpperCase();
    if(!code){toast('Informe o código de convite.','error');return;}
    try{
      const {data,error}=await sb.rpc('join_campaign_by_code',{p_invite_code:code});
      if(error)throw error;
      const joined=Array.isArray(data)?data[0]:data;
      if(!joined?.campaign_id)throw new Error('Não foi possível identificar a campanha.');
      closeModal();
      await loadCampaigns();
      state.campaign=state.campaigns.find(c=>c.id===joined.campaign_id)||null;
      state.floor=null; state.selected=null;
      await loadCampaignData();
      toast('Você entrou na campanha');
    }catch(e){toast(e.message||'Código inválido ou campanha indisponível.','error');}
  };
}

function openCampaignCreate(initial=false){
  const intro=initial?'Crie sua primeira campanha':'Nova campanha';
  showModal(`<div class="mobileCreateWizard"><div class="modalHeader"><div><div class="eyebrow">${initial?'PRIMEIRO PASSO':'NOVA CAMPANHA'}</div><h3>${intro}</h3></div><button class="closeButton" data-close>×</button></div><div class="wizardIntro"><span class="wizardStep active">1</span><div><b>Comece pelo nome</b><small>A descrição é opcional e pode ser adicionada depois.</small></div></div><label>Nome da campanha <span class="requiredMark">*</span><input id="mCampaignName" maxlength="120" autocomplete="off" placeholder="Ex.: Sombras de Valedorn"></label><label>Descrição <span class="optional">(opcional)</span><textarea id="mCampaignDesc" rows="5" maxlength="2000" placeholder="Você pode explicar o cenário, sistema ou proposta da campanha — mas não é obrigatório."></textarea><div class="wizardFeatureGrid"><div><span>✓</span><b>Código de convite</b><small>Gerado automaticamente.</small></div><div><span>✓</span><b>Mundo persistente</b><small>Monte locais e cômodos depois.</small></div><div><span>✓</span><b>Ficha configurável</b><small>Defina os campos dos jogadores.</small></div><div><span>✓</span><b>Áudio em tempo real</b><small>Use música e efeitos na mesa.</small></div></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveCampaign" class="primarySmall">Criar campanha</button></div></div>`);
  $('saveCampaign').onclick=async()=>{const btn=$('saveCampaign');try{const n=$('mCampaignName').value.trim();if(!n){toast('Informe o nome da campanha.','error');$('mCampaignName').focus();return;}btn.disabled=true;btn.textContent='Criando…';await createCampaign(n,$('mCampaignDesc').value.trim());}catch(e){btn.disabled=false;btn.textContent='Criar campanha';toast(e.message||'Não foi possível criar a campanha.','error');}};
}
async function openDeleteCampaignModal(){
  if(!canEdit()||!state.campaign)return;
  const campaign=state.campaign;
  showModal('<div class="modalHeader"><div><div class="eyebrow dangerEyebrow">EXCLUSÃO DA CAMPANHA</div><h3>Excluir campanha</h3></div><button class="closeButton" data-close>×</button></div>' +
    '<div class="dangerPanel"><strong>Esta ação remove a campanha e toda a estrutura vinculada.</strong><p>Serão excluídos locais, andares, cômodos, personagens, NPCs, entidades, sessões, rolagens, playlists, áudios cadastrados e configurações da ficha. Esta ação não pode ser desfeita.</p></div>' +
    '<label>Digite o nome da campanha para confirmar <span class="requiredMark">*</span><input id="deleteCampaignName" autocomplete="off" placeholder="' + escapeHtml(campaign.name) + '"></label>' +
    '<div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="confirmDeleteCampaign" class="dangerButton" disabled>Excluir campanha</button></div>');
  const input=$('deleteCampaignName'),btn=$('confirmDeleteCampaign');
  const sync=()=>{btn.disabled=input.value.trim()!==campaign.name.trim();};
  input.addEventListener('input',sync);
  btn.onclick=async()=>{
    if(input.value.trim()!==campaign.name.trim())return;
    btn.disabled=true;
    try{
      const {error}=await sb.rpc('delete_campaign',{p_campaign_id:campaign.id});
      if(error)throw error;
      state.audioLayers.forEach(layer=>{try{layer.audio?.pause();}catch(_){}});
      state.audioLayers.clear();state.audioPlayers.clear();
      state.campaigns=state.campaigns.filter(c=>c.id!==campaign.id);
      state.campaign=state.campaigns[0]||null;
      state.floor=null;state.location=null;state.selected=null;state.selectedSessionId=null;
      closeModal();
      if(state.campaign){await loadCampaignData();}else{renderAll();openNoCampaignState();}
      toast('Campanha excluída');
    }catch(e){
      btn.disabled=false;
      toast(e.message||'Não foi possível excluir a campanha.','error');
    }
  };
}

async function deleteRoom(id){if(!requireMaster())return; if(!confirm('Excluir este cômodo? Entidades vinculadas serão mantidas, mas sem o cômodo.'))return;const {error}=await sb.from('rooms').delete().eq('id',id);if(error){toast(error.message,'error');return;}state.rooms=state.rooms.filter(r=>r.id!==id);state.selected=null;renderAll();toast('Cômodo excluído');}

function fieldTypeLabel(type){return ({text:'Texto curto',number:'Número',textarea:'Texto longo',select:'Seleção',checkbox:'Sim / não',url:'URL'})[type]||type;}
function slugifyField(label){return normalizeFieldKey(label);}

function renderCharacterFieldConfigGroup(items){
  return items.map((f,index)=>{
    const locked=f.field_key==='name';
    return `<div class="fieldConfigCard" data-config-id="${f.id}">
      <div class="fieldConfigCardHead">
        <div class="fieldIdentity">
          <span class="fieldOrder">${index+1}</span>
          <div>
            <b>${escapeHtml(f.label)}</b>
            <small>${escapeHtml(fieldTypeLabel(f.field_type))}${locked?' · campo essencial':''}</small>
          </div>
        </div>
        <label class="configSwitch"><input type="checkbox" data-field-enabled ${locked||f.enabled?'checked':''} ${locked?'disabled':''}><span></span><b>Ativo</b></label>
      </div>
      <div class="fieldConfigLabel">
        <span>Nome exibido na ficha</span>
        <input data-field-label value="${escapeHtml(f.label)}" ${locked?'readonly':''}>
      </div>
      <div class="fieldPermissionGrid">
        <label class="permissionOption ${f.player_visible?'selected':''}">
          <input type="checkbox" data-field-visible ${f.player_visible?'checked':''}>
          <span class="permissionIcon">◉</span>
          <span><b>Jogador vê</b><small>Mostra este campo para o jogador.</small></span>
        </label>
        <label class="permissionOption ${f.player_editable&&f.player_visible?'selected':''}">
          <input type="checkbox" data-field-editable ${f.player_editable?'checked':''} ${!f.player_visible?'disabled':''}>
          <span class="permissionIcon">✎</span>
          <span><b>Jogador edita</b><small>Permite preencher e alterar o campo.</small></span>
        </label>
        <label class="permissionOption ${f.required?'selected':''}">
          <input type="checkbox" data-field-required ${f.required?'checked':''} ${locked?'disabled':''}>
          <span class="permissionIcon">!</span>
          <span><b>Obrigatório</b><small>Exige preenchimento antes de salvar.</small></span>
        </label>
      </div>
    </div>`;
  }).join('');
}
async function openCharacterFieldConfig(){
  if(!requireMaster())return;
  const fields=[...(state.characterFields||[])].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
  const basic=fields.filter(f=>!String(f.field_key).startsWith('custom_'));
  const custom=fields.filter(f=>String(f.field_key).startsWith('custom_'));
  const basicRows=renderCharacterFieldConfigGroup(basic);
  const customRows=renderCharacterFieldConfigGroup(custom);
  showModal(`<div class="modalHeader"><div><div class="eyebrow">CONFIGURAÇÃO DA CAMPANHA</div><h3>Campos da ficha</h3></div><button class="closeButton" data-close>×</button></div>
    <p class="modalHint">Você escolhe o que existe na ficha e o nível de acesso dos jogadores. O sistema não exige D&D, Ordem Paranormal ou qualquer outro conjunto de regras.</p>
    <div class="fieldConfigLegend">
      <div><span class="legendDot active"></span><b>Ativo</b><small>O campo aparece na ficha.</small></div>
      <div><span class="legendDot"></span><b>Jogador vê</b><small>O jogador consegue visualizar.</small></div>
      <div><span class="legendDot"></span><b>Jogador edita</b><small>O jogador consegue preencher.</small></div>
      <div><span class="legendDot"></span><b>Obrigatório</b><small>Precisa ser preenchido.</small></div>
    </div>
    <div class="fieldConfigSection"><div class="fieldConfigSectionHead"><div><span class="eyebrow">BASE DA FICHA</span><h4>Campos disponíveis</h4></div><span class="fieldConfigCount">${basic.length}</span></div><div class="fieldConfigList">${basicRows||'<div class="emptyPanel">Nenhum campo base.</div>'}</div></div>
    ${custom.length?`<div class="fieldConfigSection customFieldSection"><div class="fieldConfigSectionHead"><div><span class="eyebrow">PERSONALIZADOS</span><h4>Campos criados pelo mestre</h4></div><span class="fieldConfigCount">${custom.length}</span></div><div class="fieldConfigList">${customRows}</div></div>`:''}
    <div class="configAddPanel"><div><b>Quer criar algo diferente?</b><small>Adicione campos como Sanidade, Fama, Profissão, Estresse, Poderes, Reputação ou qualquer outra informação.</small></div><button id="addCharacterField" class="softButton">+ Criar campo</button></div>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveCharacterFields" class="primarySmall">Salvar configuração</button></div>`);
  document.querySelectorAll('[data-field-visible]').forEach(cb=>cb.addEventListener('change',()=>{
    const row=cb.closest('.fieldConfigCard');
    const edit=row.querySelector('[data-field-editable]');
    if(edit){edit.disabled=!cb.checked;if(!cb.checked)edit.checked=false;}
    cb.closest('.permissionOption')?.classList.toggle('selected',cb.checked);
    edit?.closest('.permissionOption')?.classList.toggle('selected',!!edit.checked&&!edit.disabled);
  }));
  document.querySelectorAll('[data-field-editable]').forEach(cb=>cb.addEventListener('change',()=>cb.closest('.permissionOption')?.classList.toggle('selected',cb.checked&&!cb.disabled)));
  document.querySelectorAll('[data-field-required]').forEach(cb=>cb.addEventListener('change',()=>cb.closest('.permissionOption')?.classList.toggle('selected',cb.checked)));
  document.querySelectorAll('[data-field-enabled]').forEach(cb=>cb.addEventListener('change',()=>cb.closest('.configSwitch')?.classList.toggle('checked',cb.checked)));
  $('addCharacterField').onclick=()=>openAddCharacterFieldModal();
  $('saveCharacterFields').onclick=async()=>{
    try{
      const updates=[...document.querySelectorAll('.fieldConfigCard')].map((row,index)=>{
        const id=row.dataset.configId;
        const f=fields.find(x=>String(x.id)===String(id));
        const visible=row.querySelector('[data-field-visible]').checked;
        const locked=f.field_key==='name';
        return {id,label:row.querySelector('[data-field-label]').value.trim()||f.label,enabled:locked?true:row.querySelector('[data-field-enabled]').checked,player_visible:locked?true:visible,player_editable:locked?true:visible&&row.querySelector('[data-field-editable]').checked,required:locked?true:row.querySelector('[data-field-required]').checked,sort_order:index*10};
      });
      for(const u of updates){const {error}=await sb.from('character_field_definitions').update({label:u.label,enabled:u.enabled,player_visible:u.player_visible,player_editable:u.player_editable,required:u.required,sort_order:u.sort_order}).eq('id',u.id);if(error)throw error;}
      const {data,error}=await sb.from('character_field_definitions').select('*').eq('campaign_id',state.campaign.id).order('sort_order');if(error)throw error;
      state.characterFields=data||[];closeModal();renderAll();toast('Configuração da ficha salva');
    }catch(e){toast(e.message||'Não foi possível salvar a configuração.','error');}
  };
}

function openAddCharacterFieldModal(){
  showModal(`<div class="modalHeader"><div><div class="eyebrow">NOVO CAMPO</div><h3>Campo personalizado</h3></div><button class="closeButton" data-close>×</button></div>
    <label>Nome do campo<input id="newFieldLabel" maxlength="80" placeholder="Ex.: Fama"></label>
    <label>Tipo<select id="newFieldType"><option value="text">Texto curto</option><option value="number">Número</option><option value="textarea">Texto longo</option><option value="select">Seleção</option><option value="checkbox">Sim / não</option><option value="url">URL</option></select></label>
    <label id="newFieldOptionsWrap" class="hidden">Opções da seleção<input id="newFieldOptions" placeholder="Baixa, Média, Alta"></label>
    <div class="configToggleGrid"><label><input id="newFieldEnabled" type="checkbox" checked> Ativo</label><label><input id="newFieldVisible" type="checkbox" checked> Jogador vê</label><label><input id="newFieldEditable" type="checkbox" checked> Jogador edita</label><label><input id="newFieldRequired" type="checkbox"> Obrigatório</label></div>
    <p class="modalHint">O valor será armazenado na ficha da campanha e poderá ser usado independentemente do sistema de RPG.</p>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="createCustomField" class="primarySmall">Adicionar campo</button></div>`);
  $('newFieldType').onchange=()=>$('newFieldOptionsWrap').classList.toggle('hidden',$('newFieldType').value!=='select');
  $('newFieldVisible').onchange=()=>{if(!$('newFieldVisible').checked)$('newFieldEditable').checked=false;$('newFieldEditable').disabled=!$('newFieldVisible').checked;};
  $('createCustomField').onclick=async()=>{
    try{
      const label=$('newFieldLabel').value.trim();if(!label){toast('Informe o nome do campo.','error');return;}
      const type=$('newFieldType').value;const key='custom_'+slugifyField(label)+'_'+Date.now().toString(36);
      const options=type==='select'?$('newFieldOptions').value.split(',').map(x=>x.trim()).filter(Boolean):[];
      const next=(state.characterFields||[]).reduce((m,f)=>Math.max(m,Number(f.sort_order)||0),0)+10;
      const payload={campaign_id:state.campaign.id,field_key:key,label,field_type:type,data_key:'sheet_data.'+key,options,enabled:$('newFieldEnabled').checked,player_visible:$('newFieldVisible').checked,player_editable:$('newFieldEditable').checked,required:$('newFieldRequired').checked,sort_order:next};
      const {data,error}=await sb.from('character_field_definitions').insert(payload).select().maybeSingle();if(error)throw error;if(!data)throw new Error('O campo não foi confirmado pelo servidor.');state.characterFields.push(data);closeModal();openCharacterFieldConfig();toast('Campo adicionado');
    }catch(e){toast(e.message||'Não foi possível adicionar o campo.','error');}
  };
}
function normalizeFieldKey(label){
  return String(label||'campo').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'campo';
}
function fieldValueFromCharacter(character,field){
  const path=String(field.data_key||'').split('.');
  if(path.length===1)return character?.[path[0]];
  return character?.[path[0]]?.[path[1]];
}
function setFieldValue(payload,field,value){
  const path=String(field.data_key||'').split('.');
  if(path.length===1){payload[path[0]]=value;return;}
  if(!payload[path[0]]||typeof payload[path[0]]!=='object')payload[path[0]]={};
  payload[path[0]][path[1]]=value;
}
function fieldInputHtml(field,character,isMasterEditor){
  const raw=fieldValueFromCharacter(character,field);
  const value=raw===null||raw===undefined?'':raw;
  const disabled=(!isMasterEditor && !field.player_editable)?'disabled':'';
  const required=field.required?'required':'';
  const req=field.required?'<span class="requiredMark">*</span>':'';
  const id='field_'+field.id;
  const options=Array.isArray(field.options)?field.options:[];
  if(field.data_key==='avatar_url'){
    return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="url" value="${escapeHtml(value)}" placeholder="https://.../imagem.webp" ${disabled} ${required}><input id="${id}_file" class="dynamicFile" type="file" accept="image/*" ${disabled}><small>URL ou envio de arquivo</small></label>`;
  }
  if(field.field_type==='textarea'){
    const isItems=field.data_key==='sheet_data.current_items';
    const placeholder=isItems?'Ex.: Espada longa x1\\nPoção de cura x2\\nTocha x3':'Digite as informações deste campo';
    const hint=disabled?'Somente o mestre':isItems?'Cadastre um item por linha, com quantidade quando fizer sentido.':'Campo da ficha';
    return '<label class="dynamicField">'+escapeHtml(field.label)+' '+req+'<textarea id="'+id+'" data-field-id="'+field.id+'" data-data-key="'+escapeHtml(field.data_key)+'" data-type="textarea" rows="'+(isItems?7:6)+'" placeholder="'+escapeHtml(placeholder)+'" '+disabled+' '+required+'>'+escapeHtml(value)+'</textarea><small>'+hint+'</small></label>';
  }
  if(field.field_type==='number'){
    return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="number" type="number" value="${escapeHtml(value)}" ${disabled} ${required}>${disabled?'<small>Somente o mestre</small>':''}</label>`;
  }
  if(field.field_type==='select'){
    return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<select id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="select" ${disabled} ${required}><option value="">Selecione</option>${options.map(o=>`<option value="${escapeHtml(o)}" ${String(value)===String(o)?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>${disabled?'<small>Somente o mestre</small>':''}</label>`;
  }
  if(field.field_type==='checkbox'){
    return `<label class="dynamicCheck"><input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="checkbox" type="checkbox" ${value?'checked':''} ${disabled}> <span>${escapeHtml(field.label)}</span>${field.required?'<span class="requiredMark">*</span>':''}</label>`;
  }
  return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="${field.field_type||'text'}" value="${escapeHtml(value)}" ${disabled} ${required}>${disabled?'<small>Somente o mestre</small>':''}</label>`;
}
function getDynamicFieldDefinitions(isMasterEditor){
  return (state.characterFields||[]).filter(f=>f.enabled && (isMasterEditor || f.player_visible)).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
}
function buildCharacterPayloadFromFields(formRoot){
  const payload={campaign_id:state.campaign.id,attributes:{},sheet_data:{}};
  formRoot.querySelectorAll('[data-field-id]').forEach(el=>{
    const type=el.dataset.type;
    let value;
    if(type==='checkbox')value=el.checked;
    else if(type==='number')value=el.value===''?null:Number(el.value);
    else value=el.value;
    const field=state.characterFields.find(f=>String(f.id)===String(el.dataset.fieldId));
    if(field)setFieldValue(payload,field,value);
  });
  return payload;
}
async function openCharacterModal(id){
  const existing=id?state.characters.find(x=>x.id===id):null;
  if(existing && !canEdit() && existing.player_id!==state.user.id){toast('Você só pode editar sua própria ficha.','error');return;}
  const isMasterEditor=canEdit();
  const c=existing||{name:'',class_name:'',ancestry_name:'',level:1,hp_current:'',hp_max:'',armor_class:'',luck:0,luck_points:0,notes:'',attributes:{},sheet_data:{},avatar_url:''};
  const defs=getDynamicFieldDefinitions(isMasterEditor);
  const visibleFields=defs.length?defs:[{id:'fallback_name',label:'Nome do personagem',field_type:'text',data_key:'name',enabled:true,player_visible:true,player_editable:true,required:true,sort_order:0}];
  const memberOptions=state.members.map(m=>{const p=profileFor(m.user_id);return `<option value="${m.user_id}" ${(c.player_id||state.user.id)===m.user_id?'selected':''}>${escapeHtml(p?.display_name||(m.user_id===state.user.id?'Você':'Jogador'))}</option>`;}).join('');
  const fieldsHtml=visibleFields.map(f=>fieldInputHtml(f,c,isMasterEditor)).join('');
  const playerFieldNote=isMasterEditor?'Você está visualizando a ficha como mestre. Campos podem ser exibidos ou limitados aos jogadores na configuração.':'Preencha somente os campos liberados pelo mestre desta campanha.';
  showModal(`<div class="modalHeader"><div><div class="eyebrow">FICHA DA CAMPANHA</div><h3>${existing?'Editar personagem':'Novo personagem'}</h3></div><button class="closeButton" data-close>×</button></div>
    <p class="modalHint">${playerFieldNote}</p>
    ${isMasterEditor?`<div class="characterAssign"><label>Jogador responsável<select id="charPlayer">${memberOptions}</select></label></div>`:''}
    <div id="dynamicCharacterFields" class="dynamicCharacterFields">${fieldsHtml}</div>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveCharacter" class="primarySmall">Salvar ficha</button></div>`);
  $('saveCharacter').onclick=async()=>{
    try{
      const payload=buildCharacterPayloadFromFields($('dynamicCharacterFields'));
      payload.id=undefined;
      payload.campaign_id=state.campaign.id;
      if(isMasterEditor){payload.player_id=$('charPlayer')?.value||null;}else{payload.player_id=state.user.id;}
      const name=payload.name?.trim?.()||'';
      if(!name){toast('O nome do personagem é obrigatório.','error');return;}
      const defsForValidation=getDynamicFieldDefinitions(isMasterEditor);
      for(const f of defsForValidation){
        if(!f.required||(!isMasterEditor&&!f.player_editable)||!f.enabled)continue;
        const v=fieldValueFromCharacter(payload,f);
        if(v===null||v===undefined||v===''||(f.field_type==='checkbox'&&v!==true)){toast('Preencha o campo obrigatório: '+f.label,'error');return;}
      }
      if(!payload.attributes)payload.attributes={};
      if(!payload.sheet_data)payload.sheet_data={};
      if(existing){
        const updatePayload={...payload};delete updatePayload.id;
        const result=await sb.from('characters').update(updatePayload).eq('id',existing.id).select('*').maybeSingle();
        if(result.error)throw result.error;
        let data=result.data;
        if(!data){
          const verify=await sb.from('characters').select('*').eq('id',existing.id).maybeSingle();
          if(verify.error)throw verify.error;
          data=verify.data;
        }
        if(!data)throw new Error('A ficha foi alterada, mas não pôde ser lida de volta.');
        state.characters=state.characters.map(x=>x.id===existing.id?data:x);
      }else{
        const characterId=uid();
        payload.id=characterId;
        const result=await sb.from('characters').insert(payload).select('*').maybeSingle();
        if(result.error)throw result.error;
        let data=result.data;
        if(!data){
          const verify=await sb.from('characters').select('*').eq('id',characterId).maybeSingle();
          if(verify.error)throw verify.error;
          data=verify.data;
        }
        if(!data)throw new Error('A ficha foi criada, mas não pôde ser carregada de volta.');
        state.characters.push(data);
      }
      const fileIds=visibleFields.filter(f=>f.data_key==='avatar_url').map(f=>f.id);
      for(const fieldId of fileIds){
        const file=$( 'field_'+fieldId+'_file')?.files?.[0];
        if(file){
          const avatar=await uploadMedia(file,'characters/'+(existing?.id||uid()));
          const targetId=existing?.id||state.characters.at(-1).id;
          const result=await sb.from('characters').update({avatar_url:avatar}).eq('id',targetId).select('*').maybeSingle();
          if(result.error)throw result.error;
          let data=result.data;
          if(!data){
            const verify=await sb.from('characters').select('*').eq('id',targetId).maybeSingle();
            if(verify.error)throw verify.error;
            data=verify.data;
          }
          if(!data)throw new Error('A ficha recebeu a imagem, mas não pôde ser recarregada.');
          state.characters=state.characters.map(x=>x.id===targetId?data:x);
        }
      }
      closeModal();renderAll();toast('Ficha salva');
    }catch(e){toast(e.message||'Não foi possível salvar a ficha.','error');}
  };
}

function fieldTypeLabel(type){return ({text:'Texto curto',number:'Número',textarea:'Texto longo',select:'Seleção',checkbox:'Sim / não',url:'URL'})[type]||type;}
function slugifyField(label){return normalizeFieldKey(label);}

function renderCharacterFieldConfigGroup(items){
  return items.map((f,index)=>{
    const locked=f.field_key==='name';
    return `<div class="fieldConfigCard" data-config-id="${f.id}">
      <div class="fieldConfigCardHead">
        <div class="fieldIdentity">
          <span class="fieldOrder">${index+1}</span>
          <div>
            <b>${escapeHtml(f.label)}</b>
            <small>${escapeHtml(fieldTypeLabel(f.field_type))}${locked?' · campo essencial':''}</small>
          </div>
        </div>
        <label class="configSwitch"><input type="checkbox" data-field-enabled ${locked||f.enabled?'checked':''} ${locked?'disabled':''}><span></span><b>Ativo</b></label>
      </div>
      <div class="fieldConfigLabel">
        <span>Nome exibido na ficha</span>
        <input data-field-label value="${escapeHtml(f.label)}" ${locked?'readonly':''}>
      </div>
      <div class="fieldPermissionGrid">
        <label class="permissionOption ${f.player_visible?'selected':''}">
          <input type="checkbox" data-field-visible ${f.player_visible?'checked':''}>
          <span class="permissionIcon">◉</span>
          <span><b>Jogador vê</b><small>Mostra este campo para o jogador.</small></span>
        </label>
        <label class="permissionOption ${f.player_editable&&f.player_visible?'selected':''}">
          <input type="checkbox" data-field-editable ${f.player_editable?'checked':''} ${!f.player_visible?'disabled':''}>
          <span class="permissionIcon">✎</span>
          <span><b>Jogador edita</b><small>Permite preencher e alterar o campo.</small></span>
        </label>
        <label class="permissionOption ${f.required?'selected':''}">
          <input type="checkbox" data-field-required ${f.required?'checked':''} ${locked?'disabled':''}>
          <span class="permissionIcon">!</span>
          <span><b>Obrigatório</b><small>Exige preenchimento antes de salvar.</small></span>
        </label>
      </div>
    </div>`;
  }).join('');
}
async function openCharacterFieldConfig(){
  if(!requireMaster())return;
  const fields=[...(state.characterFields||[])].sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
  const basic=fields.filter(f=>!String(f.field_key).startsWith('custom_'));
  const custom=fields.filter(f=>String(f.field_key).startsWith('custom_'));
  const basicRows=renderCharacterFieldConfigGroup(basic);
  const customRows=renderCharacterFieldConfigGroup(custom);
  showModal(`<div class="modalHeader"><div><div class="eyebrow">CONFIGURAÇÃO DA CAMPANHA</div><h3>Campos da ficha</h3></div><button class="closeButton" data-close>×</button></div>
    <p class="modalHint">Você escolhe o que existe na ficha e o nível de acesso dos jogadores. O sistema não exige D&D, Ordem Paranormal ou qualquer outro conjunto de regras.</p>
    <div class="fieldConfigLegend">
      <div><span class="legendDot active"></span><b>Ativo</b><small>O campo aparece na ficha.</small></div>
      <div><span class="legendDot"></span><b>Jogador vê</b><small>O jogador consegue visualizar.</small></div>
      <div><span class="legendDot"></span><b>Jogador edita</b><small>O jogador consegue preencher.</small></div>
      <div><span class="legendDot"></span><b>Obrigatório</b><small>Precisa ser preenchido.</small></div>
    </div>
    <div class="fieldConfigSection"><div class="fieldConfigSectionHead"><div><span class="eyebrow">BASE DA FICHA</span><h4>Campos disponíveis</h4></div><span class="fieldConfigCount">${basic.length}</span></div><div class="fieldConfigList">${basicRows||'<div class="emptyPanel">Nenhum campo base.</div>'}</div></div>
    ${custom.length?`<div class="fieldConfigSection customFieldSection"><div class="fieldConfigSectionHead"><div><span class="eyebrow">PERSONALIZADOS</span><h4>Campos criados pelo mestre</h4></div><span class="fieldConfigCount">${custom.length}</span></div><div class="fieldConfigList">${customRows}</div></div>`:''}
    <div class="configAddPanel"><div><b>Quer criar algo diferente?</b><small>Adicione campos como Sanidade, Fama, Profissão, Estresse, Poderes, Reputação ou qualquer outra informação.</small></div><button id="addCharacterField" class="softButton">+ Criar campo</button></div>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveCharacterFields" class="primarySmall">Salvar configuração</button></div>`);
  document.querySelectorAll('[data-field-visible]').forEach(cb=>cb.addEventListener('change',()=>{
    const row=cb.closest('.fieldConfigCard');
    const edit=row.querySelector('[data-field-editable]');
    if(edit){edit.disabled=!cb.checked;if(!cb.checked)edit.checked=false;}
    cb.closest('.permissionOption')?.classList.toggle('selected',cb.checked);
    edit?.closest('.permissionOption')?.classList.toggle('selected',!!edit.checked&&!edit.disabled);
  }));
  document.querySelectorAll('[data-field-editable]').forEach(cb=>cb.addEventListener('change',()=>cb.closest('.permissionOption')?.classList.toggle('selected',cb.checked&&!cb.disabled)));
  document.querySelectorAll('[data-field-required]').forEach(cb=>cb.addEventListener('change',()=>cb.closest('.permissionOption')?.classList.toggle('selected',cb.checked)));
  document.querySelectorAll('[data-field-enabled]').forEach(cb=>cb.addEventListener('change',()=>cb.closest('.configSwitch')?.classList.toggle('checked',cb.checked)));
  $('addCharacterField').onclick=()=>openAddCharacterFieldModal();
  $('saveCharacterFields').onclick=async()=>{
    try{
      const updates=[...document.querySelectorAll('.fieldConfigCard')].map((row,index)=>{
        const id=row.dataset.configId;
        const f=fields.find(x=>String(x.id)===String(id));
        const visible=row.querySelector('[data-field-visible]').checked;
        const locked=f.field_key==='name';
        return {id,label:row.querySelector('[data-field-label]').value.trim()||f.label,enabled:locked?true:row.querySelector('[data-field-enabled]').checked,player_visible:locked?true:visible,player_editable:locked?true:visible&&row.querySelector('[data-field-editable]').checked,required:locked?true:row.querySelector('[data-field-required]').checked,sort_order:index*10};
      });
      for(const u of updates){const {error}=await sb.from('character_field_definitions').update({label:u.label,enabled:u.enabled,player_visible:u.player_visible,player_editable:u.player_editable,required:u.required,sort_order:u.sort_order}).eq('id',u.id);if(error)throw error;}
      const {data,error}=await sb.from('character_field_definitions').select('*').eq('campaign_id',state.campaign.id).order('sort_order');if(error)throw error;
      state.characterFields=data||[];closeModal();renderAll();toast('Configuração da ficha salva');
    }catch(e){toast(e.message||'Não foi possível salvar a configuração.','error');}
  };
}

function openAddCharacterFieldModal(){
  showModal(`<div class="modalHeader"><div><div class="eyebrow">NOVO CAMPO</div><h3>Campo personalizado</h3></div><button class="closeButton" data-close>×</button></div>
    <label>Nome do campo<input id="newFieldLabel" maxlength="80" placeholder="Ex.: Fama"></label>
    <label>Tipo<select id="newFieldType"><option value="text">Texto curto</option><option value="number">Número</option><option value="textarea">Texto longo</option><option value="select">Seleção</option><option value="checkbox">Sim / não</option><option value="url">URL</option></select></label>
    <label id="newFieldOptionsWrap" class="hidden">Opções da seleção<input id="newFieldOptions" placeholder="Baixa, Média, Alta"></label>
    <div class="configToggleGrid"><label><input id="newFieldEnabled" type="checkbox" checked> Ativo</label><label><input id="newFieldVisible" type="checkbox" checked> Jogador vê</label><label><input id="newFieldEditable" type="checkbox" checked> Jogador edita</label><label><input id="newFieldRequired" type="checkbox"> Obrigatório</label></div>
    <p class="modalHint">O valor será armazenado na ficha da campanha e poderá ser usado independentemente do sistema de RPG.</p>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="createCustomField" class="primarySmall">Adicionar campo</button></div>`);
  $('newFieldType').onchange=()=>$('newFieldOptionsWrap').classList.toggle('hidden',$('newFieldType').value!=='select');
  $('newFieldVisible').onchange=()=>{if(!$('newFieldVisible').checked)$('newFieldEditable').checked=false;$('newFieldEditable').disabled=!$('newFieldVisible').checked;};
  $('createCustomField').onclick=async()=>{
    try{
      const label=$('newFieldLabel').value.trim();if(!label){toast('Informe o nome do campo.','error');return;}
      const type=$('newFieldType').value;const key='custom_'+slugifyField(label)+'_'+Date.now().toString(36);
      const options=type==='select'?$('newFieldOptions').value.split(',').map(x=>x.trim()).filter(Boolean):[];
      const next=(state.characterFields||[]).reduce((m,f)=>Math.max(m,Number(f.sort_order)||0),0)+10;
      const payload={campaign_id:state.campaign.id,field_key:key,label,field_type:type,data_key:'sheet_data.'+key,options,enabled:$('newFieldEnabled').checked,player_visible:$('newFieldVisible').checked,player_editable:$('newFieldEditable').checked,required:$('newFieldRequired').checked,sort_order:next};
      const {data,error}=await sb.from('character_field_definitions').insert(payload).select().maybeSingle();if(error)throw error;if(!data)throw new Error('O campo não foi confirmado pelo servidor.');state.characterFields.push(data);closeModal();openCharacterFieldConfig();toast('Campo adicionado');
    }catch(e){toast(e.message||'Não foi possível adicionar o campo.','error');}
  };
}
function normalizeFieldKey(label){
  return String(label||'campo').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'campo';
}
function fieldValueFromCharacter(character,field){
  const path=String(field.data_key||'').split('.');
  if(path.length===1)return character?.[path[0]];
  return character?.[path[0]]?.[path[1]];
}
function setFieldValue(payload,field,value){
  const path=String(field.data_key||'').split('.');
  if(path.length===1){payload[path[0]]=value;return;}
  if(!payload[path[0]]||typeof payload[path[0]]!=='object')payload[path[0]]={};
  payload[path[0]][path[1]]=value;
}
function fieldInputHtml(field,character,isMasterEditor){
  const raw=fieldValueFromCharacter(character,field);
  const value=raw===null||raw===undefined?'':raw;
  const disabled=(!isMasterEditor && !field.player_editable)?'disabled':'';
  const required=field.required?'required':'';
  const req=field.required?'<span class="requiredMark">*</span>':'';
  const id='field_'+field.id;
  const options=Array.isArray(field.options)?field.options:[];
  if(field.data_key==='avatar_url'){
    return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="url" value="${escapeHtml(value)}" placeholder="https://.../imagem.webp" ${disabled} ${required}><input id="${id}_file" class="dynamicFile" type="file" accept="image/*" ${disabled}><small>URL ou envio de arquivo</small></label>`;
  }
  if(field.field_type==='textarea'){
    return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<textarea id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="textarea" rows="6" ${disabled} ${required}>${escapeHtml(value)}</textarea>${disabled?'<small>Somente o mestre</small>':''}</label>`;
  }
  if(field.field_type==='number'){
    return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="number" type="number" value="${escapeHtml(value)}" ${disabled} ${required}>${disabled?'<small>Somente o mestre</small>':''}</label>`;
  }
  if(field.field_type==='select'){
    return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<select id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="select" ${disabled} ${required}><option value="">Selecione</option>${options.map(o=>`<option value="${escapeHtml(o)}" ${String(value)===String(o)?'selected':''}>${escapeHtml(o)}</option>`).join('')}</select>${disabled?'<small>Somente o mestre</small>':''}</label>`;
  }
  if(field.field_type==='checkbox'){
    return `<label class="dynamicCheck"><input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="checkbox" type="checkbox" ${value?'checked':''} ${disabled}> <span>${escapeHtml(field.label)}</span>${field.required?'<span class="requiredMark">*</span>':''}</label>`;
  }
  return `<label class="dynamicField">${escapeHtml(field.label)} ${req}<input id="${id}" data-field-id="${field.id}" data-data-key="${escapeHtml(field.data_key)}" data-type="${field.field_type||'text'}" value="${escapeHtml(value)}" ${disabled} ${required}>${disabled?'<small>Somente o mestre</small>':''}</label>`;
}
function getDynamicFieldDefinitions(isMasterEditor){
  return (state.characterFields||[]).filter(f=>f.enabled && (isMasterEditor || f.player_visible)).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
}
function buildCharacterPayloadFromFields(formRoot){
  const payload={campaign_id:state.campaign.id,attributes:{},sheet_data:{}};
  formRoot.querySelectorAll('[data-field-id]').forEach(el=>{
    const type=el.dataset.type;
    let value;
    if(type==='checkbox')value=el.checked;
    else if(type==='number')value=el.value===''?null:Number(el.value);
    else value=el.value;
    const field=state.characterFields.find(f=>String(f.id)===String(el.dataset.fieldId));
    if(field)setFieldValue(payload,field,value);
  });
  return payload;
}
async function openCharacterModal(id){
  const existing=id?state.characters.find(x=>x.id===id):null;
  if(existing && !canEdit() && existing.player_id!==state.user.id){toast('Você só pode editar sua própria ficha.','error');return;}
  const isMasterEditor=canEdit();
  const c=existing||{name:'',class_name:'',ancestry_name:'',level:1,hp_current:'',hp_max:'',armor_class:'',luck:0,luck_points:0,notes:'',attributes:{},sheet_data:{},avatar_url:''};
  const defs=getDynamicFieldDefinitions(isMasterEditor);
  const visibleFields=defs.length?defs:[{id:'fallback_name',label:'Nome do personagem',field_type:'text',data_key:'name',enabled:true,player_visible:true,player_editable:true,required:true,sort_order:0}];
  const memberOptions=state.members.map(m=>{const p=profileFor(m.user_id);return `<option value="${m.user_id}" ${(c.player_id||state.user.id)===m.user_id?'selected':''}>${escapeHtml(p?.display_name||(m.user_id===state.user.id?'Você':'Jogador'))}</option>`;}).join('');
  const fieldsHtml=visibleFields.map(f=>fieldInputHtml(f,c,isMasterEditor)).join('');
  const playerFieldNote=isMasterEditor?'Você está visualizando a ficha como mestre. Campos podem ser exibidos ou limitados aos jogadores na configuração.':'Preencha somente os campos liberados pelo mestre desta campanha.';
  showModal(`<div class="modalHeader"><div><div class="eyebrow">FICHA DA CAMPANHA</div><h3>${existing?'Editar personagem':'Novo personagem'}</h3></div><button class="closeButton" data-close>×</button></div>
    <p class="modalHint">${playerFieldNote}</p>
    ${isMasterEditor?`<div class="characterAssign"><label>Jogador responsável<select id="charPlayer">${memberOptions}</select></label></div>`:''}
    <div id="dynamicCharacterFields" class="dynamicCharacterFields">${fieldsHtml}</div>
    <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveCharacter" class="primarySmall">Salvar ficha</button></div>`);
  $('saveCharacter').onclick=async()=>{
    try{
      const payload=buildCharacterPayloadFromFields($('dynamicCharacterFields'));
      payload.id=undefined;
      payload.campaign_id=state.campaign.id;
      if(isMasterEditor){payload.player_id=$('charPlayer')?.value||null;}else{payload.player_id=state.user.id;}
      const name=payload.name?.trim?.()||'';
      if(!name){toast('O nome do personagem é obrigatório.','error');return;}
      const defsForValidation=getDynamicFieldDefinitions(isMasterEditor);
      for(const f of defsForValidation){
        if(!f.required||(!isMasterEditor&&!f.player_editable)||!f.enabled)continue;
        const v=fieldValueFromCharacter(payload,f);
        if(v===null||v===undefined||v===''||(f.field_type==='checkbox'&&v!==true)){toast('Preencha o campo obrigatório: '+f.label,'error');return;}
      }
      if(!payload.attributes)payload.attributes={};
      if(!payload.sheet_data)payload.sheet_data={};
      if(existing){
        const updatePayload={...payload};delete updatePayload.id;
        const result=await sb.from('characters').update(updatePayload).eq('id',existing.id).select('*').maybeSingle();
        if(result.error)throw result.error;
        let data=result.data;
        if(!data){
          const verify=await sb.from('characters').select('*').eq('id',existing.id).maybeSingle();
          if(verify.error)throw verify.error;
          data=verify.data;
        }
        if(!data)throw new Error('A ficha foi alterada, mas não pôde ser lida de volta.');
        state.characters=state.characters.map(x=>x.id===existing.id?data:x);
      }else{
        const characterId=uid();
        payload.id=characterId;
        const result=await sb.from('characters').insert(payload).select('*').maybeSingle();
        if(result.error)throw result.error;
        let data=result.data;
        if(!data){
          const verify=await sb.from('characters').select('*').eq('id',characterId).maybeSingle();
          if(verify.error)throw verify.error;
          data=verify.data;
        }
        if(!data)throw new Error('A ficha foi criada, mas não pôde ser carregada de volta.');
        state.characters.push(data);
      }
      const fileIds=visibleFields.filter(f=>f.data_key==='avatar_url').map(f=>f.id);
      for(const fieldId of fileIds){
        const file=$( 'field_'+fieldId+'_file')?.files?.[0];
        if(file){
          const avatar=await uploadMedia(file,'characters/'+(existing?.id||uid()));
          const targetId=existing?.id||state.characters.at(-1).id;
          const result=await sb.from('characters').update({avatar_url:avatar}).eq('id',targetId).select('*').maybeSingle();
          if(result.error)throw result.error;
          let data=result.data;
          if(!data){
            const verify=await sb.from('characters').select('*').eq('id',targetId).maybeSingle();
            if(verify.error)throw verify.error;
            data=verify.data;
          }
          if(!data)throw new Error('A ficha recebeu a imagem, mas não pôde ser recarregada.');
          state.characters=state.characters.map(x=>x.id===targetId?data:x);
        }
      }
      closeModal();renderAll();toast('Ficha salva');
    }catch(e){toast(e.message||'Não foi possível salvar a ficha.','error');}
  };
}

$('newFloorBtn').onclick=()=>openFloorModal(null,currentLocation()?.id);

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
  <label>Histórico da sessão <span class="optional">(escrito pelo mestre)</span><textarea id="sessHistory" rows="10" maxlength="20000" placeholder="Registre o que aconteceu durante a aventura: decisões, descobertas, NPCs encontrados, combates, consequências, itens obtidos e tudo que você quiser preservar para a próxima sessão.">${escapeHtml(s?.history||'')}</textarea>
  <p class="modalHint">A descrição é opcional. O histórico é exclusivo de edição do mestre, mas pode ser consultado por todos os participantes da campanha.</p>
  <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveSession" class="primarySmall">${s?'Salvar alterações':'Criar sessão'}</button></div>`);
  $('saveSession').onclick=async()=>{
    try{
      const title=$('sessTitle').value.trim();
      if(!title){toast('Informe o título da sessão.','error');$('sessTitle').focus();return;}
      const payload={campaign_id:state.campaign.id,session_number:Number($('sessNumber').value)||next,title,summary:$('sessSummary').value.trim(),history:$('sessHistory').value.trim(),starts_at:$('sessStarts').value?new Date($('sessStarts').value).toISOString():null,status:$('sessStatus').value,created_by:s?s.created_by:state.user.id};
      const result=s?await sb.from('sessions').update(payload).eq('id',s.id).select().maybeSingle():await sb.from('sessions').insert(payload).select().maybeSingle();
      if(result.error)throw result.error;
      if(!result.data)throw new Error('O servidor não confirmou a sessão.');
      if(s)state.sessions=state.sessions.map(x=>x.id===s.id?result.data:x);else state.sessions.push(result.data);
      state.selectedSessionId=result.data.id;closeModal();await subscribeRealtime();renderAll();toast(s?'Sessão atualizada':'Sessão criada');
    }catch(e){toast(e.message||'Não foi possível salvar a sessão.','error');}
  };
}
async function activateSession(id){if(!id)return;const session=state.sessions.find(x=>x.id===id);if(!session)return;state.selectedSessionId=id;state.floor=session.active_floor_id||state.floor;state.selected=session.active_room_id?{type:'room',id:session.active_room_id}:null;state.tool='move';window.rpgVttSetTool?.('move');window.rpgVttContextChanged?.();const af=state.floors.find(f=>f.id===state.floor);if(af)state.location=state.locations.find(l=>l.id===af.location_id)||state.location;renderAll();await subscribeRealtime();toast(`Sessão #${session.session_number} aberta`);}

function openNpcModal(id){if(!requireMaster())return;const n=id?state.npcs.find(x=>x.id===id):null;const v=n||{name:'',description:'',notes_private:'',avatar_url:'',data:{}};showModal(`<div class="modalHeader"><div><div class="eyebrow">BESTIÁRIO</div><h3>${n?'Editar entidade':'Novo NPC / monstro'}</h3></div><button class="closeButton" data-close>×</button></div><label>Nome<input id="npcName" value="${escapeHtml(v.name)}"></label><label>Descrição<textarea id="npcDesc" rows="4">${escapeHtml(v.description||'')}</textarea></label><label>Notas privadas do mestre<textarea id="npcNotes" rows="5">${escapeHtml(v.notes_private||'')}</textarea></label><label>Avatar URL<input id="npcAvatar" value="${escapeHtml(v.avatar_url||'')}" placeholder="https://..."></label><label>Avatar do NPC<input id="npcFile" type="file" accept="image/*"></label><label>Dados / ficha (JSON)<textarea id="npcData" rows="6">${escapeHtml(JSON.stringify(v.data||{},null,2))}</textarea></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveNpc" class="primarySmall">Salvar</button></div>`);$('saveNpc').onclick=async()=>{try{const payload={campaign_id:state.campaign.id,name:$('npcName').value.trim(),description:$('npcDesc').value.trim(),notes_private:$('npcNotes').value.trim(),avatar_url:$('npcAvatar').value.trim()||null,data:JSON.parse($('npcData').value||'{}')};if(!payload.name)throw new Error('Informe o nome.');const file=$('npcFile').files[0];if(file)payload.avatar_url=await uploadMedia(file,`npcs/${uid()}`);const result=n?await sb.from('npcs').update(payload).eq('id',n.id).select().maybeSingle():await sb.from('npcs').insert(payload).select().maybeSingle();if(result.error)throw result.error;if(!result.data)throw new Error('O servidor não confirmou o NPC.');if(n)state.npcs=state.npcs.map(x=>x.id===n.id?result.data:x);else state.npcs.push(result.data);closeModal();renderAll();toast('NPC salvo');}catch(e){toast(e.message,'error');}};}

async function addCharacterToBoard(id){
  if(!requireMaster())return;
  const c=state.characters.find(x=>x.id===id);if(!c)return;
  if(state.entities.some(e=>e.character_id===id)){toast('Esse personagem já está na mesa.');return;}
  const entityId=uid();
  const payload={id:entityId,campaign_id:state.campaign.id,character_id:id,entity_kind:'character',display_name:c.name,icon:'♙',color:colors[state.entities.length%colors.length],floor_id:state.floor,x:50,y:50,room_id:null,visible:true,metadata:{}};
  const result=await sb.from('world_entities').insert(payload).select('*').maybeSingle();
  if(result.error){toast(result.error.message,'error');return;}
  let data=result.data;
  if(!data){
    const verify=await sb.from('world_entities').select('*').eq('id',entityId).maybeSingle();
    if(verify.error){toast(verify.error.message,'error');return;}
    data=verify.data;
  }
  if(!data){toast('O personagem foi adicionado, mas o token não pôde ser carregado.','error');return;}
  state.entities.push(data);renderAll();toast(`${c.name} entrou na mesa`);
}
async function addNpcToBoard(id){
  if(!requireMaster())return;
  const n=state.npcs.find(x=>x.id===id);if(!n)return;
  if(state.entities.some(e=>e.npc_id===id)){toast('Essa entidade já está na mesa.');return;}
  const entityId=uid();
  const payload={id:entityId,campaign_id:state.campaign.id,npc_id:id,entity_kind:'npc',display_name:n.name,icon:'♜',color:colors[state.entities.length%colors.length],floor_id:state.floor,x:50,y:50,room_id:null,visible:true,metadata:{}};
  const result=await sb.from('world_entities').insert(payload).select('*').maybeSingle();
  if(result.error){toast(result.error.message,'error');return;}
  let data=result.data;
  if(!data){
    const verify=await sb.from('world_entities').select('*').eq('id',entityId).maybeSingle();
    if(verify.error){toast(verify.error.message,'error');return;}
    data=verify.data;
  }
  if(!data){toast('A entidade foi adicionada, mas o token não pôde ser carregado.','error');return;}
  state.entities.push(data);renderAll();toast(`${n.name} entrou na mesa`);
}
function roomAtPosition(x,y,floorId){
  return state.rooms.find(r=>r.floor_id===floorId&&pointInsideRoom(x,y,r))||null;
}
function renderEntityAttributes(character){
  const attrs=character?.attributes||{};
  const map={forca:['Força','strength'],destreza:['Destreza','dexterity'],constituicao:['Constituição','constitution'],inteligencia:['Inteligência','intelligence'],sabedoria:['Sabedoria','wisdom'],carisma:['Carisma','charisma']};
  return Object.entries(map).map(([key,item])=>'<div class="entityAttr"><span>'+item[0]+'</span><b>'+escapeHtml(attrs[key]??attrs[item[1]]??0)+'</b></div>').join('');
}
function renderSheetExtras(data){
  if(!data||typeof data!=='object'||!Object.keys(data).length)return '<div class="entityEmptyNote">Nenhuma informação complementar cadastrada.</div>';
  return Object.entries(data).filter(([k])=>k!=='attributes').slice(0,12).map(([key,value])=>{const text=typeof value==='object'?JSON.stringify(value,null,2):String(value??'');return '<div class="entityExtra"><span>'+escapeHtml(key.replace(/[_-]+/g,' '))+'</span><p>'+escapeHtml(text)+'</p></div>';}).join('');
}
function openEntityModal(id){
  const e=state.entities.find(x=>x.id===id); if(!e)return;
  const c=e.character_id?state.characters.find(x=>x.id===e.character_id):null;
  const n=e.npc_id?state.npcs.find(x=>x.id===e.npc_id):null;
  const floor=state.floors.find(f=>f.id===e.floor_id);
  const room=state.rooms.find(r=>r.id===e.room_id)||roomAtPosition(Number(e.x),Number(e.y),e.floor_id);
  const player=c?profileFor(c.player_id):null;
  const avatar=c?.avatar_url||n?.avatar_url||null;
  if(c){
    const hpCurrent=Number(c.hp_current??0), hpMax=Number(c.hp_max||0), hpPct=hpMax>0?Math.max(0,Math.min(100,(hpCurrent/hpMax)*100)):0;
    const html=''+
      '<div class="entityDetailHeader"><div class="entityHeroAvatar">'+(avatar?'<img src="'+escapeHtml(avatar)+'" alt="">':escapeHtml(e.icon||'♙'))+'</div>'+
      '<div class="entityHeroText"><div class="eyebrow">PERSONAGEM</div><h3>'+escapeHtml(c.name)+'</h3><p>'+escapeHtml(c.class_name||'Classe não definida')+(c.ancestry_name?' · '+escapeHtml(c.ancestry_name):'')+'</p></div>'+
      '<button class="closeButton" data-close>×</button></div>'+
      '<section class="entityLocationCard"><div class="entitySectionLabel">LOCALIZAÇÃO ATUAL</div><div class="entityLocationMain"><div class="entityLocationIcon">⌖</div><div><b>'+escapeHtml(room?.name||'Área não definida')+'</b><span>'+escapeHtml(floor?.name||'Andar não definido')+'</span></div><small>'+Number(e.x).toFixed(1)+'% · '+Number(e.y).toFixed(1)+'%</small></div></section>'+
      '<section class="entitySection"><div class="entitySectionLabel">STATUS DO PERSONAGEM</div><div class="entityInfoGrid">'+
      '<div><span>JOGADOR</span><b>'+escapeHtml(player?.display_name||'Não identificado')+'</b></div>'+
      '<div><span>NÍVEL</span><b>'+escapeHtml(c.level??1)+'</b></div>'+
      '<div><span>CLASSE</span><b>'+escapeHtml(c.class_name||'—')+'</b></div>'+
      '<div><span>ANCESTRALIDADE</span><b>'+escapeHtml(c.ancestry_name||'—')+'</b></div>'+
      '<div><span>CA</span><b>'+escapeHtml(c.armor_class??'—')+'</b></div>'+
      '<div><span>SORTE</span><b>'+escapeHtml(c.luck??0)+'</b></div>'+
      '</div></section>'+
      '<section class="entitySection"><div class="entitySectionLabel">VIDA</div><div class="hpPanel"><div class="hpTop"><span>HP atual</span><strong>'+escapeHtml(hpCurrent)+' / '+escapeHtml(hpMax||'—')+'</strong></div><div class="hpTrack"><span style="width:'+hpPct+'%"></span></div><div class="hpFoot"><span>'+hpPct.toFixed(0)+'% da vida</span><span>'+escapeHtml(c.luck_points??0)+' pontos de sorte</span></div></div></section>'+
      '<section class="entitySection"><div class="entitySectionLabel">ATRIBUTOS</div><div class="entityAttributes">'+renderEntityAttributes(c)+'</div></section>'+
      '<section class="entitySection"><div class="entitySectionLabel">FICHA COMPLEMENTAR</div><div class="entityExtras">'+renderSheetExtras(c.sheet_data)+'</div>'+(c.notes?'<div class="entityNotes"><span>NOTAS</span><p>'+escapeHtml(c.notes)+'</p></div>':'')+'</section>'+
      '<div class="modalActions"><button class="softButton" data-close>Fechar</button><button id="openCharacterSheet" class="primarySmall">Abrir ficha completa</button>'+(canEdit()?'<button id="removeEntity" class="dangerButton">Remover da mesa</button>':'')+'</div>';
    showModal(html);
    $('openCharacterSheet').onclick=()=>{closeModal();openCharacterModal(c.id);};
  }else if(n){
    const html=''+
      '<div class="entityDetailHeader"><div class="entityHeroAvatar">'+(avatar?'<img src="'+escapeHtml(avatar)+'" alt="">':escapeHtml(e.icon||'♜'))+'</div><div class="entityHeroText"><div class="eyebrow">NPC / CRIATURA</div><h3>'+escapeHtml(n.name)+'</h3><p>'+escapeHtml(n.description||'Entidade da campanha')+'</p></div><button class="closeButton" data-close>×</button></div>'+
      '<section class="entityLocationCard"><div class="entitySectionLabel">LOCALIZAÇÃO ATUAL</div><div class="entityLocationMain"><div class="entityLocationIcon">⌖</div><div><b>'+escapeHtml(room?.name||'Área não definida')+'</b><span>'+escapeHtml(floor?.name||'Andar não definido')+'</span></div><small>'+Number(e.x).toFixed(1)+'% · '+Number(e.y).toFixed(1)+'%</small></div></section>'+
      '<section class="entitySection"><div class="entitySectionLabel">DETALHES</div><div class="entityInfoGrid"><div><span>TIPO</span><b>'+escapeHtml(e.entity_kind||'npc')+'</b></div><div><span>POSIÇÃO</span><b>'+Number(e.x).toFixed(1)+' / '+Number(e.y).toFixed(1)+'</b></div></div>'+(n.notes_private&&canEdit()?'<div class="entityPrivate"><span>ANOTAÇÃO PRIVADA DO MESTRE</span><p>'+escapeHtml(n.notes_private)+'</p></div>':'')+'</section>'+
      '<section class="entitySection"><div class="entitySectionLabel">DADOS COMPLEMENTARES</div><div class="entityExtras">'+renderSheetExtras(n.data)+'</div></section>'+
      '<div class="modalActions"><button class="softButton" data-close>Fechar</button>'+(canEdit()?'<button id="removeEntity" class="dangerButton">Remover da mesa</button>':'')+'</div>';
    showModal(html);
  }else{
    showModal('<div class="entityDetailHeader"><div class="entityHeroAvatar">'+escapeHtml(e.icon||'◆')+'</div><div class="entityHeroText"><div class="eyebrow">ENTIDADE</div><h3>'+escapeHtml(e.display_name)+'</h3><p>Entidade independente da campanha</p></div><button class="closeButton" data-close>×</button></div><section class="entityLocationCard"><div class="entitySectionLabel">LOCALIZAÇÃO ATUAL</div><div class="entityLocationMain"><div class="entityLocationIcon">⌖</div><div><b>'+escapeHtml(room?.name||'Área não definida')+'</b><span>'+escapeHtml(floor?.name||'Andar não definido')+'</span></div></div></section><div class="modalActions"><button class="softButton" data-close>Fechar</button></div>');
  }
  if(canEdit()&&$('removeEntity'))$('removeEntity').onclick=async()=>{const {error}=await sb.from('world_entities').delete().eq('id',id);if(error){toast(error.message,'error');return;}state.entities=state.entities.filter(x=>x.id!==id);state.selected=null;closeModal();renderAll();toast('Entidade removida da mesa');};
}

const MAX_AUDIO_UPLOAD_BYTES=50*1024*1024;
function safeUploadExtension(file){const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');return ext||'bin';}
async function uploadMedia(file,prefix){
  if(!file)throw new Error('Nenhum arquivo selecionado.');
  if(file.size>MAX_AUDIO_UPLOAD_BYTES)throw new Error('O projeto atual aceita até 50 MB por arquivo no plano Supabase atual. Para 90 MB, o limite global do projeto precisa ser aumentado.');
  const ext=safeUploadExtension(file);const path=`${state.user.id}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;uploadMedia.lastPath=path;
  const {data:{session}}=await sb.auth.getSession();if(!session?.access_token)throw new Error('Sua sessão expirou. Faça login novamente.');
  if(file.size<=6*1024*1024){const {error}=await sb.storage.from('rpg-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||'application/octet-stream'});if(error)throw error;uploadMedia.lastPath=path;return sb.storage.from('rpg-media').getPublicUrl(path).data.publicUrl;}
  const projectRef='ymexyrqgqpktxzajgsdi';const endpoint=`https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  const encode=value=>btoa(unescape(encodeURIComponent(value)));const meta=[`bucketName ${encode('rpg-media')}`,`objectName ${encode(path)}`,`contentType ${encode(file.type||'application/octet-stream')}`,`cacheControl ${encode('3600')}`].join(',');
  const create=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'x-upsert':'false','Tus-Resumable':'1.0.0','Upload-Length':String(file.size),'Upload-Metadata':meta}});if(!create.ok)throw new Error((await create.text())||'Não foi possível iniciar o upload.');
  let uploadUrl=create.headers.get('Location');if(uploadUrl&&!uploadUrl.startsWith('http'))uploadUrl=new URL(uploadUrl,endpoint).toString();if(!uploadUrl)throw new Error('O Storage não retornou a URL de upload.');
  let offset=0;const chunkSize=5*1024*1024;while(offset<file.size){const chunk=file.slice(offset,Math.min(offset+chunkSize,file.size));const patch=await fetch(uploadUrl,{method:'PATCH',headers:{Authorization:`Bearer ${session.access_token}`,'Tus-Resumable':'1.0.0','Upload-Offset':String(offset),'Content-Type':'application/offset+octet-stream'},body:chunk});if(!patch.ok)throw new Error((await patch.text())||`Falha no upload em ${Math.round(offset/file.size*100)}%.`);const serverOffset=Number(patch.headers.get('Upload-Offset'));offset=Number.isFinite(serverOffset)&&serverOffset>offset?serverOffset:offset+chunk.size;setSave(`Enviando áudio… ${Math.round(offset/file.size*100)}%`,true);}
  return sb.storage.from('rpg-media').getPublicUrl(path).data.publicUrl;
}
async function playLocalAudio(payload){
  if(payload.action==='stop'||payload.action==='stop-all'){await stopAllAudioLayers({broadcast:false});return;}
  if(payload.action==='stop-layer'){await stopAudioLayer(payload.layer_id,{broadcast:false});return;}
  if(payload.action==='set-volume'){await setAudioLayerVolume(payload.layer_id,payload.volume,{broadcast:false});return;}
  if(payload.action==='play-layer')await playAudioLayer(payload,{broadcast:false});
}
function receiveAudio(payload){return playLocalAudio(payload);}

async function performRoll(notation,rule='normal'){
  const parsed=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(notation.trim());if(!parsed)throw new Error('Use uma notação como 1d20 ou 2d6+3.');
  const count=Math.min(50,Math.max(1,Number(parsed[1]))),sides=Math.min(1000,Math.max(2,Number(parsed[2]))),modifier=Number(parsed[3]||0);
  const rollOnce=n=>{const arr=[];const limit=Math.floor((2**32)/sides)*sides;while(arr.length<n){const v=new Uint32Array(1);crypto.getRandomValues(v);if(v[0]>=limit)continue;arr.push((v[0]%sides)+1);}return arr;};
  let base=[];let finalBase=[];let appliedRule='Normal';
  if((rule==='advantage'||rule==='disadvantage')&&count===1&&sides===20){const a=rollOnce(1)[0],b=rollOnce(1)[0];base=[a,b];finalBase=[rule==='advantage'?Math.max(a,b):Math.min(a,b)];appliedRule=rule==='advantage'?'Vantagem (maior)':'Desvantagem (menor)';}else{base=rollOnce(count);finalBase=base;appliedRule='Normal';}
  const final=finalBase.reduce((a,b)=>a+b,0)+modifier;
  const payload={campaign_id:state.campaign.id,session_id:currentSession()?.id||null,roller_user_id:state.user.id,roller_display_name:state.profile?.display_name||state.user?.email?.split('@')[0]||'Jogador',character_id:state.characters.find(c=>c.player_id===state.user.id)?.id||null,notation:notation.trim(),base_results:base,rule_results:{label:appliedRule,selected:finalBase,modifier},final_result:final,created_at:new Date().toISOString()};
  const {data,error}=await sb.from('dice_rolls').insert(payload).select('*').maybeSingle();
  if(error)throw error;
  let saved=data;
  if(!saved){
    const verify=await sb.from('dice_rolls').select('*').eq('campaign_id',payload.campaign_id).eq('roller_user_id',payload.roller_user_id).eq('created_at',payload.created_at).maybeSingle();
    if(verify.error)throw verify.error;
    saved=verify.data;
  }
  if(!saved)throw new Error('A rolagem foi executada, mas não foi possível confirmá-la no servidor.');
  if(canEdit()&&!state.rolls.some(r=>r.id===saved.id)) state.rolls=[saved,...state.rolls];
  renderDiceResult(saved);
  renderDice();
  if(state.campaignChannel)await state.campaignChannel.send({type:'broadcast',event:'dice_roll',payload:{...saved,user_id:state.user.id}});
  await logCampaignActivity('dice_roll','dice',payload.roller_display_name+' rolou '+payload.notation+': '+payload.final_result,saved?.id||null,{notation:payload.notation,final_result:payload.final_result,rule:appliedRule});
  return saved;
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
      const {data,error}=await sb.from('profiles').update({display_name:$('profileName').value.trim()||'Aventureiro',account_type,avatar_url:avatar,bio:$('profileBio').value.trim()}).eq('id',state.user.id).select().maybeSingle();
      if(error)throw error;if(!data)throw new Error('O perfil não foi confirmado pelo servidor.');state.profile=data;closeModal();renderAll();toast(account_type==='master'?'Conta definida como Mestre':'Conta definida como Jogador');
    }catch(e){toast(e.message||'Não foi possível salvar o perfil.','error');}
  };
}

async function ensureActiveAudioHandlers(){ const active=currentSession(); if(!active)return; if(!$('enableAudioBtn'))return; $('enableAudioBtn').onclick=async()=>{try{state.audioEnabled=true;const ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')await ctx.resume();const osc=ctx.createOscillator();osc.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.01);renderDice();toast('Áudio ativado para esta mesa');}catch(e){toast('Não foi possível ativar o áudio.','error');}}; }

// Navigation
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{if((b.dataset.view==='masterdashboard'||b.dataset.view==='chronicle')&&!canEdit()){state.view='table';renderView();return;}state.view=b.dataset.view;renderView();if(state.view==='dice'){renderDice();setTimeout(wireAudioControls,0);}if(state.view==='masterdashboard'){renderMasterDashboard();}});
$('mobileProfileBtn')?.addEventListener('click',()=>profileModal());
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
$('deleteCampaignBtn').onclick=()=>{if(canEdit())openDeleteCampaignModal();};
$('joinCampaignBtn').onclick=()=>openJoinCampaignModal();
$('campaignInviteBtn').onclick=()=>openCampaignInvite();
$('newLocationTopBtn')?.addEventListener('click',openLocationCreateModal);
$('mobileNewCampaignBtn')?.addEventListener('click',()=>{if(canCreateCampaign())openCampaignCreate(false);else toast('Mude sua conta para Mestre no perfil para criar campanhas.','error');});
$('mobileJoinCampaignBtn')?.addEventListener('click',openJoinCampaignModal);
$('mobileCampaignSelect')?.addEventListener('change',async()=>{state.campaign=state.campaigns.find(c=>c.id===$('mobileCampaignSelect').value)||null;state.floor=null;state.selected=null;await loadCampaignData();});
$('newCampaignBtn').onclick=()=>{if(!canCreateCampaign()){toast('Somente contas Mestre podem criar campanhas. O tipo de conta é administrativo.','error');return;}openCampaignCreate(false);}; $('openSessionsBtn').onclick=()=>{state.view='sessions';renderView();}; $('openDiceBtn').onclick=()=>{state.view='dice';renderView();renderDice();setTimeout(wireAudioControls,0);};
$('newRoomBtn').onclick=()=>{if(requireMaster())openRoomModal();};
$('structureBtn').onclick=()=>{if(state.tool==='draw'){state.tool='move';window.rpgVttSetTool?.('move');}else{state.tool='draw';window.rpgVttSetTool?.('move');}$('structureBtn').classList.toggle('chosen',state.tool==='draw');$('moveBtn').classList.toggle('chosen',state.tool==='move');$('board').classList.toggle('drawing',state.tool==='draw');$('boardHint').textContent=state.tool==='draw'?'Clique e arraste para desenhar um novo cômodo':'Arraste entidades e cômodos para reposicionar';};
$('moveBtn').onclick=()=>{state.tool='move';window.rpgVttSetTool?.('move');$('moveBtn').classList.add('chosen');$('structureBtn').classList.remove('chosen');$('board').classList.remove('drawing');$('boardHint').textContent='Arraste entidades e cômodos para reposicionar';};
$('zoomIn').onclick=()=>{state.zoom=Math.min(200,state.zoom+10);applyZoom();};
$('zoomOut').onclick=()=>{state.zoom=Math.max(75,state.zoom-10);applyZoom();};
$('characterFieldsBtn')?.addEventListener('click',openCharacterFieldConfig);
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
  if($('enablePlayerAudioBtn'))$('enablePlayerAudioBtn').onclick=async()=>{try{await unlockAudio();toast('Sons da campanha ativados');}catch(e){toast('Não foi possível ativar os sons.','error');}};

  if($('enableAudioBtn'))$('enableAudioBtn').onclick=async()=>{try{await unlockAudio();renderDice();toast('Áudio ativado para a campanha');}catch(e){toast(e.message||'Não foi possível ativar o áudio.','error');}};
  $('playAudioBtn')?.addEventListener('click',async()=>{try{let url=$('audioUrl').value.trim();const file=$('audioFile').files[0];const kind=$('audioKind').value;let name=$('audioName').value.trim();let storagePath=null;if(file){url=await uploadMedia(file,'audio');storagePath=uploadMedia.lastPath||null;}if(!url)throw new Error('Cole uma URL ou selecione um arquivo.');if(!name)name=file?.name||audioKindLabel(kind);const volume=Number($('audioVolume').value)||0.75;const loop=['music','ambient'].includes(kind);let asset=null;if($('audioSaveLibrary')?.checked)asset=await saveAudioAsset({name,kind,url,volume,loop,storagePath});await unlockAudio();await playAudioLayer({action:'play-layer',url,name,kind,loop,volume,asset_id:asset?.id||null});$('audioUrl').value='';$('audioFile').value='';$('audioName').value='';toast(asset?'Áudio salvo e tocando':'Áudio tocando');}catch(e){toast(e.message||'Não foi possível tocar o áudio.','error');}});
  $('stopAllAudioBtn')?.addEventListener('click',async()=>{await stopAllAudioLayers();toast('Todas as camadas foram interrompidas');});
  $('openAudioLibraryBtn')?.addEventListener('click',openAudioLibraryModal);
  document.querySelectorAll('.audioLayerEdit').forEach(b=>b.onclick=()=>{const row=b.closest('.audioLayerRow');const layer=state.audioLayers.get(row.dataset.layerId);if(layer?.asset_id)openEditAudioAssetModal(layer.asset_id);});
  document.querySelectorAll('.audioLayerPause').forEach(b=>b.onclick=()=>pauseAudioLayer(b.closest('.audioLayerRow').dataset.layerId));
document.querySelectorAll('.audioLayerResume').forEach(b=>b.onclick=()=>resumeAudioLayer(b.closest('.audioLayerRow').dataset.layerId));
document.querySelectorAll('.audioLayerStop').forEach(b=>b.onclick=()=>stopAudioLayer(b.closest('.audioLayerRow').dataset.layerId));
  document.querySelectorAll('.audioLayerVolume').forEach(b=>b.oninput=()=>setAudioLayerVolume(b.closest('.audioLayerRow').dataset.layerId,b.value,{broadcast:true}));
}
$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});document.addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeModal();});

// Drawing tool: create a room without competing with the advanced VTT tools.
let drawStart=null,drawPointerId=null,drawPreview=null;
function drawPoint(e){const board=$('board');return clientToBoardPercent(e.clientX,e.clientY,board.getBoundingClientRect());}
function updateDrawPreview(p){if(!drawPreview)return;const x=Math.min(drawStart.x,p.x),y=Math.min(drawStart.y,p.y),w=Math.abs(p.x-drawStart.x),h=Math.abs(p.y-drawStart.y);drawPreview.style.left=x+'%';drawPreview.style.top=y+'%';drawPreview.style.width=w+'%';drawPreview.style.height=h+'%';}
$('board').addEventListener('pointerdown',e=>{if(state.tool!=='draw'||!canEdit()||e.button!==0||e.target.closest('.tokenBig')||e.target.closest('.room')||e.target.closest('.rpgVttOverlay'))return;e.preventDefault();drawPointerId=e.pointerId;drawStart=drawPoint(e);drawPreview=document.createElement('div');drawPreview.className='rpgRoomDrawPreview';drawPreview.style.left=drawStart.x+'%';drawPreview.style.top=drawStart.y+'%';$('board').appendChild(drawPreview);$('board').setPointerCapture?.(e.pointerId);},true);
$('board').addEventListener('pointermove',e=>{if(state.tool!=='draw'||drawPointerId!==e.pointerId||!drawStart)return;updateDrawPreview(drawPoint(e));},true);
async function finishDraw(e){if(!drawStart||drawPointerId!==e.pointerId)return;const p=drawPoint(e),s=drawStart,w=Math.abs(p.x-s.x),h=Math.abs(p.y-s.y);drawStart=null;drawPointerId=null;try{$('board').releasePointerCapture?.(e.pointerId)}catch(_){}drawPreview?.remove();drawPreview=null;if(w<2.5||h<2.5){state.tool='move';window.rpgVttSetTool?.('move');$('moveBtn').click();return;}window.__roomGeom={x:Math.min(s.x,p.x),y:Math.min(s.y,p.y),width:Math.max(5,w),height:Math.max(5,h)};openRoomModal();setTimeout(()=>{const g=window.__roomGeom;if(!g)return;$('roomX').value=g.x.toFixed(2);$('roomY').value=g.y.toFixed(2);$('roomW').value=g.width.toFixed(2);$('roomH').value=g.height.toFixed(2);window.__roomGeom=null;window.rpgSnapRoomGeometry?.();},0);}
$('board').addEventListener('pointerup',finishDraw,true);
$('board').addEventListener('pointercancel',e=>{if(drawPointerId===e.pointerId){drawStart=null;drawPointerId=null;drawPreview?.remove();drawPreview=null;}},true);
const originalOpenRoom=openRoomModal;

wireChatControls();

Object.assign(window,{
  state,sb,rpgSupabase:sb,escapeHtml,canEdit,canCreateCampaign,isMaster,isCampaignMaster,currentLocation,
  currentFloor,currentSession,profileFor,toast,setSave,showModal,closeModal,renderAll,renderShell,renderTable,
  renderCharacters,renderWorld,renderSessions,renderNpcs,renderDice,renderMasterDashboard,renderChronicle,renderView,
  applyZoom,subscribeRealtime,broadcastRoomMove,broadcastRoomResize,broadcastEntityMove,broadcastScene,rpgSnapPoint,rpgSnapSize,
  loadCampaigns,loadCampaignData,createCampaign,logCampaignActivity,loadCampaignActivity,renderActivity,reconcileRealtimeState,scheduleRealtimeRecovery
});

boot();