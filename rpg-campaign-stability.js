/* RPG HUB — campaign stability bridge
 * Loaded after app.js and before the feature modules.
 * Keeps the legacy global-function modules connected to the core state,
 * hardens campaign loading, and removes fragile .single() coercions from map editing.
 */
(() => {
  'use strict';

  // The core uses global lexical bindings (const/function declarations), while
  // feature modules intentionally consume a window-based API.
  const expose = {
    state,
    sb,
    rpgSupabase: sb,
    escapeHtml,
    canEdit,
    canCreateCampaign,
    isMaster,
    isCampaignMaster,
    currentLocation,
    currentFloor,
    currentSession,
    profileFor,
    toast,
    setSave,
    showModal,
    closeModal,
    renderAll,
    renderShell,
    renderTable,
    renderCharacters,
    renderWorld,
    renderSessions,
    renderNpcs,
    renderDice,
    renderMasterDashboard,
    renderChronicle,
    renderView,
    applyZoom,
    subscribeRealtime,
    broadcastRoomMove,
    broadcastRoomResize,
    broadcastEntityMove,
    broadcastScene,
    rpgSnapPoint,
    rpgSnapSize
  };
  Object.entries(expose).forEach(([key,value]) => { window[key] = value; });

  async function updateAndReadRow(table,id,payload,context='registro'){
    const result=await sb.from(table).update(payload).eq('id',id).select('*').maybeSingle();
    if(result.error) throw result.error;
    if(result.data) return result.data;

    // Do not let PostgREST throw "Cannot coerce the result to single json"
    // when an update returns no visible row. Verify the row explicitly.
    const verify=await sb.from(table).select('*').eq('id',id).maybeSingle();
    if(verify.error) throw verify.error;
    if(verify.data) return verify.data;
    throw new Error('Não foi possível localizar o '+context+' depois de salvar. Verifique se ele ainda existe e se você tem permissão para editá-lo.');
  }

  async function loadCampaignSupportData(campaignId){
    const warnings=[];
    const warn=(label,error)=>{
      const message=error?.message||String(error||'Falha desconhecida');
      warnings.push(label+': '+message);
      console.warn('[RPG HUB] '+label,message,error);
    };

    try{
      const {data,error}=await sb.from('audio_assets').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:true});
      if(error) throw error;
      state.audioAssets=data||[];
    }catch(error){ state.audioAssets=[]; warn('Áudios',error); }

    try{
      const {data,error}=await sb.from('audio_playlists').select('*').eq('campaign_id',campaignId).order('created_at',{ascending:true});
      if(error) throw error;
      state.audioPlaylists=data||[];
      if(state.audioPlaylists.length){
        const {data:items,error:itemError}=await sb.from('audio_playlist_items').select('*').in('playlist_id',state.audioPlaylists.map(p=>p.id));
        if(itemError) throw itemError;
        state.audioPlaylistItems=items||[];
      }else state.audioPlaylistItems=[];
    }catch(error){
      state.audioPlaylists=[];
      state.audioPlaylistItems=[];
      warn('Playlists de áudio',error);
    }

    state.campaignAudioState=null;
    try{
      const {data,error}=await sb.from('campaign_audio_state').select('*').eq('campaign_id',campaignId).limit(1).maybeSingle();
      if(error) throw error;
      state.campaignAudioState=data||null;
      if(!state.campaignAudioState && canEdit()){
        const insert=await sb.from('campaign_audio_state').insert({campaign_id:campaignId,layers:[],updated_by:state.user.id});
        if(insert.error && !/duplicate|unique/i.test(insert.error.message||'')) throw insert.error;
        state.campaignAudioState={campaign_id:campaignId,layers:[],updated_by:state.user.id};
      }
    }catch(error){
      state.campaignAudioState={campaign_id:campaignId,layers:[],updated_by:state.user.id};
      warn('Estado de áudio',error);
    }

    state.campaignChronicle=null;
    if(canEdit()){
      try{
        const {data,error}=await sb.from('campaign_chronicles').select('*').eq('campaign_id',campaignId).limit(1).maybeSingle();
        if(error) throw error;
        if(data) state.campaignChronicle=data;
        else{
          const insert=await sb.from('campaign_chronicles').insert({campaign_id:campaignId,content:'',updated_by:state.user.id});
          if(insert.error && !/duplicate|unique/i.test(insert.error.message||'')) throw insert.error;
          state.campaignChronicle={campaign_id:campaignId,content:'',updated_by:state.user.id};
        }
      }catch(error){
        state.campaignChronicle={campaign_id:campaignId,content:'',updated_by:state.user.id};
        warn('Crônica da mesa',error);
      }
    }

    return warnings;
  }

  async function loadCampaignDataStable(){
    if(!state.campaign)return;
    const campaignId=state.campaign.id;
    try{localStorage.setItem('rpg-hub-active-campaign',campaignId)}catch(_){}

    // Core campaign state is loaded first. Secondary modules are isolated
    // so a permission/data problem in audio or chronology cannot black out the map.
    const [
      {data:members,error:me},
      {data:locations,error:le},
      {data:characters,error:ce},
      {data:characterFields,error:cfe},
      {data:npcs,error:ne},
      {data:entities,error:ee},
      {data:sessions,error:se},
      {data:rolls,error:re}
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

    const coreErrors=[
      ['membros',me],['locais',le],['personagens',ce],['campos da ficha',cfe],
      ['NPCs',ne],['entidades da mesa',ee],['sessões',se],['rolagens',re]
    ].filter(([,error])=>error);

    if(coreErrors.length){
      const [label,error]=coreErrors[0];
      console.error('[RPG HUB] Falha ao carregar campanha',label,error);
      throw new Error('Falha ao carregar '+label+' da campanha: '+(error?.message||'erro desconhecido'));
    }

    state.members=members||[];
    state.locations=locations||[];
    state.characters=characters||[];
    state.characterFields=characterFields||[];
    state.npcs=npcs||[];
    state.entities=entities||[];
    state.sessions=sessions||[];
    state.rolls=rolls||[];

    const mine=state.members.find(m=>m.user_id===state.user.id);
    state.role=state.campaign.owner_id===state.user.id?'owner':(mine?.role||'player');

    state.profiles=new Map();
    const ids=[...new Set(state.members.map(m=>m.user_id).filter(Boolean))];
    if(ids.length){
      const {data:profiles,error:profilesError}=await sb.from('profiles').select('id,display_name,avatar_url').in('id',ids);
      if(profilesError) console.warn('[RPG HUB] Perfis da campanha indisponíveis:',profilesError);
      (profiles||[]).forEach(p=>state.profiles.set(p.id,p));
    }

    await ensureCharacterFields();

    // Repair newly-created/older campaigns that lost their default world.
    if(!state.locations.length && canEdit()){
      await ensureCampaignWorld(campaignId);
      const {data:fixedLocations,error:fixedLocationsError}=await sb.from('locations').select('*').eq('campaign_id',campaignId).order('sort_order');
      if(fixedLocationsError) throw fixedLocationsError;
      state.locations=fixedLocations||[];
    }

    await loadFloors();
    if(state.locations.length && !state.floors.length && canEdit()){
      await ensureCampaignWorld(campaignId);
      await loadFloors();
    }

    ensureFloor();
    state.selectedSessionId=currentSession()?.id||null;
    const active=currentSession();
    if(active?.active_floor_id && state.floors.some(f=>f.id===active.active_floor_id)) state.floor=active.active_floor_id;
    state.selected=active?.active_room_id && state.rooms.some(r=>r.id===active.active_room_id)
      ? {type:'room',id:active.active_room_id}
      : null;

    const activeFloor=state.floors.find(f=>f.id===state.floor);
    if(activeFloor) state.location=state.locations.find(l=>l.id===activeFloor.location_id)||state.location;

    renderAll();
    await subscribeRealtime();

    const warnings=await loadCampaignSupportData(campaignId);
    renderAll();
    if(warnings.length) setSave('Mesa carregada · alguns recursos auxiliares precisam de atenção',false);
  }

  async function createCampaignStable(name,description){
    if(!canCreateCampaign()) throw new Error('Somente contas Mestre podem criar campanhas.');

    const inviteCode=Math.random().toString(36).slice(2,12).toUpperCase();
    const selectFields='id,owner_id,name,description,system_name,cover_url,discord_url,discord_guild_id,timezone,created_at,updated_at';

    let {data,error}=await sb.from('campaigns')
      .insert({owner_id:state.user.id,name,description,system_name:'Sistema próprio',invite_code:inviteCode})
      .select(selectFields)
      .maybeSingle();

    if(error) throw error;

    // If INSERT succeeded but RETURNING produced no visible object,
    // recover the just-created campaign instead of coercing it to one JSON object.
    if(!data){
      const fallback=await sb.from('campaigns')
        .select(selectFields)
        .eq('owner_id',state.user.id)
        .eq('name',name)
        .order('created_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(fallback.error) throw fallback.error;
      data=fallback.data;
    }

    if(!data) throw new Error('A campanha foi criada, mas não conseguimos recuperar seus dados.');

    const membership=await sb.from('campaign_members').upsert(
      {campaign_id:data.id,campaign_owner_id:state.user.id,user_id:state.user.id,role:'owner'},
      {onConflict:'campaign_id,user_id'}
    );
    if(membership.error) throw membership.error;

    await seedCharacterFieldsForCampaign(data.id);
    state.campaign=data;
    try{localStorage.setItem('rpg-hub-active-campaign',data.id)}catch(_){}

    await loadCampaigns();
    state.campaign=state.campaigns.find(c=>c.id===data.id)||data;
    await ensureCampaignWorld(data.id);
    await loadCampaignDataStable();
    closeModal();
    toast('Campanha criada');
  }

  async function loadFloorsStable(){
    const ids=state.locations.map(l=>l.id);
    if(!ids.length){
      state.floors=[];state.rooms=[];state.floor=null;state.location=null;
      return;
    }

    const {data,error}=await sb.from('floors').select('*').in('location_id',ids).order('sort_order');
    if(error) throw error;
    state.floors=data||[];

    if(state.floors.length){
      const floorIds=state.floors.map(f=>f.id);
      const {data:rooms,error:re}=await sb.from('rooms').select('*').in('floor_id',floorIds).order('sort_order');
      if(re) throw re;
      state.rooms=rooms||[];
    }else state.rooms=[];

    state.location=state.locations[0]||null;
  }

  // Room drag / resize: same UX as the existing editor, but persistence uses
  // maybeSingle + explicit verification instead of .single().
  window.startRoomDrag = function(e,el){
    if(!canEdit()||state.tool!=='move'||e.target.closest('.roomResize')||e.target.closest('.rpgRoomRotateHandle'))return;
    e.preventDefault();e.stopPropagation();

    const r=state.rooms.find(x=>x.id===el.dataset.roomId);if(!r)return;
    const board=$('board');if(!board)return;
    const rect=board.getBoundingClientRect();
    const click=clientToBoardPercent(e.clientX,e.clientY,rect);
    const ox=Number(r.x)||0,oy=Number(r.y)||0;
    const grabOffset={x:click.x-ox,y:click.y-oy};
    const previous={x:ox,y:oy};
    let latestX=ox,latestY=oy,finished=false;

    el.classList.add('dragging');el.setPointerCapture?.(e.pointerId);
    const cleanup=()=>{
      if(finished)return;
      finished=true;
      try{el.releasePointerCapture?.(e.pointerId)}catch(_){}
      el.classList.remove('dragging');
      el.removeEventListener('pointermove',move);
      el.removeEventListener('pointerup',up);
      el.removeEventListener('pointercancel',cancel);
    };
    const move=ev=>{
      const p=clientToBoardPercent(ev.clientX,ev.clientY,rect);
      const raw={x:p.x-grabOffset.x,y:p.y-grabOffset.y};
      const snapped=window.rpgSnapPoint?window.rpgSnapPoint(raw.x,raw.y):raw;
      const constrained=constrainRoomPosition({...r,x:latestX,y:latestY},snapped.x,snapped.y);
      latestX=constrained.x;latestY=constrained.y;
      state.rooms=state.rooms.map(item=>item.id===r.id?{...item,x:latestX,y:latestY}:item);
      el.style.left=latestX+'%';el.style.top=latestY+'%';
    };
    const up=async()=>{
      cleanup();
      try{
        const data=await updateAndReadRow('rooms',r.id,{x:latestX,y:latestY},'cômodo');
        state.rooms=state.rooms.map(item=>item.id===r.id?data:item);
        await broadcastRoomMove({room_id:r.id,x:latestX,y:latestY});
        setSave('Cômodo reposicionado');
      }catch(error){
        state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);
        renderTable();
        toast(error.message||'Não foi possível salvar a posição.','error');
      }
    };
    const cancel=()=>{cleanup();state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);renderTable();};
    el.addEventListener('pointermove',move);
    el.addEventListener('pointerup',up,{once:true});
    el.addEventListener('pointercancel',cancel,{once:true});
  };

  window.startRoomResize = function(e,el){
    if(!canEdit()||state.tool!=='move')return;
    e.preventDefault();e.stopPropagation();

    const r=state.rooms.find(x=>x.id===el.dataset.roomId);if(!r)return;
    const board=$('board');if(!board)return;
    const rect=board.getBoundingClientRect();
    const sx=e.clientX,sy=e.clientY,ow=Number(r.width)||5,oh=Number(r.height)||5;
    const previous={x:Number(r.x)||0,y:Number(r.y)||0,width:ow,height:oh};
    let latestW=ow,latestH=oh,latestX=previous.x,latestY=previous.y,finished=false;

    el.setPointerCapture?.(e.pointerId);el.classList.add('resizing');
    const cleanup=()=>{
      if(finished)return;
      finished=true;
      try{el.releasePointerCapture?.(e.pointerId)}catch(_){}
      el.classList.remove('resizing');
      el.removeEventListener('pointermove',move);
      el.removeEventListener('pointerup',up);
      el.removeEventListener('pointercancel',cancel);
    };
    const move=ev=>{
      const rawW=Math.max(5,Math.min(90,ow+(ev.clientX-sx)/Math.max(1,rect.width)*100));
      const rawH=Math.max(5,Math.min(90,oh+(ev.clientY-sy)/Math.max(1,rect.height)*100));
      const snapped=window.rpgSnapSize?window.rpgSnapSize(rawW,rawH):{width:rawW,height:rawH};
      latestW=Math.max(5,Math.min(90,snapped.width));latestH=Math.max(5,Math.min(90,snapped.height));
      const constrained=constrainRoomPosition({...r,width:latestW,height:latestH},latestX,latestY);
      latestX=constrained.x;latestY=constrained.y;
      state.rooms=state.rooms.map(item=>item.id===r.id?{...item,width:latestW,height:latestH,x:latestX,y:latestY}:item);
      el.style.width=latestW+'%';el.style.height=latestH+'%';el.style.left=latestX+'%';el.style.top=latestY+'%';
    };
    const up=async()=>{
      cleanup();
      try{
        const data=await updateAndReadRow('rooms',r.id,{width:latestW,height:latestH,x:latestX,y:latestY},'cômodo');
        state.rooms=state.rooms.map(item=>item.id===r.id?data:item);
        await broadcastRoomResize({room_id:r.id,width:latestW,height:latestH,x:latestX,y:latestY});
        setSave('Área do cômodo salva');
      }catch(error){
        state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);
        renderTable();
        toast(error.message||'Não foi possível salvar o tamanho.','error');
      }
    };
    const cancel=()=>{cleanup();state.rooms=state.rooms.map(item=>item.id===r.id?{...item,...previous}:item);renderTable();};
    el.addEventListener('pointermove',move);
    el.addEventListener('pointerup',up,{once:true});
    el.addEventListener('pointercancel',cancel,{once:true});
  };

  // Persist active campaign selection between page loads.
  const originalLoadCampaigns=window.loadCampaigns||loadCampaigns;
  window.loadCampaigns=async function(){
    const result=await originalLoadCampaigns.apply(this,arguments);
    let remembered=null;
    try{remembered=localStorage.getItem('rpg-hub-active-campaign')}catch(_){}
    if(!state.campaign&&state.campaigns.length){
      state.campaign=state.campaigns.find(c=>c.id===remembered)||state.campaigns[0];
    }
    if(state.campaign && document.getElementById('campaignSelect'))document.getElementById('campaignSelect').value=state.campaign.id;
    return result;
  };

  // Replace the global bindings used by boot and UI handlers.
  window.loadCampaignData=loadCampaignDataStable;
  window.createCampaign=createCampaignStable;
  window.loadFloors=loadFloorsStable;
  window.updateAndReadRow=updateAndReadRow;

  // Expose the stable methods again after feature modules load.
  window.rpgCampaignStability={
    reload:loadCampaignDataStable,
    createCampaign:createCampaignStable,
    updateAndReadRow,
    version:'20260929.1'
  };
})();