/* RPG HUB — advanced VTT map layer */
(() => {
  'use strict';

  const vtt = {
    initialized:false,
    campaignId:null,
    floorId:null,
    settings:null,
    fog:[],
    aoe:[],
    activeTool:'move',
    aoeShape:'circle',
    measureEl:null,
    drag:null,
    conditionCache:{key:null,rows:[],promise:null},
    channel:null
  };

  const $ = id => document.getElementById(id);
  const esc = v => typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const cid = () => state?.campaign?.id || null;
  const fid = () => state?.floor || null;
  const master = () => typeof canEdit === 'function' && canEdit();

  function num(v, fallback=0) {
    const n=Number(v);
    return Number.isFinite(n)?n:fallback;
  }

  function point(ev) {
    const board=$('board');
    const r=board.getBoundingClientRect();
    return {
      x:Math.max(0,Math.min(100,((ev.clientX-r.left)/r.width)*100)),
      y:Math.max(0,Math.min(100,((ev.clientY-r.top)/r.height)*100))
    };
  }

  function settingsDefault() {
    return {
      campaign_id:cid(),
      floor_id:fid(),
      grid_enabled:true,
      snap_enabled:true,
      grid_size:5,
      unit_per_cell:5,
      fog_enabled:false
    };
  }

  function snapPoint(x,y) {
    const s=vtt.settings;
    if (!s?.snap_enabled) return {x,y};
    const step=num(s.grid_size,5);
    return {
      x:Math.max(0,Math.min(100,Math.round(x/step)*step)),
      y:Math.max(0,Math.min(100,Math.round(y/step)*step))
    };
  }

  function snapSize(w,h) {
    const s=vtt.settings;
    if (!s?.snap_enabled) return {width:w,height:h};
    const step=num(s.grid_size,5);
    return {
      width:Math.max(step,Math.round(w/step)*step),
      height:Math.max(step,Math.round(h/step)*step)
    };
  }

  window.rpgSnapPoint = snapPoint;
  window.rpgSnapSize = snapSize;

  function styles() {
    if($('rpgAdvancedVttStyles')) return;
    const s=document.createElement('style');
    s.id='rpgAdvancedVttStyles';
    s.textContent=".rpgVttToolRow{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.rpgVttTool{border:1px solid #29313d;background:#10161e;color:#929cab;border-radius:8px;padding:7px 8px;font-size:8px;cursor:pointer}.rpgVttTool.active{border-color:var(--accent,#9487ff);color:#e2deff;background:rgba(148,135,255,.1)}.rpgVttTool.masterOnly{display:inline-flex}.rpgVttPanel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 9px;margin:0 0 7px;border:1px solid #252d39;border-radius:10px;background:#0c1118;color:#707b8b;font-size:8px}.rpgVttPanel label{display:inline-flex;align-items:center;gap:5px}.rpgVttPanel input,.rpgVttPanel select{height:27px;min-width:60px;padding:0 6px;border:1px solid #2a313c;border-radius:7px;background:#0a0e14;color:#d8dce4;font-size:8px}.rpgVttPanel button{border:1px solid #2a313c;background:#111720;color:#aab2bf;border-radius:7px;padding:6px 8px;font-size:8px;cursor:pointer}.rpgVttPanel .danger{color:#ff9eaa;border-color:#4b2731}.rpgVttOverlay{position:absolute;inset:0;pointer-events:none;z-index:60;overflow:hidden}.rpgFogRegion{position:absolute;background:rgba(3,5,8,.88);border:1px solid rgba(148,135,255,.15);box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}.rpgFogRegion.master{background:repeating-linear-gradient(135deg,rgba(28,23,48,.56) 0 7px,rgba(9,9,13,.72) 7px 14px);border:1px dashed rgba(148,135,255,.42)}.rpgFogRegion.revealed{display:none}.rpgAoe{position:absolute;z-index:55;transform-origin:50% 50%;border:2px solid rgba(148,135,255,.72);background:rgba(148,135,255,.18);box-shadow:0 0 25px rgba(148,135,255,.15);pointer-events:auto;cursor:pointer}.rpgAoe.circle{border-radius:50%}.rpgAoe.square{border-radius:8px}.rpgAoe.cone{clip-path:polygon(0 30%,100% 0,100% 100%,0 70%);border-radius:0}.rpgAoe.line{height:4px!important;border-radius:99px;transform-origin:0 50%;margin-top:-2px}.rpgAoeLabel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:4px 6px;border-radius:99px;background:rgba(7,9,13,.72);color:#dcd8ff;font-size:7px;white-space:nowrap}.rpgMeasureLine{position:absolute;height:2px;background:linear-gradient(90deg,#e2ddff,#9487ff);transform-origin:0 50%;box-shadow:0 0 9px rgba(148,135,255,.55);z-index:70}.rpgMeasureDot{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#eeeaff;border:1px solid #9487ff;z-index:71}.rpgMeasureLabel{position:absolute;z-index:72;transform:translate(-50%,-50%);padding:5px 7px;border:1px solid #3c3565;border-radius:8px;background:#11121a;color:#e6e1ff;font-size:8px;white-space:nowrap;box-shadow:0 9px 28px rgba(0,0,0,.35)}.rpgConditionBadge{position:absolute;right:-5px;top:-7px;min-width:18px;height:18px;padding:0 4px;border:1px solid #372f56;border-radius:99px;background:#17142a;color:#d6d0ff;display:grid;place-items:center;font-size:8px;z-index:44;box-shadow:0 4px 14px rgba(0,0,0,.35)}.rpgConditionRing{position:absolute;inset:-5px;border:2px solid currentColor;border-radius:50%;opacity:.85;pointer-events:none}.rpgCombatTurnRing{position:absolute;inset:-9px;border:2px solid #f0ebff;border-radius:50%;box-shadow:0 0 18px rgba(148,135,255,.75);pointer-events:none}.rpgVttHint{padding:7px 9px;color:#5f6979;font-size:8px;border-top:1px solid #202630;margin-top:7px;line-height:1.45}.rpgVttNotice{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:90;padding:7px 9px;border:1px solid #343b47;border-radius:9px;background:rgba(8,11,15,.92);color:#aab2c0;font-size:8px;box-shadow:0 12px 35px rgba(0,0,0,.35);pointer-events:none}.rpgMapSettingsModal{display:grid;gap:12px}.rpgMapSettingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.rpgMapSettingsItem{padding:10px;border:1px solid #29313d;border-radius:10px;background:#0d131a}.rpgMapSettingsItem label{display:grid;gap:6px;color:#707b8b;font-size:8px}.rpgMapSettingsItem input{width:100%;box-sizing:border-box}.rpgVttReadOnly{color:#6e7888;font-size:8px;line-height:1.5;padding:9px;border:1px solid #29313d;border-radius:9px;background:#0d131a}@media(max-width:700px){.rpgVttPanel{font-size:7px}.rpgMapSettingsGrid{grid-template-columns:1fr}.rpgVttTool{flex:1 1 calc(50% - 6px)}}";
    document.head.appendChild(s);
  }

  function overlay() {
    const board=$('board');
    if(!board) return null;
    let o=$('rpgVttOverlay');
    if(!o){
      o=document.createElement('div');
      o.id='rpgVttOverlay';
      o.className='rpgVttOverlay';
      board.appendChild(o);
    }
    return o;
  }

  function renderFog() {
    const o=overlay();
    if(!o)return;
    o.querySelectorAll('.rpgFogRegion').forEach(x=>x.remove());
    if(!vtt.settings?.fog_enabled)return;
    vtt.fog.forEach(r=>{
      const el=document.createElement('div');
      el.className='rpgFogRegion'+(master()?' master':'')+(r.revealed?' revealed':'');
      el.dataset.fogId=r.id;
      el.style.left=num(r.x)+'%';el.style.top=num(r.y)+'%';el.style.width=num(r.width)+'%';el.style.height=num(r.height)+'%';
      el.title=master()?'Clique para remover esta névoa':'';
      if(master())el.addEventListener('click',async e=>{e.stopPropagation();await removeFog(r.id);});
      o.appendChild(el);
    });
  }

  function aoeCss(r) {
    const s=Math.max(.5,num(r.size,10));
    if(r.shape==='line')return 'left:'+num(r.x)+'%;top:'+num(r.y)+'%;width:'+num(r.length,20)+'%;height:4px;transform:rotate('+num(r.rotation,0)+'deg)';
    if(r.shape==='cone')return 'left:'+(num(r.x)-s/2)+'%;top:'+(num(r.y)-s/2)+'%;width:'+s+'%;height:'+s+'%;transform:rotate('+num(r.rotation,0)+'deg)';
    return 'left:'+(num(r.x)-s/2)+'%;top:'+(num(r.y)-s/2)+'%;width:'+s+'%;height:'+s+'%;transform:rotate('+num(r.rotation,0)+'deg)';
  }

  function renderAoe() {
    const o=overlay();if(!o)return;
    o.querySelectorAll('.rpgAoe').forEach(x=>x.remove());
    vtt.aoe.forEach(r=>{
      const el=document.createElement('div');
      el.className='rpgAoe '+esc(r.shape||'circle');
      el.dataset.aoeId=r.id;
      el.style.cssText=aoeCss(r)+';border-color:'+esc(r.color||'#9487ff')+';background:'+esc(r.color||'#9487ff')+';opacity:'+num(r.opacity,.22);
      if(r.shape==='line')el.classList.add('line');
      if(r.label)el.innerHTML='<span class="rpgAoeLabel">'+esc(r.label)+'</span>';
      if(master()){
        el.title='Clique para remover área';
        el.addEventListener('click',async e=>{e.stopPropagation();await removeAoe(r.id);});
      }
      o.appendChild(el);
    });
  }

  function renderAllOverlays() {
    renderFog();renderAoe();decorateTokens();updateToolbarState();
  }

  function decorateTokens() {
    const floor=fid(), key=cid()+':'+floor;
    if(vtt.conditionCache.key!==key && !vtt.conditionCache.promise) loadConditions();
    document.querySelectorAll('#tokenLayer .tokenBig').forEach(el=>{
      el.querySelectorAll('.rpgConditionBadge,.rpgConditionRing,.rpgCombatTurnRing').forEach(x=>x.remove());
      const entityId=el.dataset.entityId;
      const match=vtt.conditionCache.rows.find(x=>x.entity_id===entityId);
      if(!match) return;
      const conditions=String(match.conditions||'').split(',').map(x=>x.trim()).filter(Boolean);
      if(conditions.length){
        const badge=document.createElement('span');
        badge.className='rpgConditionBadge';
        badge.textContent=conditions.length>9?'9+':String(conditions.length);
        badge.title=conditions.join(', ');
        el.appendChild(badge);
        const colors={'Atordoado':'#fbbf24','Caído':'#fb7185','Envenenado':'#6ee7b7','Amedrontado':'#c4b5fd','Cego':'#94a3b8','Contido':'#60a5fa','Invisível':'#67e8f9'};
        const first=conditions[0];
        const color=colors[first]||'#9487ff';
        const ring=document.createElement('span');
        ring.className='rpgConditionRing';
        ring.style.color=color;
        el.appendChild(ring);
      }
      if(match.active){
        const ring=document.createElement('span');
        ring.className='rpgCombatTurnRing';
        el.appendChild(ring);
      }
    });
  }

  async function loadConditions() {
    const c=cid(),floor=fid();
    if(!c||!floor)return;
    const key=c+':'+floor;
    vtt.conditionCache.promise=(async()=>{
      try{
        const sess=typeof currentSession==='function'?currentSession():null;
        if(!sess){vtt.conditionCache={key,rows:[],promise:null};decorateTokens();return;}
        const ce=await sb.from('combat_encounters').select('id,current_index,round,status').eq('campaign_id',c).eq('session_id',sess.id).order('created_at',{ascending:false}).limit(1);
        if(ce.error)throw ce.error;
        const encounter=ce.data?.[0];
        if(!encounter){vtt.conditionCache={key,rows:[],promise:null};decorateTokens();return;}
        const cb=await sb.from('combatants').select('id,character_id,npc_id,conditions,turn_order').eq('encounter_id',encounter.id).order('turn_order');
        if(cb.error)throw cb.error;
        const ordered=cb.data||[];
        const activeId=ordered[Math.max(0,Math.min(num(encounter.current_index,0),Math.max(ordered.length-1,0)))]?.id;
        const rows=[];
        (state.entities||[]).filter(e=>e.floor_id===floor).forEach(entity=>{
          const combat=ordered.find(x=>(x.character_id&&x.character_id===entity.character_id)||(x.npc_id&&x.npc_id===entity.npc_id));
          if(combat)rows.push({entity_id:entity.id,conditions:combat.conditions,active:combat.id===activeId});
        });
        vtt.conditionCache={key,rows,promise:null};
        decorateTokens();
      }catch(err){console.warn('RPG HUB token conditions:',err);vtt.conditionCache={key,rows:[],promise:null};}
    })();
    await vtt.conditionCache.promise;
  }

  async function loadFloorData() {
    const c=cid(),floor=fid();
    if(!c||!floor)return;
    const [settingsRes,fogRes,aoeRes]=await Promise.all([
      sb.from('map_settings').select('*').eq('campaign_id',c).eq('floor_id',floor).maybeSingle(),
      sb.from('fog_regions').select('*').eq('campaign_id',c).eq('floor_id',floor).order('created_at'),
      sb.from('aoe_effects').select('*').eq('campaign_id',c).eq('floor_id',floor).order('created_at')
    ]);
    if(settingsRes.error)console.warn('map_settings:',settingsRes.error);
    if(fogRes.error)console.warn('fog_regions:',fogRes.error);
    if(aoeRes.error)console.warn('aoe_effects:',aoeRes.error);
    vtt.settings=settingsRes.data||settingsDefault();
    vtt.fog=fogRes.data||[];
    vtt.aoe=aoeRes.data||[];
    vtt.campaignId=c;vtt.floorId=floor;
    vtt.conditionCache={key:null,rows:[],promise:null};
    renderAllOverlays();
    updateToolbarState();
  }

  async function saveSettings(partial) {
    if(!master()||!cid()||!fid())return;
    vtt.settings={...settingsDefault(),...(vtt.settings||{}),...partial,campaign_id:cid(),floor_id:fid(),updated_by:state.user.id};
    const {data,error}=await sb.from('map_settings').upsert(vtt.settings,{onConflict:'campaign_id,floor_id'}).select().single();
    if(error){toast(error.message||'Não foi possível salvar as configurações do mapa.','error');return;}
    vtt.settings=data;
    renderAllOverlays();
    setSave('Configuração do mapa salva');
  }

  function toolbar() {
    const host=document.querySelector('.boardToolbar .toolbarActions');
    if(!host)return;
    if(!$('rpgVttTools')){
      const wrap=document.createElement('div');
      wrap.id='rpgVttTools';
      wrap.className='rpgVttToolRow';
      wrap.innerHTML='<button type="button" class="rpgVttTool" data-vtt-tool="measure">⌁ Medir</button><button type="button" class="rpgVttTool" data-vtt-tool="aoe">◉ Área</button>'+ (master()?'<button type="button" class="rpgVttTool masterOnly" data-vtt-tool="fog">◒ Névoa</button><button type="button" class="rpgVttTool masterOnly" data-vtt-settings>⚙ Grade</button>':'');
      host.appendChild(wrap);
      wrap.querySelectorAll('[data-vtt-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.vttTool)));
      wrap.querySelector('[data-vtt-settings]')?.addEventListener('click',openMapSettings);
    }
    updateToolbarState();
  }

  function updateToolbarState() {
    const tools=$('rpgVttTools');
    if(!tools)return;
    tools.querySelectorAll('[data-vtt-tool]').forEach(b=>b.classList.toggle('active',b.dataset.vttTool===vtt.activeTool));
    const board=$('board');
    if(board)board.style.cursor=vtt.activeTool==='measure'||vtt.activeTool==='aoe'||vtt.activeTool==='fog'?'crosshair':'default';
  }

  function setTool(tool) {
    if(tool==='fog'&&!master())return;
    vtt.activeTool=vtt.activeTool===tool?'move':tool;
    if(vtt.activeTool!=='measure')removeMeasure();
    updateToolbarState();
    showHint(vtt.activeTool==='measure'?'Arraste no mapa para medir distância.':vtt.activeTool==='aoe'?'Arraste do centro até a borda para criar uma área.':vtt.activeTool==='fog'?'Arraste para cobrir uma região do mapa.':'Ferramentas da mesa ativas.');
  }

  function showHint(text) {
    const board=$('board');if(!board)return;
    let n=board.querySelector('.rpgVttNotice');
    if(!n){n=document.createElement('div');n.className='rpgVttNotice';board.appendChild(n);}
    n.textContent=text;clearTimeout(n._timer);n._timer=setTimeout(()=>n.remove(),2200);
  }

  function removeMeasure() {
    vtt.measureEl?.remove();vtt.measureEl=null;
  }

  function measureMove(ev) {
    if(!vtt.drag||vtt.activeTool!=='measure')return;
    const p=point(ev),d=vtt.drag.start;
    const dx=p.x-d.x,dy=p.y-d.y;
    const cells=Math.sqrt((dx/num(vtt.settings?.grid_size,5))**2+(dy/num(vtt.settings?.grid_size,5))**2);
    const units=cells*num(vtt.settings?.unit_per_cell,5);
    const board=$('board');const rect=board.getBoundingClientRect();
    const px=Math.sqrt((((p.x-d.x)/100)*rect.width)**2+(((p.y-d.y)/100)*rect.height)**2);
    const angle=Math.atan2(dy,dx)*180/Math.PI;
    let el=vtt.measureEl;
    if(!el){
      const o=overlay();el=document.createElement('div');el.className='rpgMeasureLine';o.appendChild(el);
      const a=document.createElement('div');a.className='rpgMeasureDot';o.appendChild(a);
      const b=document.createElement('div');b.className='rpgMeasureDot';o.appendChild(b);
      const label=document.createElement('div');label.className='rpgMeasureLabel';o.appendChild(label);
      vtt.measureEl={line:el,a,b,label};
    }
    el=vtt.measureEl;
    el.line.style.left=d.x+'%';el.line.style.top=d.y+'%';el.line.style.width=px+'px';el.line.style.transform='rotate('+angle+'deg)';
    el.a.style.left=d.x+'%';el.a.style.top=d.y+'%';el.b.style.left=p.x+'%';el.b.style.top=p.y+'%';
    el.label.style.left=((d.x+p.x)/2)+'%';el.label.style.top=((d.y+p.y)/2)+'%';
    el.label.textContent=units.toFixed(units%1?1:0)+' '+(num(vtt.settings?.unit_per_cell,5)===1?'unidade':'unidades');
  }

  async function measureUp() {
    if(!vtt.drag||vtt.activeTool!=='measure')return;
    vtt.drag=null;
  }

  function dragPreview(ev) {
    if(!vtt.drag)return;
    const p=point(ev),s=vtt.drag.start;
    if(vtt.activeTool==='fog'){
      const x=Math.min(s.x,p.x),y=Math.min(s.y,p.y),w=Math.abs(p.x-s.x),h=Math.abs(p.y-s.y);
      vtt.drag.preview.style.left=x+'%';vtt.drag.preview.style.top=y+'%';vtt.drag.preview.style.width=w+'%';vtt.drag.preview.style.height=h+'%';
    } else if(vtt.activeTool==='aoe'){
      const x=Math.min(s.x,p.x),y=Math.min(s.y,p.y),w=Math.max(.5,Math.abs(p.x-s.x)),h=Math.max(.5,Math.abs(p.y-s.y));
      const size=Math.max(w,h);
      vtt.drag.preview.style.left=(s.x-size/2)+'%';vtt.drag.preview.style.top=(s.y-size/2)+'%';vtt.drag.preview.style.width=size+'%';vtt.drag.preview.style.height=size+'%';
    }
  }

  async function pointerDown(ev) {
    if(vtt.activeTool==='move')return;
    if(ev.button!==0)return;
    ev.preventDefault();ev.stopImmediatePropagation();
    const p=point(ev);
    if(vtt.activeTool==='measure'){
      removeMeasure();vtt.drag={start:p};measureMove(ev);
      return;
    }
    if(vtt.activeTool==='fog'||vtt.activeTool==='aoe'){
      const o=overlay();
      const preview=document.createElement('div');
      preview.className=vtt.activeTool==='fog'?'rpgFogRegion master':'rpgAoe '+vtt.aoeShape;
      preview.style.opacity=vtt.activeTool==='fog'?'.92':'.22';
      o.appendChild(preview);
      vtt.drag={start:p,preview};
      dragPreview(ev);
    }
  }

  async function pointerMove(ev) {
    if(vtt.activeTool==='measure'&&vtt.drag)measureMove(ev);
    else if(vtt.drag&&(vtt.activeTool==='fog'||vtt.activeTool==='aoe'))dragPreview(ev);
  }

  async function pointerUp(ev) {
    if(!vtt.drag)return;
    const d=vtt.drag,p=point(ev);
    if(vtt.activeTool==='measure'){await measureUp();return;}
    d.preview.remove();
    vtt.drag=null;
    if(vtt.activeTool==='fog'){
      const x=Math.min(d.start.x,p.x),y=Math.min(d.start.y,p.y),w=Math.abs(p.x-d.start.x),h=Math.abs(p.y-d.start.y);
      if(w<1||h<1)return;
      const q=await sb.from('fog_regions').insert({campaign_id:cid(),floor_id:fid(),x,y,width:w,height:h,revealed:false,created_by:state.user.id}).select().single();
      if(q.error)toast(q.error.message||'Não foi possível criar a névoa.','error');else{vtt.fog.push(q.data);renderFog();broadcast('fog_updated',{floor_id:fid()});}
    } else if(vtt.activeTool==='aoe'){
      const dx=p.x-d.start.x,dy=p.y-d.start.y;
      const size=Math.max(2,Math.hypot(dx,dy)*2);
      if(size<2)return;
      const q=await sb.from('aoe_effects').insert({campaign_id:cid(),floor_id:fid(),session_id:typeof currentSession==='function'?currentSession()?.id||null:null,shape:vtt.aoeShape,x:d.start.x,y:d.start.y,size:lengthClamp(size),length:lengthClamp(size),rotation:Math.atan2(dy,dx)*180/Math.PI,color:'#9487ff',opacity:.22,label:''}).select().single();
      if(q.error)toast(q.error.message||'Não foi possível criar a área de efeito.','error');else{vtt.aoe.push(q.data);renderAoe();broadcast('aoe_updated',{floor_id:fid()});}
    }
  }

  function lengthClamp(n){return Math.max(1,Math.min(100,Number(n)||1));}

  async function removeFog(id) {
    if(!master())return;
    const q=await sb.from('fog_regions').delete().eq('id',id);
    if(q.error)return toast(q.error.message||'Não foi possível remover a névoa.','error');
    vtt.fog=vtt.fog.filter(x=>x.id!==id);renderFog();broadcast('fog_updated',{floor_id:fid()});
  }

  async function removeAoe(id) {
    if(!master())return;
    const q=await sb.from('aoe_effects').delete().eq('id',id);
    if(q.error)return toast(q.error.message||'Não foi possível remover a área.','error');
    vtt.aoe=vtt.aoe.filter(x=>x.id!==id);renderAoe();broadcast('aoe_updated',{floor_id:fid()});
  }

  async function broadcast(event,payload) {
    try{
      if(state.campaignChannel)await state.campaignChannel.send({type:'broadcast',event,payload:{...payload,user_id:state.user.id}});
    }catch(err){console.warn('RPG HUB VTT broadcast:',err);}
  }

  function realtime() {
    const c=cid();if(!c||vtt.channel&&vtt.campaignId===c)return;
    if(vtt.channel)sb.removeChannel(vtt.channel).catch(()=>{});
    const ch=sb.channel('rpg-hub-vtt-'+c,{config:{private:true}});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'map_settings',filter:'campaign_id=eq.'+c},p=>{
      const r=p.new||p.old;if(!r||r.floor_id!==fid())return;
      if(p.eventType==='DELETE'){vtt.settings=settingsDefault();}else vtt.settings=r;
      renderAllOverlays();
    });
    ch.on('postgres_changes',{event:'*',schema:'public',table:'fog_regions',filter:'campaign_id=eq.'+c},p=>{
      const r=p.new||p.old;if(!r||r.floor_id!==fid())return;
      if(p.eventType==='INSERT'&&!vtt.fog.some(x=>x.id===r.id))vtt.fog.push(r);
      else if(p.eventType==='UPDATE')vtt.fog=vtt.fog.map(x=>x.id===r.id?r:x);
      else if(p.eventType==='DELETE')vtt.fog=vtt.fog.filter(x=>x.id!==r.id);
      renderFog();
    });
    ch.on('postgres_changes',{event:'*',schema:'public',table:'aoe_effects',filter:'campaign_id=eq.'+c},p=>{
      const r=p.new||p.old;if(!r||r.floor_id!==fid())return;
      if(p.eventType==='INSERT'&&!vtt.aoe.some(x=>x.id===r.id))vtt.aoe.push(r);
      else if(p.eventType==='UPDATE')vtt.aoe=vtt.aoe.map(x=>x.id===r.id?r:x);
      else if(p.eventType==='DELETE')vtt.aoe=vtt.aoe.filter(x=>x.id!==r.id);
      renderAoe();
    });
    ch.subscribe((status,error)=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('RPG HUB VTT realtime:',status,error);});
    vtt.channel=ch;vtt.campaignId=c;
  }

  function openMapSettings() {
    if(!master())return;
    const s={...settingsDefault(),...(vtt.settings||{})};
    showModal('<div class="modalHeader"><div><div class="eyebrow">MESA · GRADE</div><h3>Configuração do mapa</h3><p class="modalHint">A grade usa percentuais do mapa e pode servir de base para o snap.</p></div><button class="closeButton" data-close>×</button></div><div class="rpgMapSettingsModal"><div class="rpgMapSettingsGrid"><div class="rpgMapSettingsItem"><label><input id="vttGrid" type="checkbox" '+(s.grid_enabled?'checked':'')+'> Exibir grade</label></div><div class="rpgMapSettingsItem"><label><input id="vttSnap" type="checkbox" '+(s.snap_enabled?'checked':'')+'> Ativar snap</label></div><div class="rpgMapSettingsItem"><label>Espaçamento da grade (%)<input id="vttGridSize" type="number" min="1" max="25" step=".5" value="'+num(s.grid_size,5)+'"></label></div><div class="rpgMapSettingsItem"><label>Unidades por célula<input id="vttUnit" type="number" min=".1" max="1000" step=".1" value="'+num(s.unit_per_cell,5)+'"></label></div><div class="rpgMapSettingsItem"><label><input id="vttFog" type="checkbox" '+(s.fog_enabled?'checked':'')+'> Ativar Fog of War</label></div></div><div class="rpgVttHint">Medições usam a unidade por célula. O mestre vê as regiões de névoa enquanto os jogadores enxergam somente o mapa liberado.</div></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="vttSaveSettings" class="primarySmall">Salvar configuração</button></div>');
    $('vttSaveSettings').onclick=async()=>{
      const gridSize=Math.max(1,Math.min(25,Number($('vttGridSize').value)||5));
      const unit=Math.max(.1,Math.min(1000,Number($('vttUnit').value)||5));
      await saveSettings({grid_enabled:$('vttGrid').checked,snap_enabled:$('vttSnap').checked,grid_size:gridSize,unit_per_cell:unit,fog_enabled:$('vttFog').checked});
      closeModal();
    };
  }

  function addPanel() {
    const boardPanel=document.querySelector('.boardPanel');
    const toolbar=document.querySelector('.boardToolbar');
    if(!boardPanel||!toolbar)return;
    toolbar();
    if(!$('rpgVttPanel')){
      const p=document.createElement('div');p.id='rpgVttPanel';p.className='rpgVttPanel';
      p.innerHTML='<label>Área<select id="rpgAoeShape"><option value="circle">Círculo</option><option value="square">Quadrado</option><option value="cone">Cone</option><option value="line">Linha</option></select></label><span>Grade: <b id="rpgGridStatus">—</b></span><span>Snap: <b id="rpgSnapStatus">—</b></span>';
      boardPanel.insertBefore(p,toolbar.nextSibling);
      $('rpgAoeShape').onchange=()=>{vtt.aoeShape=$('rpgAoeShape').value;};
    }
    updatePanel();
  }

  function updatePanel() {
    const g=$('rpgGridStatus'),s=$('rpgSnapStatus');
    if(g)g.textContent=vtt.settings?.grid_enabled?'ON':'OFF';
    if(s)s.textContent=vtt.settings?.snap_enabled?'ON':'OFF';
  }

  function hookRenderTable() {
    if(typeof window.renderTable!=='function'||window.renderTable.__rpgAdvanced)return;
    const base=window.renderTable;
    const wrapped=function(){const r=base.apply(this,arguments);addPanel();toolbar();renderAllOverlays();loadFloorDataWhenChanged();return r;};
    wrapped.__rpgAdvanced=true;wrapped.__base=base;window.renderTable=wrapped;
  }

  async function loadFloorDataWhenChanged() {
    const c=cid(),f=fid();
    if(!c||!f)return;
    if(vtt.campaignId!==c||vtt.floorId!==f||!vtt.settings)await loadFloorData();
  }

  function hookRenderAll() {
    if(typeof window.renderAll!=='function'||window.renderAll.__rpgAdvanced)return;
    const base=window.renderAll;
    const wrapped=function(){const r=base.apply(this,arguments);setTimeout(()=>{addPanel();toolbar();loadFloorDataWhenChanged();renderAllOverlays();},0);return r;};
    wrapped.__rpgAdvanced=true;wrapped.__base=base;window.renderAll=wrapped;
  }

  function bindBoard() {
    const b=$('board');if(!b||b.dataset.rpgVttBound)return;
    b.dataset.rpgVttBound='1';
    b.addEventListener('pointerdown',pointerDown,true);
    b.addEventListener('pointermove',pointerMove,true);
    b.addEventListener('pointerup',pointerUp,true);
    b.addEventListener('pointercancel',()=>{if(vtt.drag?.preview)vtt.drag.preview.remove();vtt.drag=null;removeMeasure();},true);
  }

  function init() {
    if(typeof state==='undefined'||typeof sb==='undefined'){setTimeout(init,250);return;}
    if(vtt.initialized)return;
    vtt.initialized=true;
    styles();
    hookRenderAll();
    hookRenderTable();
    addPanel();
    toolbar();
    bindBoard();
    loadFloorDataWhenChanged();
    realtime();
    window.addEventListener('resize',()=>{renderAllOverlays();});
    setInterval(()=>{
      if(!vtt.initialized)return;
      hookRenderAll();hookRenderTable();bindBoard();addPanel();toolbar();
      if(cid()!==vtt.campaignId)realtime();
      loadFloorDataWhenChanged();
      if(state.view==='table')decorateTokens();
      updatePanel();
    },1500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();