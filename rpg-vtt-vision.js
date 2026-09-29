/* RPG HUB — real token vision, line of sight, walls and combat/map sync */
(() => {
  'use strict';
  const V={initialized:false,campaignId:null,floorId:null,settings:null,walls:[],sources:[],fog:[],explored:[],combat:{encounter:null,combatants:[]},activeTool:'none',drag:null,channel:null,lastKey:null,queued:false,observer:null,resizeObserver:null,revealBusy:false};
  const $=id=>document.getElementById(id), sb=()=>window.rpgSupabase, cid=()=>window.state?.campaign?.id||null, fid=()=>window.state?.floor||null;
  const master=()=>typeof window.canEdit==='function'&&window.canEdit();
  const esc=v=>typeof window.escapeHtml==='function'?window.escapeHtml(v):String(v??'').replace(/[&<>\"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d, clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
  const session=()=>typeof window.currentSession==='function'?window.currentSession():null;
  const point=e=>{const r=$('board').getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width*100),y:clamp((e.clientY-r.top)/r.height*100)}};

  function inject(){
    if($('rpgRealVisionStyles'))return;
    const s=document.createElement('style');s.id='rpgRealVisionStyles';
    s.textContent='.rpgVisionScene{position:absolute;inset:0;z-index:58;pointer-events:none;overflow:visible}.rpgVisionScene svg{width:100%;height:100%;display:block;overflow:visible}.rpgMapWall{stroke:rgba(231,235,243,.9);stroke-width:.85;fill:none;vector-effect:non-scaling-stroke;stroke-linecap:round;filter:drop-shadow(0 0 5px rgba(0,0,0,.7))}.rpgMapWall.master{stroke:rgba(148,135,255,.95);stroke-dasharray:2 1.2;pointer-events:stroke;cursor:pointer}.rpgMapWall.preview{stroke:rgba(148,135,255,.95);stroke-width:1;stroke-dasharray:2 1}.rpgVisionMask{position:absolute;inset:0;width:100%;height:100%;z-index:76;pointer-events:none}.rpgVisionRangeRing{position:absolute;z-index:74;pointer-events:none;border:1px dashed rgba(148,135,255,.28);border-radius:50%;box-sizing:border-box;transform:translate(-50%,-50%)}.rpgVisionSourceDot{position:absolute;z-index:75;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;background:#f2efff;border:1px solid #9487ff;box-shadow:0 0 16px rgba(148,135,255,.8);pointer-events:none}.rpgVisionCombatBadge{position:absolute;z-index:78;transform:translate(-50%,-50%);padding:4px 7px;border:1px solid #3c3565;border-radius:999px;background:rgba(13,11,24,.88);color:#e5e0ff;font-size:7px;letter-spacing:.06em;white-space:nowrap;pointer-events:none}.rpgVisionPlayerHint{position:absolute;z-index:79;left:50%;bottom:12px;transform:translateX(-50%);padding:7px 9px;border:1px solid #2d3340;border-radius:9px;background:rgba(8,11,15,.92);color:#8e98a8;font-size:8px;white-space:nowrap;pointer-events:none}.rpgVisionToolRow{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.rpgVisionTool{border:1px solid #29313d;background:#10161e;color:#929cab;border-radius:8px;padding:7px 8px;font-size:8px;cursor:pointer}.rpgVisionTool.active{border-color:var(--accent,#9487ff);color:#e2deff;background:rgba(148,135,255,.1)}.rpgVisionModal{display:grid;gap:12px}.rpgVisionModalHeader{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.rpgVisionModeCard{padding:11px;border:1px solid #29313d;border-radius:10px;background:#0d131a}.rpgVisionModeCard label{display:flex;align-items:center;gap:8px;color:#b9c0ca;font-size:9px}.rpgVisionModeCard small{display:block;margin-top:6px;color:#6d7787;font-size:8px;line-height:1.5}.rpgVisionEntityRow{display:grid;grid-template-columns:minmax(0,1fr) 120px 92px;gap:8px;align-items:end}.rpgVisionEntityRow label{display:grid;gap:5px;color:#707b8b;font-size:8px}.rpgVisionEntityRow input,.rpgVisionEntityRow select{height:31px;box-sizing:border-box;width:100%;padding:0 8px;border:1px solid #2a313c;border-radius:8px;background:#0a0e14;color:#d8dce4;font-size:8px}.rpgVisionEntityMeta{padding:9px;border:1px solid #29313d;border-radius:9px;background:#0d131a;color:#727d8e;font-size:8px;line-height:1.5}.rpgVisionDanger{border:1px solid #4b2731;background:#171015;color:#ff9eaa;border-radius:8px;padding:7px 8px;font-size:8px;cursor:pointer}@media(max-width:700px){.rpgVisionEntityRow{grid-template-columns:1fr 1fr}.rpgVisionEntityRow .rpgVisionMetaWrap{grid-column:1/-1}}';
    document.head.appendChild(s);
  }

  function layers(){
    const board=$('board');if(!board)return null;
    let scene=$('rpgVisionScene');
    if(!scene){scene=document.createElement('div');scene.id='rpgVisionScene';scene.className='rpgVisionScene';scene.innerHTML='<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>';board.appendChild(scene)}
    let mask=$('rpgVisionMask');
    if(!mask){mask=document.createElement('canvas');mask.id='rpgVisionMask';mask.className='rpgVisionMask';board.appendChild(mask)}
    return {board,scene,svg:scene.querySelector('svg'),mask};
  }

  function resetAdvanced(){if(typeof window.rpgVttSetTool==='function')window.rpgVttSetTool('move');else document.querySelector('#rpgVttTools .rpgVttTool.active')?.click()}

  function renderWalls(){
    const l=layers();if(!l)return;l.svg.innerHTML='';
    V.walls.forEach(w=>{
      const line=document.createElementNS('http://www.w3.org/2000/svg','line');
      line.classList.add('rpgMapWall');if(master())line.classList.add('master');
      line.setAttribute('x1',n(w.x1));line.setAttribute('y1',n(w.y1));line.setAttribute('x2',n(w.x2));line.setAttribute('y2',n(w.y2));
      line.setAttribute('stroke-width',String(Math.max(.35,n(w.thickness,2)/2)));line.dataset.wallId=w.id;
      if(master())line.addEventListener('click',async e=>{e.stopPropagation();if(confirm('Remover esta parede?'))await removeWall(w.id)});
      l.svg.appendChild(line);
    });
  }

  function playerSources(){
    const st=window.state;if(!st?.user)return [];
    const chars=new Map((st.characters||[]).map(c=>[c.id,c]));const map=new Map(V.sources.map(s=>[s.entity_id,s]));
    return (st.entities||[]).filter(e=>e.floor_id===fid()&&e.character_id&&chars.get(e.character_id)?.player_id===st.user.id).map(e=>{
      const src=map.get(e.id);if(src&&src.enabled===false)return null;return{entity:e,rangeUnits:src?n(src.range_units,60):60}
    }).filter(Boolean);
  }

  const cross=(a,b,c,d)=>a*d-b*c;
  function hit(sx,sy,dx,dy,w,max){
    const wx=n(w.x2)-n(w.x1),wy=n(w.y2)-n(w.y1),den=cross(dx,dy,wx,wy);if(Math.abs(den)<1e-9)return max;
    const qx=n(w.x1)-sx,qy=n(w.y1)-sy,t=cross(qx,qy,wx,wy)/den,u=cross(qx,qy,dx,dy)/den;
    return t>=0&&t<=max&&u>=0&&u<=1?t:max;
  }

  function polygon(src,radius,rect){
    const walls=V.walls.filter(w=>w.blocks_vision!==false).map(w=>({
      ...w,
      x1:n(w.x1)/100*rect.width,y1:n(w.y1)/100*rect.height,
      x2:n(w.x2)/100*rect.width,y2:n(w.y2)/100*rect.height
    }));
    const angles=[];for(let a=0;a<Math.PI*2;a+=Math.PI/30)angles.push(a);
    walls.forEach(w=>[{x:w.x1,y:w.y1},{x:w.x2,y:w.y2}].forEach(p=>{
      const a=Math.atan2(p.y-src.y,p.x-src.x);angles.push(a-.00025,a,a+.00025)
    }));
    angles.sort((a,b)=>a-b);
    return angles.map(a=>{
      const dx=Math.cos(a),dy=Math.sin(a);let t=radius;
      walls.forEach(w=>{t=Math.min(t,hit(src.x,src.y,dx,dy,w,radius))});
      return [src.x+dx*t,src.y+dy*t]
    });
  }

  function distancePercent(ax,ay,bx,by){
    const rect=document.getElementById('board')?.getBoundingClientRect();
    if(!rect)return Math.hypot((bx-ax)/100,(by-ay)/100);
    return Math.hypot((bx-ax)/100*rect.width,(by-ay)/100*rect.height);
  }

  function segmentBlocked(ax,ay,bx,by){
    const rdx=bx-ax,rdy=by-ay;
    const crossFn=(a,b,c,d)=>a*d-b*c;
    for(const w of V.walls.filter(w=>w.blocks_vision!==false)){
      const sdx=n(w.x2)-n(w.x1),sdy=n(w.y2)-n(w.y1),den=crossFn(rdx,rdy,sdx,sdy);
      if(Math.abs(den)<1e-9) continue;
      const qx=n(w.x1)-ax,qy=n(w.y1)-ay;
      const t=crossFn(qx,qy,sdx,sdy)/den;
      const u=crossFn(qx,qy,rdx,rdy)/den;
      if(t>0.0001&&t<0.9999&&u>=0&&u<=1) return true;
    }
    return false;
  }

  function insideFog(x,y){
    if(!V.settings?.fog_enabled) return false;
    return (V.fog||[]).some(r=>!r.revealed&&x>=n(r.x)&&x<=n(r.x)+n(r.width)&&y>=n(r.y)&&y<=n(r.y)+n(r.height));
  }

  function exploredKey(x,y){return Number(x)+':'+Number(y)}
  function hasExplored(x,y){return V.explored.some(c=>Number(c.cell_x)===Number(x)&&Number(c.cell_y)===Number(y))}
  function cellSize(){return Math.max(.5,n(V.settings?.grid_size,5))}
  async function revealVisibleCells(){
    if(master()||!V.settings?.fog_enabled||!V.settings?.vision_enabled||V.revealBusy||!cid()||!fid())return;
    const api=sb(),st=window.state;if(!api||!st?.user)return;
    V.revealBusy=true;
    try{
      const step=cellSize(),cols=Math.ceil(100/step),rows=Math.ceil(100/step),known=new Set(V.explored.map(c=>exploredKey(c.cell_x,c.cell_y))),fresh=[];
      for(let cy=0;cy<rows;cy++){
        for(let cx=0;cx<cols;cx++){
          if(known.has(exploredKey(cx,cy)))continue;
          const x=Math.min(99.999,(cx+.5)*step),y=Math.min(99.999,(cy+.5)*step);
          if(pointVisible(x,y)){
            fresh.push({id:crypto.randomUUID(),campaign_id:cid(),floor_id:fid(),user_id:st.user.id,cell_x:cx,cell_y:cy});
            known.add(exploredKey(cx,cy));
          }
        }
      }
      if(!fresh.length)return;
      const q=await api.from('fog_exploration_cells').upsert(fresh,{onConflict:'campaign_id,floor_id,user_id,cell_x,cell_y'}).select('*');
      if(q.error){console.warn('[RPG HUB] Falha ao persistir exploração:',q.error);return}
      V.explored=[...V.explored,...(q.data||fresh)];
      queue();
    }finally{V.revealBusy=false}
  }

  function pointVisible(x,y){
    if(master()) return true;
    x=clamp(Number(x)||0);y=clamp(Number(y)||0);
    if(insideFog(x,y)) return false;
    if(V.settings?.vision_enabled!==true) return true;
    const st=window.state;
    const chars=new Map((st?.characters||[]).map(c=>[c.id,c]));
    const sources=(st?.entities||[]).filter(e=>e.floor_id===fid()&&e.character_id&&chars.get(e.character_id)?.player_id===st?.user?.id);
    if(!sources.length) return false;
    const unit=Math.max(.1,n(V.settings?.unit_per_cell,5)),grid=Math.max(.1,n(V.settings?.grid_size,5));
    return sources.some(src=>{
      if(insideFog(n(src.x,50),n(src.y,50))) return false;
      const rect=document.getElementById('board')?.getBoundingClientRect();
      const dx=rect?(x-n(src.x,50))/100*rect.width:(x-n(src.x,50))/100;
      const dy=rect?(y-n(src.y,50))/100*rect.height:(y-n(src.y,50))/100;
      const cellPx=Math.max(8,rect?rect.width*grid/100:grid);
      const distanceUnits=Math.hypot(dx,dy)/cellPx*unit;
      const cfg=V.sources.find(s=>s.entity_id===src.id);
      const range=cfg?n(cfg.range_units,60):60;
      if(distanceUnits>range) return false;
      return !segmentBlocked(n(src.x,50),n(src.y,50),x,y);
    });
  }

  function roomVisible(x,y,w,h,rotation=0){
    if(master()) return true;
    const cx=n(x)+n(w)/2,cy=n(y)+n(h)/2,rad=Number(rotation||0)*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
    const local=[[0,0],[-n(w)/2+1,-n(h)/2+1],[n(w)/2-1,-n(h)/2+1],[-n(w)/2+1,n(h)/2-1],[n(w)/2-1,n(h)/2-1]];
    return local.some(([lx,ly])=>pointVisible(cx+lx*cos-ly*sin,cy+lx*sin+ly*cos));
  }

  function combatInfo(){
    const e=V.combat.encounter,rows=[...(V.combat.combatants||[])].sort((a,b)=>n(a.turn_order)-n(b.turn_order));
    const idx=Math.max(0,Math.min(n(e?.current_index),Math.max(rows.length-1,0)));return{encounter:e,rows,active:rows[idx]||null}
  }

  function entityCombat(c){
    if(!c)return null;return(window.state?.entities||[]).find(e=>(c.character_id&&e.character_id===c.character_id)||(c.npc_id&&e.npc_id===c.npc_id))||null
  }

  function renderCombatDecor(){
    const board=$('board');if(!board)return;board.querySelectorAll('.rpgVisionCombatBadge,.rpgVisionSourceDot,.rpgVisionRangeRing').forEach(e=>e.remove());
    if(master())return;const rect=board.getBoundingClientRect();
    playerSources().forEach(src=>{
      const p=src.entity;
      const cells=n(src.rangeUnits,60)/Math.max(.1,n(V.settings?.unit_per_cell,5));
      const cellPx=Math.max(8,rect.width*Math.max(.1,n(V.settings?.grid_size,5))/100);
      const diameterPx=Math.max(8,cells*cellPx*2);
      const dot=document.createElement('div');dot.className='rpgVisionSourceDot';dot.style.left=n(p.x,50)+'%';dot.style.top=n(p.y,50)+'%';board.appendChild(dot);
      const ring=document.createElement('div');ring.className='rpgVisionRangeRing';ring.style.left=n(p.x,50)+'%';ring.style.top=n(p.y,50)+'%';ring.style.width=(diameterPx/rect.width*100)+'%';ring.style.height=(diameterPx/rect.height*100)+'%';board.appendChild(ring);
    });
    const c=combatInfo(),ae=entityCombat(c.active),owned=playerSources().some(s=>s.entity.id===ae?.id);if(ae&&owned&&ae.floor_id===fid()){const b=document.createElement('div');b.className='rpgVisionCombatBadge';b.textContent='TURNO · R'+n(c.encounter?.round,1);b.style.left=n(ae.x,50)+'%';b.style.top=(n(ae.y,50)-9)+'%';board.appendChild(b)}
  }

  function draw(){
    const l=layers();if(!l)return;renderWalls();renderCombatDecor();
    const rect=l.board.getBoundingClientRect(),dpr=Math.max(1,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(l.mask.width!==w||l.mask.height!==h){l.mask.width=w;l.mask.height=h}
    const ctx=l.mask.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    if(master())return;
    const enabled=V.settings?.vision_enabled===true;
    if(enabled){
      ctx.fillStyle='rgba(2,4,7,.96)';ctx.globalCompositeOperation='source-over';ctx.fillRect(0,0,rect.width,rect.height);ctx.globalCompositeOperation='destination-out';
      playerSources().forEach(src=>{
        const px=n(src.entity.x,50)*rect.width/100,py=n(src.entity.y,50)*rect.height/100,cell=rect.width*Math.max(.1,n(V.settings?.grid_size,5))/100;
        const radius=Math.max(0,n(src.rangeUnits,60)/Math.max(.1,n(V.settings?.unit_per_cell,5))*cell),pts=polygon({x:px,y:py},radius,rect);if(!pts.length)return;
        ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();
        ctx.beginPath();ctx.arc(px,py,radius,0,Math.PI*2);ctx.fill();
      });ctx.globalCompositeOperation='source-over';
    }
    if(V.settings?.fog_enabled){
      if(V.explored.length){
        const step=cellSize();
        ctx.globalCompositeOperation='destination-out';
        ctx.fillStyle='rgba(0,0,0,.34)';
        V.explored.forEach(c=>{
          ctx.fillRect(rect.width*n(c.cell_x*step)/100,rect.height*n(c.cell_y*step)/100,rect.width*step/100,rect.height*step/100);
        });
        ctx.globalCompositeOperation='source-over';
      }
      (V.fog||[]).forEach(r=>{
        if(!r.revealed){
          ctx.fillStyle='rgba(3,5,8,.96)';
          ctx.fillRect(rect.width*n(r.x)/100,rect.height*n(r.y)/100,rect.width*n(r.width)/100,rect.height*n(r.height)/100);
        }
      });
    }
    const hint=$('rpgVisionPlayerHint');if(enabled&&!playerSources().length){if(!hint){const x=document.createElement('div');x.id='rpgVisionPlayerHint';x.className='rpgVisionPlayerHint';x.textContent='Nenhum personagem com visão neste andar.';l.board.appendChild(x)}}else hint?.remove()
  }

  function queue(){if(V.queued)return;V.queued=true;requestAnimationFrame(()=>{V.queued=false;draw()})}

  async function load(){
    const c=cid(),f=fid(),api=sb();if(!c||!f||!api)return;
    const defaults={grid_enabled:true,snap_enabled:true,grid_size:5,unit_per_cell:5,fog_enabled:false,vision_enabled:false};
    // Não reaproveitar a visão do andar/campanha anterior enquanto o novo estado está carregando.
    V.settings=defaults;V.walls=[];V.sources=[];V.fog=[];V.explored=[];V.combat.encounter=null;V.combat.combatants=[];
    try{
      const [a,b,d,g,h,e]=await Promise.all([
        api.from('map_settings').select('*').eq('campaign_id',c).eq('floor_id',f).maybeSingle(),
        api.from('map_walls').select('*').eq('campaign_id',c).eq('floor_id',f).order('created_at'),
        api.from('vision_sources').select('*').eq('campaign_id',c).eq('floor_id',f).order('updated_at',{ascending:false}),
        api.from('fog_regions').select('*').eq('campaign_id',c).eq('floor_id',f).order('created_at'),
        !master()?api.from('fog_exploration_cells').select('id,cell_x,cell_y,last_seen_at').eq('campaign_id',c).eq('floor_id',f).eq('user_id',window.state.user.id).order('cell_y').order('cell_x'):Promise.resolve({data:[]}),
        session()?api.from('combat_encounters').select('id,current_index,round,status').eq('campaign_id',c).eq('session_id',session().id).order('created_at',{ascending:false}).limit(1):Promise.resolve({data:[]})
      ]);
      if(a.error)console.warn('[RPG HUB] Configuração de visão indisponível:',a.error);
      if(b.error)console.warn('[RPG HUB] Paredes indisponíveis:',b.error);
      if(d.error)console.warn('[RPG HUB] Fontes de visão indisponíveis:',d.error);
      if(g.error)console.warn('[RPG HUB] Névoa indisponível:',g.error);
      if(h?.error)console.warn('[RPG HUB] Exploração persistente indisponível:',h.error);
      V.settings=a.data||defaults;
      V.walls=b.error?[]:(b.data||[]);V.sources=d.error?[]:(d.data||[]);V.fog=g.error?[]:(g.data||[]);V.explored=h?.error?[]:(h?.data||[]);V.combat.encounter=e.data?.[0]||null;
      if(V.combat.encounter){const q=await api.from('combatants').select('id,character_id,npc_id,name,conditions,turn_order').eq('encounter_id',V.combat.encounter.id).order('turn_order');if(!q.error)V.combat.combatants=q.data||[]}
    }catch(error){
      console.warn('[RPG HUB] Falha ao carregar camada de visão:',error);
    }
    V.campaignId=c;V.floorId=f;V.lastKey=c+':'+f+':'+(session()?.id||'');
    window.rpgVttVisibilityReady=true;
    queue();
    setTimeout(()=>revealVisibleCells().catch(err=>console.warn('[RPG HUB] exploração:',err)),120);
    setTimeout(()=>window.renderTable?.(),0);
  }
  async function saveWall(s,e){
    const dx=e.x-s.x,dy=e.y-s.y;if(Math.hypot(dx,dy)<1)return;
    const q=await sb().from('map_walls').insert({campaign_id:cid(),floor_id:fid(),x1:clamp(s.x),y1:clamp(s.y),x2:clamp(e.x),y2:clamp(e.y),thickness:2,blocks_vision:true,created_by:window.state.user.id}).select().maybeSingle();
    if(q.error)return window.toast?.(q.error.message||'Não foi possível salvar a parede.','error');if(!q.data)return window.toast?.('A parede foi enviada, mas o servidor não confirmou o registro.','error');V.walls.push(q.data);queue();window.setSave?.('Parede salva')
  }
  async function removeWall(id){
    const q=await sb().from('map_walls').delete().eq('id',id);if(q.error)return window.toast?.(q.error.message||'Não foi possível remover a parede.','error');
    V.walls=V.walls.filter(w=>w.id!==id);queue();window.setSave?.('Parede removida')
  }

  const down=e=>{
    if(V.activeTool!=='wall'||!master()||e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();
    const s=point(e),line=document.createElementNS('http://www.w3.org/2000/svg','line');line.classList.add('rpgMapWall','preview');line.setAttribute('x1',s.x);line.setAttribute('y1',s.y);line.setAttribute('x2',s.x);line.setAttribute('y2',s.y);layers().svg.appendChild(line);V.drag={s,line,id:e.pointerId};$('board').setPointerCapture?.(e.pointerId)
  };
  const move=e=>{if(V.activeTool!=='wall'||!V.drag)return;const p=point(e);V.drag.line.setAttribute('x2',p.x);V.drag.line.setAttribute('y2',p.y)};
  const up=async e=>{if(V.activeTool!=='wall'||!V.drag)return;const d=V.drag,p=point(e);d.line.remove();V.drag=null;await saveWall(d.s,p)};

  async function setVisionEnabled(v){
    if(!master())return;const q=await sb().from('map_settings').upsert({...V.settings,campaign_id:cid(),floor_id:fid(),vision_enabled:!!v,updated_by:window.state.user.id},{onConflict:'campaign_id,floor_id'}).select().maybeSingle();
    if(q.error)return window.toast?.(q.error.message||'Não foi possível salvar a configuração.','error');if(!q.data)return window.toast?.('A configuração foi enviada, mas o servidor não confirmou o registro.','error');V.settings=q.data;queue()
  }

  function modal(){
    if(!master())return;const ents=(window.state?.entities||[]).filter(e=>e.floor_id===fid()),existing=new Map(V.sources.map(s=>[s.entity_id,s]));
    const opts=ents.map(e=>{const s=existing.get(e.id);return'<option value="'+esc(e.id)+'">'+esc(e.display_name)+' · '+esc(e.entity_kind)+'</option>'}).join('')||'<option value="">Nenhuma entidade neste andar</option>';
    window.showModal?.('<div class="rpgVisionModal"><div class="rpgVisionModalHeader"><div><div class="eyebrow">VISÃO TÁTICA</div><h3>Visão por personagem / token</h3><p>Defina quem enxerga, quanto enxerga e quando o combate afeta o mapa.</p></div><button class="closeButton" data-close>×</button></div><div class="rpgVisionModeCard"><label><input id="rpgVisionEnabled" type="checkbox" '+(V.settings?.vision_enabled!==false?'checked':'')+'> Visão real por token habilitada</label><small>O jogador verá somente a união das áreas de visão dos personagens que pertencem a ele; paredes cortam a linha de visão.</small></div><div class="rpgVisionEntityRow"><label>Token<select id="rpgVisionEntity">'+opts+'</select></label><label>Alcance<input id="rpgVisionRange" type="number" min="0" max="10000" step="5" value="60"></label><button id="rpgVisionSave" class="primarySmall">Salvar token</button></div><div id="rpgVisionEntityMeta" class="rpgVisionEntityMeta rpgVisionMetaWrap">Selecione um token.</div><div class="modalActions"><button id="rpgVisionClear" class="rpgVisionDanger">Remover configuração</button><button class="softButton" data-close>Fechar</button></div></div>',true);
    const sel=$('rpgVisionEntity'),range=$('rpgVisionRange'),meta=$('rpgVisionEntityMeta'),enabled=$('rpgVisionEnabled');
    const sync=()=>{const e=ents.find(x=>x.id===sel?.value),s=existing.get(sel?.value);if(!e){if(meta)meta.textContent='Nenhum token disponível neste andar.';return}range.value=String(s?n(s.range_units,60):60);meta.textContent=(e.character_id?'Personagem vinculado ao jogador.':e.npc_id?'NPC / monstro.':'Entidade manual.')+' · sem configuração salva, o padrão é 60 unidades.'};
    sel?.addEventListener('change',sync);sync();enabled?.addEventListener('change',()=>setVisionEnabled(enabled.checked));
    $('rpgVisionSave')?.addEventListener('click',async()=>{const e=ents.find(x=>x.id===sel.value);if(!e)return;const old=existing.get(e.id),payload={campaign_id:cid(),floor_id:fid(),entity_id:e.id,enabled:true,range_units:Math.max(0,Number(range.value||60)),updated_by:window.state.user.id,created_by:old?.created_by||window.state.user.id};const q=await sb().from('vision_sources').upsert(payload,{onConflict:'campaign_id,floor_id,entity_id'}).select().maybeSingle();if(q.error)return window.toast?.(q.error.message||'Não foi possível salvar a visão.','error');if(!q.data)return window.toast?.('A visão foi enviada, mas o servidor não confirmou o registro.','error');existing.set(e.id,q.data);V.sources=[...existing.values()];queue();window.toast?.('Visão de '+e.display_name+' salva');sync()});
    $('rpgVisionClear')?.addEventListener('click',async()=>{const e=ents.find(x=>x.id===sel.value),old=existing.get(e?.id);if(!old)return window.toast?.('Esse token já usa o padrão.');const q=await sb().from('vision_sources').delete().eq('id',old.id);if(q.error)return window.toast?.(q.error.message||'Não foi possível remover.','error');existing.delete(e.id);V.sources=[...existing.values()];queue();sync();window.toast?.('Configuração removida; volta ao padrão de 60 unidades.')});
  }

  function toolbar(){
    if(!master())return;const host=$('#rpgVttTools')?.parentElement;if(!host)return;let row=$('#rpgVisionTools');
    if(!row){row=document.createElement('div');row.id='rpgVisionTools';row.className='rpgVisionToolRow';row.innerHTML='<button type="button" class="rpgVisionTool" data-rpg-wall>▱ Paredes</button><button type="button" class="rpgVisionTool" data-rpg-vision>◉ Visão</button>';host.appendChild(row);
      row.querySelector('[data-rpg-wall]').addEventListener('click',()=>{V.activeTool=V.activeTool==='wall'?'none':'wall';if(V.activeTool==='wall')resetAdvanced();row.querySelector('[data-rpg-wall]').classList.toggle('active',V.activeTool==='wall');$('board').style.cursor=V.activeTool==='wall'?'crosshair':'default'});
      row.querySelector('[data-rpg-vision]').addEventListener('click',modal);
    }
  }

  async function realtime(){
    const c=cid();if(!c||!sb())return;if(V.channel&&V.campaignId===c)return;if(V.channel)await sb().removeChannel(V.channel).catch(()=>{});
    const ch=sb().channel('rpg-hub-real-vision-'+c,{config:{private:true}}),reload=()=>{load();queue()};
    ch.on('postgres_changes',{event:'*',schema:'public',table:'map_walls',filter:'campaign_id=eq.'+c},reload);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'vision_sources',filter:'campaign_id=eq.'+c},reload);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'map_settings',filter:'campaign_id=eq.'+c},reload);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'fog_regions',filter:'campaign_id=eq.'+c},reload);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'world_entities',filter:'campaign_id=eq.'+c},queue);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'combat_encounters',filter:'campaign_id=eq.'+c},reload);
    ch.on('postgres_changes',{event:'*',schema:'public',table:'combatants'},reload);
    ch.subscribe((status,error)=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('RPG HUB vision realtime:',status,error)});V.channel=ch
  }

  function observe(){
    const t=$('tokenLayer');if(t&&!V.observer){V.observer=new MutationObserver(queue);V.observer.observe(t,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class']})}
    const b=$('board');if(b&&!V.resizeObserver){V.resizeObserver=new ResizeObserver(queue);V.resizeObserver.observe(b)}
  }

  function tick(){
    toolbar();observe();realtime();queue();
    const key=cid()+':'+fid()+':'+(session()?.id||'');
    if(key!==V.lastKey&&cid()&&fid())load();
    else if(!master()&&V.settings?.fog_enabled&&V.settings?.vision_enabled)revealVisibleCells().catch(()=>{});
  }

  function init(){
    if(V.initialized)return;inject();V.initialized=true;const b=$('board');
    if(b){b.addEventListener('pointerdown',down,true);b.addEventListener('pointermove',move,true);b.addEventListener('pointerup',up,true);b.addEventListener('pointercancel',up,true)}
    setInterval(tick,2500);tick();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.rpgVttPointVisible=pointVisible;
  window.rpgVttRoomVisible=roomVisible;
  window.rpgVttVisibilityReady=false;
  window.rpgVttVisionRefresh=queue;
})();