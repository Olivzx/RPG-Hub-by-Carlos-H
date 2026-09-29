/* RPG HUB — VTT map engine
 * Rebuilt around one coordinate system:
 * - no CSS transform zoom on the map
 * - square physical grid
 * - pointer coordinates remain stable while zooming/scrolling
 * - reliable measurement / AoE previews
 * - room rotation handle + quick controls
 */
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
    drag:null,
    measure:null,
    channel:null,
    conditionCache:{key:null,rows:[],promise:null}
  };

  const $ = id => document.getElementById(id);
  const sbc = () => window.rpgSupabase;
  const cid = () => window.state?.campaign?.id || null;
  const fid = () => window.state?.floor || null;
  const master = () => typeof window.canEdit === 'function' && window.canEdit();
  const n = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
  const clamp = (v,a=0,b=100) => Math.max(a,Math.min(b,v));
  const esc = v => typeof window.escapeHtml === 'function' ? window.escapeHtml(v) : String(v ?? '').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));

  function boardRect(){
    return $('board')?.getBoundingClientRect() || {left:0,top:0,width:1,height:1};
  }

  function point(ev){
    const r=boardRect();
    return {x:clamp((ev.clientX-r.left)/Math.max(1,r.width)*100),y:clamp((ev.clientY-r.top)/Math.max(1,r.height)*100)};
  }

  function cellPx(){
    const r=boardRect();
    return Math.max(8, r.width * Math.max(.5,n(vtt.settings?.grid_size,5)) / 100);
  }

  function settingsDefault(){
    return {
      campaign_id:cid(),
      floor_id:fid(),
      grid_enabled:true,
      snap_enabled:true,
      grid_size:5,
      unit_per_cell:5,
      fog_enabled:false,
      vision_enabled:false
    };
  }

  function snapPoint(x,y){
    const s=vtt.settings;
    if(!s?.snap_enabled)return{x,y};
    const r=boardRect(), step=cellPx();
    const sx=step/Math.max(1,r.width)*100, sy=step/Math.max(1,r.height)*100;
    return {x:clamp(Math.round(x/sx)*sx),y:clamp(Math.round(y/sy)*sy)};
  }

  function snapSize(w,h){
    const s=vtt.settings;
    if(!s?.snap_enabled)return{width:w,height:h};
    const r=boardRect(), step=cellPx();
    const sx=step/Math.max(1,r.width)*100, sy=step/Math.max(1,r.height)*100;
    return {width:Math.max(sx,Math.round(w/sx)*sx),height:Math.max(sy,Math.round(h/sy)*sy)};
  }

  window.rpgSnapPoint=snapPoint;
  window.rpgSnapSize=snapSize;

  function injectStyles(){
    if($('rpgVttEngineStyles'))return;
    const s=document.createElement('style');
    s.id='rpgVttEngineStyles';
    s.textContent=[
      '.rpgVttToolRow{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:7px;width:100%}',
      '.rpgVttTool{border:1px solid #29313d;background:#10161e;color:#929cab;border-radius:8px;padding:7px 9px;font-size:8px;cursor:pointer;white-space:nowrap}',
      '.rpgVttTool:hover{border-color:#454c5b;color:#e2e5ed}',
      '.rpgVttTool.active{border-color:#7064b8;color:#e5e1ff;background:rgba(148,135,255,.1)}',
      '.rpgVttMini{border:1px solid #29313d;background:#0e141b;color:#8f98a7;border-radius:8px;padding:6px 8px;font-size:8px;cursor:pointer;white-space:nowrap}',
      '.rpgVttPanel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 10px;margin:0 0 8px;border:1px solid #252d39;border-radius:10px;background:linear-gradient(180deg,#0e141b,#0b1016);color:#707b8b;font-size:8px}',
      '.rpgVttPanel label{display:inline-flex;align-items:center;gap:5px}',
      '.rpgVttPanel select{height:28px;min-width:108px;padding:0 7px;border:1px solid #2a313c;border-radius:7px;background:#0a0e14;color:#d8dce4;font-size:8px}',
      '.rpgVttPanel b{color:#c8cce0}',
      '.rpgVttOverlay{position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:60}',
      '.rpgFogRegion{position:absolute;pointer-events:auto;box-sizing:border-box;background:rgba(3,5,8,.9);border:1px solid rgba(148,135,255,.16)}',
      '.rpgFogRegion.master{background:repeating-linear-gradient(135deg,rgba(28,23,48,.55) 0 7px,rgba(9,9,13,.72) 7px 14px);border:1px dashed rgba(148,135,255,.44);cursor:pointer}',
      '.rpgAoe{position:absolute;box-sizing:border-box;pointer-events:none;border:2px solid #9487ff;background:rgba(148,135,255,.2);box-shadow:0 0 25px rgba(148,135,255,.14)}',
      '.rpgAoe.circle{border-radius:50%}',
      '.rpgAoe.square{border-radius:6px}',
      '.rpgAoe.cone{clip-path:polygon(0 50%,100% 0,100% 100%);border-radius:0}',
      '.rpgAoe.line{height:5px!important;border-radius:99px;transform-origin:0 50%}',
      '.rpgAoeDelete{position:absolute;top:-11px;right:-11px;width:18px;height:18px;border:1px solid #4b2731;border-radius:50%;background:#171015;color:#ff9eaa;display:grid;place-items:center;font-size:10px;cursor:pointer;pointer-events:auto}',
      '.rpgAoeLabel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:4px 7px;border-radius:99px;background:rgba(7,9,13,.74);color:#eeeaff;font-size:7px;white-space:nowrap}',
      '.rpgMeasureLine{position:absolute;height:3px;border-radius:99px;background:linear-gradient(90deg,#e8e3ff,#9487ff);transform-origin:0 50%;z-index:70;box-shadow:0 0 10px rgba(148,135,255,.58);pointer-events:none}',
      '.rpgMeasureDot{position:absolute;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;background:#f3f0ff;border:1px solid #9487ff;box-shadow:0 0 12px rgba(148,135,255,.7);z-index:71;pointer-events:none}',
      '.rpgMeasureLabel{position:absolute;z-index:72;transform:translate(-50%,-50%);padding:6px 8px;border:1px solid #3c3565;border-radius:8px;background:rgba(13,14,22,.94);color:#ece8ff;font-size:8px;white-space:nowrap;box-shadow:0 9px 28px rgba(0,0,0,.38);pointer-events:none}',
      '.rpgRoomDrawPreview{position:absolute;z-index:95;border:1px dashed rgba(148,135,255,.95);background:rgba(148,135,255,.12);box-shadow:0 0 0 1px rgba(148,135,255,.08);pointer-events:none}',
      '.rpgRoomRotateHandle{position:absolute;left:50%;top:-22px;transform:translateX(-50%);width:20px;height:20px;border:1px solid #4b4279;border-radius:50%;background:#12101d;color:#ddd7ff;display:grid;place-items:center;font-size:11px;cursor:grab;z-index:50;box-shadow:0 7px 18px rgba(0,0,0,.32);touch-action:none}',
      '.rpgRoomRotateHandle:active{cursor:grabbing;background:#1b1730}',
      '.rpgRoomRotateLine{position:absolute;left:50%;top:-11px;width:1px;height:13px;background:#5b517f;transform:translateX(-50%);pointer-events:none;z-index:49}',
      '.rpgRoomRotationBar{position:absolute;z-index:82;display:flex;gap:4px;align-items:center;padding:5px;border:1px solid #2b3040;border-radius:9px;background:rgba(10,12,18,.95);box-shadow:0 12px 30px rgba(0,0,0,.35);pointer-events:auto}',
      '.rpgRoomRotationBar button{border:1px solid #2a303b;background:#11161d;color:#adb4c1;border-radius:7px;padding:5px 7px;font-size:8px;cursor:pointer}',
      '.rpgRoomRotationBar strong{font-size:8px;color:#c7c3e7;min-width:38px;text-align:center}',
      '.rpgVttNotice{position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:100;padding:7px 9px;border:1px solid #343b47;border-radius:9px;background:rgba(8,11,15,.94);color:#b4bbc7;font-size:8px;box-shadow:0 12px 35px rgba(0,0,0,.35);pointer-events:none}',
      '.rpgVttZoomBadge{font-variant-numeric:tabular-nums}',
      '@media(max-width:700px){.rpgVttTool{flex:1 1 calc(50% - 6px)}.rpgVttPanel{font-size:7px}.rpgRoomRotateHandle{top:-19px}.rpgRoomRotationBar{transform:scale(.96);transform-origin:top left}}'
    ].join('');
    document.head.appendChild(s);
  }

  function overlay(){
    const board=$('board');if(!board)return null;
    let o=$('rpgVttOverlay');
    if(!o){o=document.createElement('div');o.id='rpgVttOverlay';o.className='rpgVttOverlay';board.appendChild(o)}
    return o;
  }

  function renderGrid(){
    const board=$('board');if(!board)return;
    if(vtt.settings?.grid_enabled){
      const px=cellPx();
      board.classList.add('rpg-grid-enabled');
      board.style.backgroundImage='linear-gradient(rgba(255,255,255,.032) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.032) 1px,transparent 1px)';
      board.style.setProperty('background-size',px+'px '+px+'px','important');
      board.style.backgroundPosition='0 0';
    }else{
      board.classList.remove('rpg-grid-enabled');
      board.style.backgroundImage='none';
    }
  }

  function renderFog(){
    const o=overlay();if(!o)return;
    o.querySelectorAll('.rpgFogRegion').forEach(e=>e.remove());
    if(!vtt.settings?.fog_enabled)return;
    (vtt.fog||[]).forEach(r=>{
      if(r.revealed)return;
      const el=document.createElement('div');
      el.className='rpgFogRegion'+(master()?' master':'');
      el.style.left=n(r.x)+'%';el.style.top=n(r.y)+'%';el.style.width=n(r.width)+'%';el.style.height=n(r.height)+'%';
      if(master())el.addEventListener('click',async e=>{e.stopPropagation();await removeFog(r.id)});
      o.appendChild(el);
    });
  }

  function aoeStyle(r){
    const board=$('board'),rect=boardRect(),cell=cellPx(),shape=r.shape||'circle';
    const sizeCells=Math.max(1,n(r.size,1)),lengthCells=Math.max(1,n(r.length,1));
    const sizePx=sizeCells*cell,lengthPx=lengthCells*cell;
    if(shape==='line')return {left:n(r.x)/100*rect.width,top:n(r.y)/100*rect.height,width:lengthPx,height:5,rotation:n(r.rotation,0)};
    if(shape==='cone')return {left:n(r.x)/100*rect.width,top:n(r.y)/100*rect.height-sizePx/2,width:sizePx,height:sizePx,rotation:n(r.rotation,0)};
    return {left:n(r.x)/100*rect.width-sizePx/2,top:n(r.y)/100*rect.height-sizePx/2,width:sizePx,height:sizePx,rotation:n(r.rotation,0)};
  }

  function renderAoe(){
    const o=overlay();if(!o)return;
    o.querySelectorAll('.rpgAoe').forEach(e=>e.remove());
    (vtt.aoe||[]).forEach(r=>{
      const el=document.createElement('div');el.className='rpgAoe '+esc(r.shape||'circle');
      const s=aoeStyle(r);
      el.style.left=s.left+'px';el.style.top=s.top+'px';el.style.width=s.width+'px';el.style.height=s.height+'px';el.style.transform='rotate('+s.rotation+'deg)';
      const color=r.color||'#9487ff';el.style.borderColor=color;el.style.background='color-mix(in srgb,'+color+' 20%, transparent)';el.style.opacity=String(r.opacity ?? .22);
      if(r.label)el.innerHTML='<span class="rpgAoeLabel">'+esc(r.label)+'</span>';
      if(master()){
        const del=document.createElement('button');del.className='rpgAoeDelete';del.type='button';del.textContent='×';del.title='Remover área';del.addEventListener('click',async e=>{e.stopPropagation();await removeAoe(r.id)});el.appendChild(del);
      }
      o.appendChild(el);
    });
  }

  function ensureRotationBar(){
    const board=$('board');if(!board)return;
    board.querySelector('.rpgRoomRotationBar')?.remove();
    if(!master()||window.state?.selected?.type!=='room')return;
    const room=window.state.rooms?.find(r=>r.id===window.state.selected.id);
    if(!room||room.floor_id!==fid())return;
    const el=document.querySelector('.room[data-room-id="'+CSS.escape(room.id)+'"]');if(!el)return;
    const bar=document.createElement('div');bar.className='rpgRoomRotationBar';
    bar.innerHTML='<button type="button" data-rot="-15">↶</button><strong>'+Math.round(((n(room.rotation)||0)+360)%360)+'°</strong><button type="button" data-rot="15">↷</button><button type="button" data-rot="reset">0°</button>';
    const rect=boardRect(),er=el.getBoundingClientRect();
    const left=er.left+er.width/2-rect.left-84, top=er.top+er.height+8-rect.top;
    bar.style.left=Math.max(4,left)+'px';bar.style.top=Math.max(4,top)+'px';
    bar.querySelectorAll('[data-rot]').forEach(b=>b.addEventListener('click',async e=>{
      e.stopPropagation();const mode=b.dataset.rot;
      const next=mode==='reset'?0:n(room.rotation)+Number(mode);
      await saveRoomRotation(room.id,normalizeAngle(next));
    }));
    board.appendChild(bar);
  }

  function normalizeAngle(a){
    let x=Number(a)||0;
    while(x>180)x-=360;while(x<-180)x+=360;
    return Math.round(x*10)/10;
  }

  function decorateRoomRotation(){
    document.querySelectorAll('#roomLayer .room').forEach(roomEl=>{
      roomEl.querySelectorAll('.rpgRoomRotateHandle,.rpgRoomRotateLine').forEach(e=>e.remove());
      if(!master())return;
      const handle=document.createElement('button');handle.type='button';handle.className='rpgRoomRotateHandle';handle.textContent='⟳';handle.title='Arraste para rotacionar';
      const line=document.createElement('span');line.className='rpgRoomRotateLine';
      roomEl.append(line,handle);
      handle.addEventListener('pointerdown',e=>startRoomRotation(e,roomEl));
    });
    ensureRotationBar();
  }

  function startRoomRotation(e,roomEl){
    if(!master())return;
    e.preventDefault();e.stopImmediatePropagation();
    const room=window.state.rooms?.find(r=>r.id===roomEl.dataset.roomId);if(!room)return;
    const rect=roomEl.getBoundingClientRect();
    const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
    const startAngle=Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI;
    const base=n(room.rotation);
    const pointerId=e.pointerId;
    roomEl.setPointerCapture?.(pointerId);
    const move=ev=>{
      const a=Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI;
      const next=normalizeAngle(base+(a-startAngle));
      roomEl.style.transform='rotate('+next+'deg)';
      roomEl.dataset.rotation=String(next);
    };
    const up=async ev=>{
      roomEl.removeEventListener('pointermove',move);
      roomEl.removeEventListener('pointerup',up);
      roomEl.removeEventListener('pointercancel',up);
      const next=normalizeAngle(roomEl.dataset.rotation ?? base);
      await saveRoomRotation(room.id,next);
    };
    roomEl.addEventListener('pointermove',move);
    roomEl.addEventListener('pointerup',up);
    roomEl.addEventListener('pointercancel',up);
  }

  async function saveRoomRotation(id,rotation){
    if(!master())return;
    const q=await sbc().from('rooms').update({rotation}).eq('id',id).select().single();
    if(q.error){window.toast?.(q.error.message||'Não foi possível salvar a rotação.','error');return;}
    window.state.rooms=window.state.rooms.map(r=>r.id===id?q.data:r);
    if(window.state.selected?.type==='room'&&window.state.selected.id===id){
      window.renderTable?.();
    }else{
      decorateRoomRotation();
    }
    if(typeof window.broadcastRoomRotate==='function')await window.broadcastRoomRotate({room_id:id,rotation});
    window.setSave?.('Rotação do cenário salva');
  }

  function renderMeasure(p){
    const o=overlay();if(!o)return;
    const s=vtt.measure?.start;if(!s)return;
    const r=boardRect(),cell=cellPx();
    const x1=s.x/100*r.width,y1=s.y/100*r.height,x2=p.x/100*r.width,y2=p.y/100*r.height;
    const dx=x2-x1,dy=y2-y1,px=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;
    const cells=px/Math.max(1,cell),units=cells*n(vtt.settings?.unit_per_cell,5);
    let line=vtt.measure.line,label=vtt.measure.label,a=vtt.measure.a,b=vtt.measure.b;
    if(!line){
      line=document.createElement('div');line.className='rpgMeasureLine';
      a=document.createElement('div');a.className='rpgMeasureDot';
      b=document.createElement('div');b.className='rpgMeasureDot';
      label=document.createElement('div');label.className='rpgMeasureLabel';
      o.append(line,a,b,label);vtt.measure.line=line;vtt.measure.a=a;vtt.measure.b=b;vtt.measure.label=label;
    }
    line.style.left=x1+'px';line.style.top=y1+'px';line.style.width=px+'px';line.style.transform='rotate('+angle+'deg)';
    a.style.left=x1+'px';a.style.top=y1+'px';b.style.left=x2+'px';b.style.top=y2+'px';
    label.style.left=((x1+x2)/2)+'px';label.style.top=((y1+y2)/2)+'px';
    label.textContent=(cells%1?cells.toFixed(1):Math.round(cells))+' '+(cells===1?'célula':'células')+' · '+(units%1?units.toFixed(1):Math.round(units))+' '+(n(vtt.settings?.unit_per_cell,5)===1?'unidade':'unidades');
  }

  function clearMeasure(){vtt.measure=null;overlay()?.querySelectorAll('.rpgMeasureLine,.rpgMeasureDot,.rpgMeasureLabel').forEach(e=>e.remove())}

  function dragAoePreview(p){
    const d=vtt.drag;if(!d?.preview)return;
    const r=boardRect(),cell=cellPx(),s=d.start,shape=vtt.aoeShape;
    const sx=s.x/100*r.width,sy=s.y/100*r.height,px=p.x/100*r.width,py=p.y/100*r.height;
    const dx=px-sx,dy=py-sy,dist=Math.max(cell,Math.hypot(dx,dy)),cells=dist/cell,angle=Math.atan2(dy,dx)*180/Math.PI;
    d.preview.style.transform='rotate('+angle+'deg)';
    if(shape==='line'){
      d.preview.style.left=sx+'px';d.preview.style.top=(sy-3)+'px';d.preview.style.width=dist+'px';d.preview.style.height='5px';
      d.preview.className='rpgAoe line';
    }else if(shape==='cone'){
      d.preview.style.left=sx+'px';d.preview.style.top=(sy-dist/2)+'px';d.preview.style.width=dist+'px';d.preview.style.height=dist+'px';
      d.preview.className='rpgAoe cone';
    }else{
      d.preview.style.left=(sx-dist/2)+'px';d.preview.style.top=(sy-dist/2)+'px';d.preview.style.width=dist+'px';d.preview.style.height=dist+'px';
      d.preview.className='rpgAoe '+shape;
    }
    d.preview.dataset.cells=cells;d.preview.dataset.angle=angle;
  }

  function boardPointerDown(ev){
    if(vtt.activeTool==='move'||ev.button!==0||window.state?.tool==='draw')return;
    if(vtt.activeTool==='fog'&&!master())return;
    if(vtt.activeTool==='aoe'&&!master()){showHint('Somente o Mestre pode criar áreas de efeito.');return}
    ev.preventDefault();ev.stopImmediatePropagation();
    const b=$('board');const p=point(ev);
    if(vtt.activeTool==='measure'){
      clearMeasure();vtt.measure={start:p,active:true,pointerId:ev.pointerId};
      b.setPointerCapture?.(ev.pointerId);renderMeasure(p);return;
    }
    if(vtt.activeTool==='fog'||vtt.activeTool==='aoe'){
      const start=vtt.activeTool==='aoe'?snapPoint(p.x,p.y):p;
      const preview=document.createElement('div');
      preview.className=vtt.activeTool==='fog'?'rpgFogRegion master':'rpgAoe '+vtt.aoeShape;
      preview.style.opacity=vtt.activeTool==='fog'?'.92':'.24';
      overlay()?.appendChild(preview);
      vtt.drag={start,preview,pointerId:ev.pointerId};
      b.setPointerCapture?.(ev.pointerId);
      if(vtt.activeTool==='aoe')dragAoePreview(start);
    }
  }

  function boardPointerMove(ev){
    if(vtt.measure?.active){renderMeasure(point(ev));return}
    if(vtt.drag?.pointerId===ev.pointerId){
      const p=point(ev),d=vtt.drag;
      if(vtt.activeTool==='fog'){
        const x=Math.min(d.start.x,p.x),y=Math.min(d.start.y,p.y),w=Math.abs(p.x-d.start.x),h=Math.abs(p.y-d.start.y);
        d.preview.style.left=x+'%';d.preview.style.top=y+'%';d.preview.style.width=w+'%';d.preview.style.height=h+'%';
      }else{
        dragAoePreview(vtt.settings?.snap_enabled?snapPoint(p.x,p.y):p);
      }
    }
  }

  async function boardPointerUp(ev){
    if(vtt.measure){
      const p=point(ev);
      vtt.measure.end=p;
      vtt.measure.active=false;
      try{$('board').releasePointerCapture?.(ev.pointerId)}catch(_){}
      renderMeasure(p);
      return;
    }
    if(!vtt.drag||vtt.drag.pointerId!==ev.pointerId)return;
    const d=vtt.drag,p=vtt.settings?.snap_enabled?snapPoint(point(ev).x,point(ev).y):point(ev);
    d.preview.remove();vtt.drag=null;
    if(vtt.activeTool==='fog'){
      const x=Math.min(d.start.x,p.x),y=Math.min(d.start.y,p.y),w=Math.abs(p.x-d.start.x),h=Math.abs(p.y-d.start.y);
      if(w<1||h<1)return;
      const q=await sbc().from('fog_regions').insert({campaign_id:cid(),floor_id:fid(),x,y,width:w,height:h,revealed:false,created_by:window.state.user.id}).select().single();
      if(q.error)window.toast?.(q.error.message||'Não foi possível criar a névoa.','error');else{vtt.fog.push(q.data);renderFog();broadcast('fog_updated',{floor_id:fid()})}
      return;
    }
    const r=boardRect(),cell=cellPx(),shape=vtt.aoeShape;
    let sx=d.start.x/100*r.width,sy=d.start.y/100*r.height,px=p.x/100*r.width,py=p.y/100*r.height;
    let dx=px-sx,dy=py-sy,dist=Math.hypot(dx,dy),angle=Math.atan2(dy,dx)*180/Math.PI;
    if(shape==='circle'||shape==='square'){
      const maxRadius=Math.max(cell,Math.min(r.width,r.height)/2);
      dist=Math.max(cell,Math.min(maxRadius,dist||cell));
      sx=Math.max(dist,Math.min(r.width-dist,sx));sy=Math.max(dist,Math.min(r.height-dist,sy));
    }else{
      px=Math.max(0,Math.min(r.width,px));py=Math.max(0,Math.min(r.height,py));
      dx=px-sx;dy=py-sy;dist=Math.max(cell,Math.hypot(dx,dy));angle=Math.atan2(dy,dx)*180/Math.PI;
    }
    const cells=Math.max(1,Math.min(100,Math.round(dist/cell*10)/10));
    const startX=clamp(sx/r.width*100),startY=clamp(sy/r.height*100);
    const payload={
      campaign_id:cid(),floor_id:fid(),session_id:typeof window.currentSession==='function'?window.currentSession()?.id||null:null,
      shape,x:startX,y:startY,size:cells,length:cells,rotation:shape==='circle'||shape==='square'?0:normalizeAngle(angle),
      color:'#9487ff',opacity:.22,label:''
    };
    const q=await sbc().from('aoe_effects').insert(payload).select().single();
    if(q.error)window.toast?.(q.error.message||'Não foi possível criar a área.','error');else{vtt.aoe.push(q.data);renderAoe();broadcast('aoe_updated',{floor_id:fid()})}
  }

  async function removeFog(id){
    if(!master())return;
    const q=await sbc().from('fog_regions').delete().eq('id',id);
    if(q.error)return window.toast?.(q.error.message||'Não foi possível remover a névoa.','error');
    vtt.fog=vtt.fog.filter(x=>x.id!==id);renderFog();broadcast('fog_updated',{floor_id:fid()})
  }

  async function removeAoe(id){
    if(!master())return;
    const q=await sbc().from('aoe_effects').delete().eq('id',id);
    if(q.error)return window.toast?.(q.error.message||'Não foi possível remover a área.','error');
    vtt.aoe=vtt.aoe.filter(x=>x.id!==id);renderAoe();broadcast('aoe_updated',{floor_id:fid()})
  }

  async function broadcast(event,payload){
    try{if(window.state?.campaignChannel)await window.state.campaignChannel.send({type:'broadcast',event,payload:{...payload,user_id:window.state.user.id}})}catch(err){console.warn('RPG HUB VTT broadcast:',err)}
  }

  function loadConditions(){
    const c=cid(),floor=fid();if(!c||!floor)return;
    const key=c+':'+floor;
    if(vtt.conditionCache.key===key||vtt.conditionCache.promise)return;
    vtt.conditionCache.promise=(async()=>{
      try{
        const sess=typeof window.currentSession==='function'?window.currentSession():null;
        if(!sess){vtt.conditionCache={key,rows:[],promise:null};decorateTokens();return}
        const ce=await sbc().from('combat_encounters').select('id,current_index,round,status').eq('campaign_id',c).eq('session_id',sess.id).order('created_at',{ascending:false}).limit(1);
        if(ce.error)throw ce.error;
        const enc=ce.data?.[0];if(!enc){vtt.conditionCache={key,rows:[],promise:null};decorateTokens();return}
        const cb=await sbc().from('combatants').select('id,character_id,npc_id,conditions,turn_order').eq('encounter_id',enc.id).order('turn_order');
        if(cb.error)throw cb.error;
        const rows=(window.state.entities||[]).filter(e=>e.floor_id===floor).map(entity=>{
          const cbt=(cb.data||[]).find(x=>(x.character_id&&x.character_id===entity.character_id)||(x.npc_id&&x.npc_id===entity.npc_id));
          if(!cbt)return null;
          return{entity_id:entity.id,conditions:cbt.conditions,active:false,turn_order:cbt.turn_order};
        }).filter(Boolean);
        const ordered=[...(cb.data||[])];const activeId=ordered[Math.max(0,Math.min(n(enc.current_index),Math.max(ordered.length-1,0)))]?.id;
        rows.forEach(row=>{const cbt=ordered.find(x=>x.turn_order===row.turn_order);row.active=cbt?.id===activeId});
        vtt.conditionCache={key,rows,promise:null};decorateTokens();
      }catch(err){console.warn('RPG HUB token conditions:',err);vtt.conditionCache={key,rows:[],promise:null}}
    })();
  }

  function decorateTokens(){
    loadConditions();
    document.querySelectorAll('#tokenLayer .tokenBig').forEach(el=>{
      el.querySelectorAll('.rpgConditionBadge,.rpgConditionRing,.rpgCombatTurnRing').forEach(x=>x.remove());
      const match=vtt.conditionCache.rows.find(x=>x.entity_id===el.dataset.entityId);if(!match)return;
      const conditions=String(match.conditions||'').split(',').map(x=>x.trim()).filter(Boolean);
      if(conditions.length){
        const badge=document.createElement('span');badge.className='rpgConditionBadge';badge.textContent=conditions.length>9?'9+':String(conditions.length);badge.title=conditions.join(', ');el.appendChild(badge);
        const colors={'Atordoado':'#fbbf24','Caído':'#fb7185','Envenenado':'#6ee7b7','Amedrontado':'#c4b5fd','Cego':'#94a3b8','Contido':'#60a5fa','Invisível':'#67e8f9'};
        const ring=document.createElement('span');ring.className='rpgConditionRing';ring.style.color=colors[conditions[0]]||'#9487ff';el.appendChild(ring);
      }
      if(match.active){const ring=document.createElement('span');ring.className='rpgCombatTurnRing';el.appendChild(ring)}
    });
  }

  async function loadFloorData(){
    const c=cid(),f=fid(),api=sbc();if(!c||!f||!api)return;
    const [a,g,o]=await Promise.all([
      api.from('map_settings').select('*').eq('campaign_id',c).eq('floor_id',f).maybeSingle(),
      api.from('fog_regions').select('*').eq('campaign_id',c).eq('floor_id',f).order('created_at'),
      api.from('aoe_effects').select('*').eq('campaign_id',c).eq('floor_id',f).order('created_at')
    ]);
    vtt.settings=a.data||settingsDefault();vtt.fog=g.data||[];vtt.aoe=o.data||[];
    vtt.campaignId=c;vtt.floorId=f;vtt.conditionCache={key:null,rows:[],promise:null};
    renderGrid();renderFog();renderAoe();decorateTokens();refreshMapLayout();
  }

  async function saveSettings(partial){
    if(!master()||!cid()||!fid())return;
    const q=await sbc().from('map_settings').upsert({...settingsDefault(),...(vtt.settings||{}),...partial,campaign_id:cid(),floor_id:fid(),updated_by:window.state.user.id},{onConflict:'campaign_id,floor_id'}).select().single();
    if(q.error)return window.toast?.(q.error.message||'Não foi possível salvar as configurações.','error');
    vtt.settings=q.data;renderGrid();refreshMapLayout();window.setSave?.('Configuração do mapa salva');
  }

  function refreshMapLayout(){
    renderGrid();renderAoe();ensureRotationBar();
    document.querySelector('.boardPanel')?.classList.add('rpgMapPanelReady');
  }
  window.rpgVttRefreshGrid=renderGrid;
  window.rpgVttRefreshMapLayout=refreshMapLayout;
  window.rpgVttSetTool=tool=>{
    if(tool==='move'){
      vtt.activeTool='move';clearMeasure();updateToolbar();
      return;
    }
    setTool(tool);
  };
  window.rpgVttSetGrid=enabled=>saveSettings({grid_enabled:!!enabled});
  window.rpgVttGetGrid=()=>!!vtt.settings?.grid_enabled;
  window.rpgVttContextChanged=()=>loadFloorDataWhenChanged();
  window.rpgVttSnapRoomGeometry=()=>{
    const s=['roomX','roomY','roomW','roomH'];if(s.some(id=>!$(id)))return;
    const g=snapSize(Number($('roomW').value)||5,Number($('roomH').value)||5);
    $('roomW').value=g.width.toFixed(2);$('roomH').value=g.height.toFixed(2);
    const p=snapPoint(Number($('roomX').value)||0,Number($('roomY').value)||0);
    $('roomX').value=p.x.toFixed(2);$('roomY').value=p.y.toFixed(2);
  };

  function openMapSettings(){
    if(!master())return;
    const s={...settingsDefault(),...(vtt.settings||{})};
    window.showModal?.('<div class="modalHeader"><div><div class="eyebrow">MESA · MAPA</div><h3>Configuração do cenário</h3><p class="modalHint">A grade agora usa células físicas quadradas; o snap, a medição e as áreas compartilham exatamente a mesma escala.</p></div><button class="closeButton" data-close>×</button></div><div class="rpgMapSettingsModal"><div class="rpgMapSettingsGrid"><div class="rpgMapSettingsItem"><label><input id="vttGrid" type="checkbox" '+(s.grid_enabled?'checked':'')+'> Exibir grade</label></div><div class="rpgMapSettingsItem"><label><input id="vttSnap" type="checkbox" '+(s.snap_enabled?'checked':'')+'> Ativar snap</label></div><div class="rpgMapSettingsItem"><label>Espaçamento da célula (%)<input id="vttGridSize" type="number" min=".5" max="25" step=".5" value="'+n(s.grid_size,5)+'"></label></div><div class="rpgMapSettingsItem"><label>Unidades por célula<input id="vttUnit" type="number" min=".1" max="1000" step=".1" value="'+n(s.unit_per_cell,5)+'"></label></div><div class="rpgMapSettingsItem"><label><input id="vttFog" type="checkbox" '+(s.fog_enabled?'checked':'')+'> Ativar Fog of War</label></div></div><div class="rpgVttHint">Medição, snap e áreas usam a célula física do mapa. Amplie o zoom para trabalhar com precisão e navegue pela viewport com as barras de rolagem.</div></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="vttSaveSettings" class="primarySmall">Salvar configuração</button></div>');
    $('vttSaveSettings').onclick=async()=>{const grid=Math.max(.5,Math.min(25,Number($('vttGridSize').value)||5)),unit=Math.max(.1,Math.min(1000,Number($('vttUnit').value)||5));await saveSettings({grid_enabled:$('vttGrid').checked,snap_enabled:$('vttSnap').checked,grid_size:grid,unit_per_cell:unit,fog_enabled:$('vttFog').checked});window.closeModal?.()};
  }

  function showHint(text){
    const board=$('board');if(!board)return;let el=board.querySelector('.rpgVttNotice');if(!el){el=document.createElement('div');el.className='rpgVttNotice';board.appendChild(el)}
    el.textContent=text;clearTimeout(el._timer);el._timer=setTimeout(()=>el.remove(),2200);
  }

  function forceMoveMode(){
    vtt.activeTool='move';clearMeasure();$('board')?.classList.remove('drawing');
    if(typeof window.state!=='undefined')window.state.tool='move';
    $('moveBtn')?.classList.add('chosen');$('structureBtn')?.classList.remove('chosen');
    updateToolbar();
  }

  function toolbar(){
    const host=document.querySelector('.boardToolbar .toolbarActions');if(!host)return;
    if(!$('rpgVttTools')){
      const row=document.createElement('div');row.id='rpgVttTools';row.className='rpgVttToolRow';
      row.innerHTML='<button type="button" class="rpgVttTool" data-vtt-tool="measure">⌁ Medir</button>'+ (master()?'<button type="button" class="rpgVttTool" data-vtt-tool="aoe">◉ Área</button><button type="button" class="rpgVttTool" data-vtt-tool="fog">◒ Névoa</button><button type="button" class="rpgVttTool" data-vtt-settings>⚙ Grade</button>':'');
      host.appendChild(row);
      row.querySelectorAll('[data-vtt-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.vttTool)));
      row.querySelector('[data-vtt-settings]')?.addEventListener('click',openMapSettings);
      const zoomLabel=$('zoomValue');
      if(zoomLabel&&!$('zoomReset')){
        const reset=document.createElement('button');reset.id='zoomReset';reset.type='button';reset.className='iconButton';reset.textContent='100%';reset.title='Enquadrar mapa em 100%';zoomLabel.after(reset);
        reset.addEventListener('click',()=>{window.state.zoom=100;window.applyZoom?.()});
      }
    }
    updateToolbar();
  }

  function updateToolbar(){
    $('rpgVttTools')?.querySelectorAll('[data-vtt-tool]').forEach(b=>b.classList.toggle('active',b.dataset.vttTool===vtt.activeTool));
    const board=$('board');if(board)board.style.cursor=vtt.activeTool==='move'?(window.state?.tool==='draw'?'crosshair':'default'):'crosshair';
    const panel=$('rpgVttPanel');if(panel)panel.querySelector('[data-vtt-zoom]')?.replaceChildren(document.createTextNode((window.state?.zoom||100)+'%'));
  }

  function setTool(tool){
    if(tool==='aoe'&&!master()){showHint('Somente o Mestre pode criar áreas de efeito.');return}
    if(tool==='fog'&&!master())return;
    forceMoveMode();
    vtt.activeTool=tool;
    if(tool==='measure')showHint('Arraste de um ponto até outro para medir.');
    else if(tool==='aoe')showHint('Escolha a forma e arraste pelo mapa para criar a área.');
    else if(tool==='fog')showHint('Arraste para cobrir uma região com névoa.');
    updateToolbar();
  }

  function addPanel(){
    const panel=document.querySelector('.boardPanel'),toolbarEl=document.querySelector('.boardToolbar');if(!panel||!toolbarEl)return;
    if(!$('rpgVttPanel')){
      const p=document.createElement('div');p.id='rpgVttPanel';p.className='rpgVttPanel';
      p.innerHTML='<label>Forma <select id="rpgAoeShape"><option value="circle">Círculo</option><option value="square">Quadrado</option><option value="cone">Cone</option><option value="line">Linha</option></select></label><span>Grade <b id="rpgGridStatus">—</b></span><span>Snap <b id="rpgSnapStatus">—</b></span><span>Zoom <b data-vtt-zoom class="rpgVttZoomBadge">100%</b></span><button type="button" class="rpgVttMini" id="rpgMeasureClear">Limpar medição</button>';
      panel.insertBefore(p,toolbarEl.nextSibling);
      $('rpgAoeShape').value=vtt.aoeShape;$('rpgAoeShape').addEventListener('change',e=>{vtt.aoeShape=e.target.value;if(vtt.activeTool==='aoe')showHint('Forma '+e.target.options[e.target.selectedIndex].text+' selecionada.')});
      $('rpgMeasureClear').addEventListener('click',clearMeasure);
    }
    updatePanel();
  }

  function updatePanel(){
    $('rpgGridStatus')?.replaceChildren(document.createTextNode(vtt.settings?.grid_enabled?'ON':'OFF'));
    $('rpgSnapStatus')?.replaceChildren(document.createTextNode(vtt.settings?.snap_enabled?'ON':'OFF'));
    const z=document.querySelector('#rpgVttPanel [data-vtt-zoom]');if(z)z.textContent=(window.state?.zoom||100)+'%';
  }

  function hookRenderTable(){
    if(typeof window.renderTable!=='function'||window.renderTable.__rpgVttEngine)return;
    const base=window.renderTable;
    const wrapped=function(){const result=base.apply(this,arguments);setTimeout(()=>{addPanel();toolbar();renderGrid();renderFog();renderAoe();decorateTokens();decorateRoomRotation();},0);return result};
    wrapped.__rpgVttEngine=true;wrapped.__base=base;window.renderTable=wrapped;
  }

  function hookRenderAll(){
    if(typeof window.renderAll!=='function'||window.renderAll.__rpgVttEngine)return;
    const base=window.renderAll;
    const wrapped=function(){const result=base.apply(this,arguments);setTimeout(()=>{addPanel();toolbar();renderGrid();renderFog();renderAoe();decorateTokens();decorateRoomRotation();},0);return result};
    wrapped.__rpgVttEngine=true;wrapped.__base=base;window.renderAll=wrapped;
  }

  async function loadFloorDataWhenChanged(){
    const c=cid(),f=fid();if(!c||!f)return;
    if(c!==vtt.campaignId||f!==vtt.floorId||!vtt.settings)await loadFloorData();
  }

  function realtime(){
    const c=cid(),api=sbc();if(!c||!api)return;
    if(vtt.channel&&vtt.campaignId===c)return;
    if(vtt.channel)api.removeChannel(vtt.channel).catch(()=>{});
    const ch=api.channel('rpg-hub-vtt-engine-'+c,{config:{private:true}});
    const floorMatch=p=>{const r=p.new||p.old;return r&&r.floor_id===fid()};
    ch.on('postgres_changes',{event:'*',schema:'public',table:'map_settings',filter:'campaign_id=eq.'+c},p=>{if(!floorMatch(p))return;vtt.settings=p.new||settingsDefault();renderGrid();updatePanel()});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'fog_regions',filter:'campaign_id=eq.'+c},p=>{if(!floorMatch(p))return;const r=p.new||p.old;if(p.eventType==='INSERT'&&!vtt.fog.some(x=>x.id===r.id))vtt.fog.push(r);else if(p.eventType==='UPDATE')vtt.fog=vtt.fog.map(x=>x.id===r.id?r:x);else if(p.eventType==='DELETE')vtt.fog=vtt.fog.filter(x=>x.id!==r.id);renderFog()});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'aoe_effects',filter:'campaign_id=eq.'+c},p=>{if(!floorMatch(p))return;const r=p.new||p.old;if(p.eventType==='INSERT'&&!vtt.aoe.some(x=>x.id===r.id))vtt.aoe.push(r);else if(p.eventType==='UPDATE')vtt.aoe=vtt.aoe.map(x=>x.id===r.id?r:x);else if(p.eventType==='DELETE')vtt.aoe=vtt.aoe.filter(x=>x.id!==r.id);renderAoe()});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'rooms'},p=>{const r=p.new||p.old;if(r?.floor_id===fid()&&window.state?.view==='table'){setTimeout(decorateRoomRotation,30);window.renderTable?.();}});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'world_entities',filter:'campaign_id=eq.'+c},()=>{if(window.state?.view==='table'){window.renderTable?.();}});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'combat_encounters',filter:'campaign_id=eq.'+c},()=>{vtt.conditionCache={key:null,rows:[],promise:null};decorateTokens()});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'combatants'},()=>{vtt.conditionCache={key:null,rows:[],promise:null};decorateTokens()});
    ch.subscribe((status,error)=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('RPG HUB VTT realtime:',status,error)});
    vtt.channel=ch;vtt.campaignId=c;
  }

  function init(){
    if(vtt.initialized)return;
    const run=()=>{
      if(typeof window.state==='undefined'||!sbc()){setTimeout(run,250);return}
      vtt.initialized=true;injectStyles();hookRenderAll();hookRenderTable();bindBoard();addPanel();toolbar();loadFloorDataWhenChanged();realtime();
      window.addEventListener('resize',()=>{refreshMapLayout();decorateRoomRotation()});
      const tick=()=>{hookRenderAll();hookRenderTable();bindBoard();addPanel();toolbar();loadFloorDataWhenChanged();updatePanel();};
      setInterval(tick,2500);tick();
    };
    run();
  }

  function bindBoard(){
    const board=$('board');if(!board||board.dataset.rpgVttEngineBound)return;
    board.dataset.rpgVttEngineBound='1';
    board.addEventListener('pointerdown',boardPointerDown,true);
    board.addEventListener('pointermove',boardPointerMove,true);
    board.addEventListener('pointerup',boardPointerUp,true);
    board.addEventListener('pointercancel',ev=>{
      if(vtt.measure?.pointerId===ev.pointerId){try{board.releasePointerCapture?.(ev.pointerId)}catch(_){}clearMeasure();}
      if(vtt.drag?.pointerId===ev.pointerId){vtt.drag.preview.remove();vtt.drag=null;try{board.releasePointerCapture?.(ev.pointerId)}catch(_){}}
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();