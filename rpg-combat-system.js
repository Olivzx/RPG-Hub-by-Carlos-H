/* RPG HUB — synchronized combat tracker */
(() => {
  'use strict';

  const cs = { initialized:false, campaignId:null, sessionId:null, encounter:null, combatants:[], actions:[], channel:null, key:null, loading:false };
  const $ = id => document.getElementById(id);
  const esc = v => typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const cid = () => state?.campaign?.id || null;
  const activeSession = () => typeof currentSession === 'function' ? currentSession() : null;
  const isMaster = () => typeof canEdit === 'function' && canEdit();

  function rows() {
    return [...cs.combatants].sort((a,b) =>
      Number(b.initiative||0)-Number(a.initiative||0) ||
      Number(a.turn_order||0)-Number(b.turn_order||0)
    );
  }

  async function readRow(table,id,context='registro') {
    const q=await sb.from(table).select('*').eq('id',id).maybeSingle();
    if(q.error)throw q.error;
    if(!q.data)throw new Error('Não foi possível confirmar '+context+' no servidor.');
    return q.data;
  }


  function active() {
    const r=rows(), i=Math.max(0,Math.min(Number(cs.encounter?.current_index||0),Math.max(r.length-1,0)));
    return r[i] || null;
  }
  function hpPct(r) {
    const max=Number(r?.hp_max), cur=Number(r?.hp_current);
    return Number.isFinite(max)&&max>0&&Number.isFinite(cur) ? Math.max(0,Math.min(100,cur/max*100)) : null;
  }
  function tokenFor(r) {
    if(!r) return null;
    return (state.entities||[]).find(e => (r.character_id&&e.character_id===r.character_id)||(r.npc_id&&e.npc_id===r.npc_id))||null;
  }
  function sourceFor(r){
    if(!r)return null;
    if(r.character_id)return (state.characters||[]).find(x=>x.id===r.character_id)||null;
    if(r.npc_id)return (state.npcs||[]).find(x=>x.id===r.npc_id)||null;
    return null;
  }
  function defenseFor(r){
    const s=sourceFor(r);
    return Number(r?.armor_class??r?.defense??s?.armor_class??s?.data?.armor_class??s?.data?.ac??10);
  }
  function isDown(r){ return Number.isFinite(Number(r?.hp_current)) && Number(r.hp_current)<=0; }
  function focusToken(r){
    const token=tokenFor(r); if(!token)return toast('Este combatente não está na mesa.','error');
    state.floor=token.floor_id||state.floor; state.selected={type:'entity',id:token.id}; state.view='table';
    renderAll();
  }
  function highlight() {
    const activeId=tokenFor(active())?.id||null;
    document.querySelectorAll('#tokenLayer .tokenBig').forEach(e=>{
      const combatant=cs.combatants.find(r=>tokenFor(r)?.id===e.dataset.entityId);
      e.classList.toggle('rpgCombatActiveToken',!!activeId&&e.dataset.entityId===activeId);
      e.classList.toggle('rpgCombatTokenDown',!!combatant&&isDown(combatant));
    });
  }

  function styles() {
    if($('rpgCombatStyles')) return;
    const s=document.createElement('style');
    s.id='rpgCombatStyles';
    s.textContent=".rpgCombatView{padding-bottom:30px}.rpgCombatHero,.rpgCombatList,.rpgCombatSide{border:1px solid #29313d;background:#0d131a;border-radius:16px}.rpgCombatHero{padding:18px;margin-bottom:14px;background:radial-gradient(circle at 80% 10%,rgba(148,135,255,.13),transparent 35%),linear-gradient(145deg,#111722,#0b1016)}.rpgCombatHeroTop{display:flex;justify-content:space-between;gap:16px}.rpgCombatHero h2{margin:6px 0;color:#eef1f6;font-size:23px}.rpgCombatHero p{margin:0;color:#737e90;font-size:10px;line-height:1.55}.rpgCombatLive{display:inline-flex;align-items:center;gap:6px;height:max-content;padding:7px 9px;border:1px solid #31513f;border-radius:999px;color:#8ee1b6;background:#0d1a14;font-size:8px;letter-spacing:.08em}.rpgCombatLive i{width:6px;height:6px;border-radius:50%;background:#6ee7b7}.rpgCombatControls{display:flex;flex-wrap:wrap;gap:7px;margin-top:14px}.rpgCombatControls button{border:1px solid #2a313d;background:#111720;color:#aeb6c4;border-radius:10px;padding:9px 11px;cursor:pointer;font-size:9px}.rpgCombatControls .primary{background:linear-gradient(135deg,var(--accent,#9487ff),var(--accent2,#6b5be7));color:#fff;border-color:transparent;font-weight:750}.rpgCombatBoard{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:14px}.rpgCombatList{overflow:hidden}.rpgCombatListHead{display:flex;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #252d39}.rpgCombatListHead b{color:#e0e4eb;font-size:11px}.rpgCombatListHead span{color:#6d7788;font-size:8px}.rpgCombatant{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;padding:12px 15px;border-bottom:1px solid rgba(255,255,255,.045)}.rpgCombatant.active{background:rgba(148,135,255,.08);box-shadow:inset 3px 0 0 var(--accent,#9487ff)}.rpgCombatInitiative{width:38px;height:38px;display:grid;place-items:center;border:1px solid #343b49;border-radius:11px;background:#131a23;color:#ddd7ff;font-weight:800}.rpgCombatantMain{min-width:0}.rpgCombatantMain header{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.rpgCombatantMain header b{color:#e2e6ed;font-size:11px}.rpgCombatKind{color:#777f8e;font-size:7px;letter-spacing:.08em}.rpgCombatantMain p{margin:4px 0 7px;color:#626d7e;font-size:8px}.rpgCombatHp{height:5px;max-width:360px;overflow:hidden;background:#1a2029;border-radius:99px}.rpgCombatHp span{display:block;height:100%;background:linear-gradient(90deg,#6ee7b7,#9487ff)}.rpgCombatHpMeta{display:flex;justify-content:space-between;max-width:360px;margin-top:4px;color:#737d8e;font-size:7px}.rpgCombatConditions{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}.rpgCombatCondition{padding:4px 6px;border:1px solid #363c48;border-radius:999px;color:#9ca5b4;font-size:7px}.rpgCombatActions{display:flex;justify-content:flex-end;align-items:start;gap:5px;flex-wrap:wrap}.rpgCombatActions button,.rpgCombatQuickHp button{border:1px solid #29313e;background:#111720;color:#9da6b4;border-radius:8px;padding:7px 8px;cursor:pointer;font-size:8px}.rpgCombatActions .danger{color:#ff9eaa;border-color:#4b2731}.rpgCombatDown{opacity:.56;filter:grayscale(.55)}.rpgCombatDown .rpgCombatInitiative{color:#ff9eaa;border-color:#4b2731}.rpgCombatDownBadge{display:inline-flex;padding:3px 6px;border:1px solid #522933;border-radius:999px;color:#ff9eaa;background:#21131a;font-size:7px;letter-spacing:.06em}.rpgCombatTokenDown{opacity:.48;filter:grayscale(.7) drop-shadow(0 0 8px rgba(255,110,130,.35))}.rpgCombatQuickHp{display:flex;gap:4px;margin-top:7px}.rpgCombatSide{padding:16px}.rpgCombatSide h3{margin:0;color:#e9ecf2;font-size:12px}.rpgCombatSide p{margin:5px 0 13px;color:#697486;font-size:8px;line-height:1.5}.rpgCombatStatGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.rpgCombatStat{padding:10px;border:1px solid #29323e;border-radius:11px;background:#111820}.rpgCombatStat span{display:block;color:#687384;font-size:7px}.rpgCombatStat b{display:block;margin-top:5px;color:#e3e6ec;font-size:18px}.rpgCombatTurnCard{margin-top:8px;padding:12px;border:1px solid #383168;border-radius:12px;background:#17152a}.rpgCombatTurnCard span{color:#8f87cc;font-size:7px;letter-spacing:.1em}.rpgCombatTurnCard b{display:block;margin-top:5px;color:#e6e2ff;font-size:17px}.rpgCombatTurnCard small{display:block;margin-top:4px;color:#77728f;font-size:7px}.rpgCombatActionHistory{margin-top:10px;border:1px solid #29323e;border-radius:12px;background:#0f151c;overflow:hidden}.rpgCombatHistoryHead{display:flex;justify-content:space-between;padding:10px 11px;border-bottom:1px solid #252d39}.rpgCombatHistoryHead b{color:#d9dde5;font-size:9px}.rpgCombatHistoryHead span{color:#6e7888;font-size:7px}.rpgCombatHistoryItem{padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.04)}.rpgCombatHistoryItem:last-child{border-bottom:0}.rpgCombatHistoryItem b{display:block;color:#c8c2ff;font-size:8px}.rpgCombatHistoryItem span{display:block;margin-top:2px;color:#8d96a5;font-size:7px}.rpgCombatHistoryItem small{display:block;margin-top:2px;color:#677181;font-size:7px}.rpgCombatEmpty{padding:38px 20px;text-align:center;color:#687284;font-size:9px;line-height:1.6}.rpgCombatReadonly{padding:10px;border:1px solid #29313d;border-radius:10px;color:#707b8c;background:#10161e;font-size:8px}.rpgCombatModalList{display:grid;gap:8px;max-height:55vh;overflow:auto}.rpgCombatModalItem{display:flex;justify-content:space-between;gap:12px;padding:10px;border:1px solid #29313d;border-radius:11px;background:#0f151c}.rpgCombatModalItem b{color:#dfe4eb;font-size:10px}.rpgCombatModalItem small{display:block;margin-top:3px;color:#6c7686;font-size:7px}.rpgCombatActiveToken{z-index:40!important;filter:drop-shadow(0 0 10px rgba(148,135,255,.75));animation:rpgCombatTokenPulse 1.35s ease-in-out infinite}@keyframes rpgCombatTokenPulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.055)}}@media(max-width:950px){.rpgCombatBoard{grid-template-columns:1fr}.rpgCombatSide{order:-1}}@media(max-width:700px){.rpgCombatHeroTop{flex-direction:column}.rpgCombatant{grid-template-columns:32px minmax(0,1fr)}.rpgCombatInitiative{width:32px;height:32px}.rpgCombatActions{grid-column:2;justify-content:flex-start}}@media(prefers-reduced-motion:reduce){.rpgCombatActiveToken{animation:none}}";
    document.head.appendChild(s);
  }

  function mountUI() {
    const nav=$('sideNav'), workspace=document.querySelector('.workspace'), more=document.querySelector('.mobileMoreGrid');
    if(!nav||!workspace) return;
    let b=nav.querySelector('[data-view="combat"]');
    if(!b){
      b=document.createElement('button');b.type='button';b.dataset.view='combat';b.id='rpgCombatNav';b.innerHTML='⚔ <span>Combate</span>';
      nav.appendChild(b);b.onclick=()=>{state.view='combat';renderView();render();loadCombat()};
    }
    if(more&&!more.querySelector('[data-mobile-view="combat"]')){
      const mb=document.createElement('button');mb.type='button';mb.dataset.mobileView='combat';mb.innerHTML='<span>⚔</span><b>Combate</b>';mb.onclick=()=>{state.view='combat';renderView();render();loadCombat()};more.appendChild(mb);
    }
    let v=$('viewCombat');
    if(!v){v=document.createElement('section');v.id='viewCombat';v.className='view rpgCombatView';v.innerHTML='<div id="rpgCombatMount"></div>';workspace.appendChild(v);}
  }

  function render() {
    const mount=$('rpgCombatMount');if(!mount)return;
    const s=activeSession(), e=cs.encounter, r=rows(), a=active();
    if(!s){mount.innerHTML='<div class="rpgCombatHero"><div class="eyebrow">RASTREADOR DE COMBATE</div><h2>Nenhuma sessão ativa</h2><p>Crie uma sessão antes de iniciar um combate.</p><div class="rpgCombatControls"><button class="primary" data-go-sessions>Gerenciar sessões →</button></div></div>';return;}
    if(!e){mount.innerHTML='<div class="rpgCombatHero"><div class="rpgCombatHeroTop"><div><div class="eyebrow">SESSÃO #'+esc(s.session_number)+'</div><h2>Combate da sessão</h2><p>Iniciativa, HP, condições e turno compartilhados em tempo real.</p></div><span class="rpgCombatLive"><i></i>PRONTO</span></div><div class="rpgCombatControls">'+(isMaster()?'<button class="primary" data-start-combat>⚔ Iniciar combate</button>':'<div class="rpgCombatReadonly">O mestre ainda não iniciou um combate nesta sessão.</div>')+'<button data-go-table>Voltar à mesa</button></div></div>';return;}
    mount.innerHTML='<section class="rpgCombatHero"><div class="rpgCombatHeroTop"><div><div class="eyebrow">SESSÃO #'+esc(s.session_number)+' · COMBATE</div><h2>Rodada '+Number(e.round||1)+'</h2><p>'+(e.status==='finished'?'Combate finalizado.':'O mestre controla o próximo turno.')+'</p></div><span class="rpgCombatLive"><i></i>'+(e.status==='finished'?'FINALIZADO':'EM COMBATE')+'</span></div><div class="rpgCombatControls">'+(isMaster()&&e.status!=='finished'?'<button class="primary" data-advance>Próximo turno →</button><button data-attack>⚔ Ataque</button><button data-reaction>↩ Reação</button><button data-ability>✦ Habilidade</button><button data-ruleset>⚙ Regras</button><button data-heal>✚ Cura</button><button data-conditions>☍ Condições</button><button data-add>+ Adicionar combatente</button><button data-end>Encerrar combate</button><button data-manage>Gerenciar</button>':'')+'<button data-go-table>Voltar à mesa</button></div></section><div class="rpgCombatBoard"><section class="rpgCombatList"><div class="rpgCombatListHead"><b>Ordem de iniciativa</b><span>'+r.length+' combatente(s)</span></div>'+(r.length?r.map((x)=>{const pct=hpPct(x),ac=a?.id===x.id&&e.status!=='finished',down=isDown(x),hp=x.hp_current==null?'HP não definido':x.hp_max==null?String(x.hp_current):String(x.hp_current)+' / '+String(x.hp_max);const cc=String(x.conditions||'').split(',').map(v=>v.trim()).filter(Boolean);return '<article class="rpgCombatant '+(ac?'active ':'')+(down?'rpgCombatDown':'')+'"><div class="rpgCombatInitiative">'+Number(x.initiative||0)+'</div><div class="rpgCombatantMain"><header><b>'+esc(x.name)+'</b><span class="rpgCombatKind">'+esc(x.kind.toUpperCase())+(ac?' · TURNO ATUAL':'')+'</span>'+(down?'<span class="rpgCombatDownBadge">KO / FORA DE COMBATE</span>':'')+'</header><p>'+(x.character_id?'Personagem da campanha':x.npc_id?'NPC/monstro cadastrado':'Combatente manual')+' · CA '+defenseFor(x)+'</p>'+(pct==null?'':'<div class="rpgCombatHp"><span style="width:'+pct.toFixed(0)+'%"></span></div><div class="rpgCombatHpMeta"><span>'+esc(hp)+'</span><span>'+pct.toFixed(0)+'%</span></div>')+(cc.length?'<div class="rpgCombatConditions">'+cc.map(v=>'<span class="rpgCombatCondition">'+esc(v)+'</span>').join('')+'</div>':'')+(isMaster()&&e.status!=='finished'?'<div class="rpgCombatQuickHp"><button data-hp="'+x.id+'" data-delta="-5">−5 HP</button><button data-hp="'+x.id+'" data-delta="-1">−1</button><button data-hp="'+x.id+'" data-delta="1">+1</button><button data-hp="'+x.id+'" data-delta="5">+5 HP</button><button data-focus="'+x.id+'">Mapa</button></div>':'')+'</div><div class="rpgCombatActions">'+(isMaster()&&e.status!=='finished'?'<button data-init="'+x.id+'">Iniciativa</button><button data-edit="'+x.id+'">Editar</button><button data-rules="'+x.id+'">Regras</button><button class="danger" data-remove="'+x.id+'">Remover</button>':'')+'</div></article>';}).join(''):'<div class="rpgCombatEmpty">Nenhum combatente adicionado.<br>Adicione personagens, NPCs ou inimigos manuais.</div>')+'</section><aside class="rpgCombatSide"><h3>Estado do combate</h3><p>Rodada, turno, HP, condições e ações ficam salvos no Supabase.</p><div class="rpgCombatStatGrid"><div class="rpgCombatStat"><span>Rodada</span><b>'+Number(e.round||1)+'</b></div><div class="rpgCombatStat"><span>Participantes</span><b>'+r.length+'</b></div></div><div class="rpgCombatTurnCard"><span>TURNO ATUAL</span><b>'+esc(a?.name||'Nenhum')+'</b><small>'+(a?'Iniciativa '+Number(a.initiative||0)+(isDown(a)?' · KO':''):'Adicione um combatente')+'</small></div><div class="rpgCombatActionHistory"><div class="rpgCombatHistoryHead"><b>Últimas ações</b><span>'+cs.actions.length+'</span></div>'+(cs.actions.length?cs.actions.map(x=>'<div class="rpgCombatHistoryItem"><b>'+esc(x.action_name||'Ação')+'</b><span>'+esc(x.attacker_name||'')+(x.target_name?' → '+esc(x.target_name):'')+'</span><small>'+(x.hit===true?'ACERTO':x.hit===false?'ERRO':'')+(x.damage_total!=null?' · '+Number(x.damage_total)+' dano':'')+(x.hp_after!=null?' · HP '+Number(x.hp_after):'')+'</small></div>').join(''):'<div class="rpgCombatEmpty" style="padding:15px 5px">Nenhuma ação registrada ainda.</div>')+'</div></aside></div>';
    highlight();
  }

  async function loadCombat(force=false){
    const c=cid(), s=activeSession(), sid=s?.id||null, key=c+':'+sid;
    if(!c||!sid){cs.encounter=null;cs.combatants=[];cs.actions=[];cs.key=key;render();return;}
    if(!force&&cs.key===key&&cs.encounter!==null)return;
    if(cs.loading)return;
    cs.loading=true;
    try{
      const q=await sb.from('combat_encounters').select('*').eq('campaign_id',c).eq('session_id',sid).order('created_at',{ascending:false}).limit(1);
      if(q.error)throw q.error;
      cs.encounter=q.data?.[0]||null;
      if(cs.encounter){
        const x=await sb.from('combatants').select('*').eq('encounter_id',cs.encounter.id).order('turn_order');
        if(x.error)throw x.error;
        cs.combatants=x.data||[];
        const a=await sb.from('combat_actions').select('*').eq('encounter_id',cs.encounter.id).order('created_at',{ascending:false}).limit(12);
        if(a.error)throw a.error;
        cs.actions=a.data||[];
      }else {cs.combatants=[];cs.actions=[];}
      cs.campaignId=c;cs.sessionId=sid;cs.key=key;render();
    }catch(err){console.warn('RPG HUB combat:',err);if(typeof toast==='function')toast(err.message||'Não foi possível carregar o combate.','error');}
    finally{cs.loading=false;}
  }

  async function realtime(){
    const c=cid();if(!c||cs.channel&&cs.campaignId===c)return;
    if(cs.channel)await sb.removeChannel(cs.channel).catch(()=>{});
    const ch=sb.channel('rpg-hub-combat-'+c,{config:{private:true}});
    ch.on('postgres_changes',{event:'*',schema:'public',table:'combat_encounters',filter:'campaign_id=eq.'+c},p=>{
      const row=p.new||p.old;if(!row)return;
      if(p.eventType==='INSERT'&&row.session_id===activeSession()?.id){cs.encounter=row;cs.combatants=[];cs.actions=[];loadCombat(true);}
      else if(p.eventType==='UPDATE'&&row.id===cs.encounter?.id){cs.encounter=row;render();}
      else if(p.eventType==='DELETE'&&row.id===cs.encounter?.id){cs.encounter=null;cs.combatants=[];cs.actions=[];render();}
    });
    ch.on('postgres_changes',{event:'*',schema:'public',table:'combat_actions'},p=>{
      const row=p.new||p.old;if(!row?.id||row.encounter_id!==cs.encounter?.id)return;
      if(p.eventType==='INSERT'){if(!cs.actions.some(x=>x.id===row.id)){cs.actions=[row,...cs.actions].slice(0,12);render();}}
      else if(p.eventType==='UPDATE')cs.actions=cs.actions.map(x=>x.id===row.id?row:x);
      else if(p.eventType==='DELETE')cs.actions=cs.actions.filter(x=>x.id!==row.id);
      render();
    });
    ch.on('postgres_changes',{event:'*',schema:'public',table:'combatants'},p=>{
      const row=p.new||p.old;if(!row?.id||row.encounter_id!==cs.encounter?.id)return;
      if(p.eventType==='INSERT'&&!cs.combatants.some(x=>x.id===row.id))cs.combatants.push(row);
      else if(p.eventType==='UPDATE')cs.combatants=cs.combatants.map(x=>x.id===row.id?row:x);
      else if(p.eventType==='DELETE')cs.combatants=cs.combatants.filter(x=>x.id!==row.id);
      render();
    });
    ch.subscribe((status,error)=>{if(status==='SUBSCRIBED'){loadCombat(true).catch(()=>{});}if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){console.warn('RPG HUB combat realtime:',status,error);setTimeout(()=>{if(cs.channel===ch){cs.channel=null;realtime().catch(()=>{});loadCombat(true).catch(()=>{});}},1200);}});
    cs.channel=ch;cs.campaignId=c;
  }

  async function startCombat(){
    if(!isMaster())return;
    const s=activeSession();if(!s)return;
    const existing=await sb.from('combat_encounters').select('*').eq('campaign_id',cid()).eq('session_id',s.id).eq('status','active').order('created_at',{ascending:false}).limit(1);
    if(existing.error)return toast(existing.error.message||'Não foi possível verificar o combate atual.','error');
    if(existing.data?.[0]){
      cs.encounter=existing.data[0];
      cs.key=cid()+':'+s.id;
      await loadCombat(true);
      return toast('Já existe um combate ativo nesta sessão.');
    }
    const id=crypto.randomUUID();
    const q=await sb.from('combat_encounters').insert({id,campaign_id:cid(),session_id:s.id,status:'active',round:1,current_index:0,started_by:state.user.id}).select('*').maybeSingle();
    if(q.error)return toast(q.error.message||'Não foi possível iniciar o combate.','error');
    const saved=q.data||await readRow('combat_encounters',id,'o combate');
    cs.encounter=saved;cs.combatants=[];cs.key=cid()+':'+s.id;render();toast('Combate iniciado para todos os participantes');
  }

  function sourceHp(n){const d=n?.data||{};const cur=Number(d.hp_current??d.hp??d.vida_atual),max=Number(d.hp_max??d.hp??d.vida??d.vida_max);return{cur:Number.isFinite(cur)?cur:null,max:Number.isFinite(max)?max:null};}

  function addModal(){
    if(!isMaster()||!cs.encounter)return;
    const chars=state.characters||[],npcs=state.npcs||[];
    showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATE</div><h3>Adicionar combatente</h3></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Origem<select id="cSource"><option value="character">Personagem</option><option value="npc">NPC / monstro</option><option value="manual">Manual</option></select></label><label>Tipo<select id="cKind"><option value="character">Personagem</option><option value="enemy" selected>Inimigo</option><option value="npc">NPC</option><option value="ally">Aliado</option></select></label></div><label id="cSourceLabel">Personagem<select id="cSourceId"></select></label><label>Nome<input id="cName" maxlength="100" placeholder="Ex.: Goblin"></label><div class="formGrid"><label>Iniciativa<input id="cInit" type="number" value="0"></label><label>HP atual<input id="cHp" type="number"></label><label>HP máximo<input id="cHpMax" type="number"></label></div><label>Condições <span class="optional">(separe por vírgula)</span><input id="cCond" placeholder="Atordoado, Caído"></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="cAdd">Adicionar</button></div>');
    const st=$('cSource'),sid=$('cSourceId'),sl=$('cSourceLabel');
    const sync=()=>{const t=st.value;let list=t==='character'?chars:npcs;sl.style.display=t==='manual'?'none':'';sid.innerHTML=(list||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')||'<option value="">Nenhum</option>';if(t==='character'){const x=chars.find(v=>v.id===sid.value)||chars[0];if(x){$('cName').value=x.name;$('cKind').value='character';$('cHp').value=x.hp_current??'';$('cHpMax').value=x.hp_max??'';}}else if(t==='npc'){const x=npcs.find(v=>v.id===sid.value)||npcs[0];if(x){const h=sourceHp(x);$('cName').value=x.name;$('cKind').value='npc';$('cHp').value=h.cur??'';$('cHpMax').value=h.max??'';}}else{$('cName').value='';$('cKind').value='enemy';$('cHp').value='';$('cHpMax').value='';}};
    st.onchange=sync;sid.onchange=sync;sync();
    $('cAdd').onclick=async()=>{const name=$('cName').value.trim();if(!name)return toast('Informe o nome do combatente.','error');const p={id:crypto.randomUUID(),encounter_id:cs.encounter.id,character_id:st.value==='character'?sid.value||null:null,npc_id:st.value==='npc'?sid.value||null:null,name,kind:$('cKind').value,initiative:Number($('cInit').value||0),hp_current:$('cHp').value===''?null:Number($('cHp').value),hp_max:$('cHpMax').value===''?null:Number($('cHpMax').value),conditions:$('cCond').value.trim(),turn_order:cs.combatants.length};const q=await sb.from('combatants').insert(p).select('*').maybeSingle();if(q.error)return toast(q.error.message||'Não foi possível adicionar.','error');const saved=q.data||await readRow('combatants',p.id,'o combatente');cs.combatants.push(saved);closeModal();render();toast(name+' entrou no combate');};
  }

  function editModal(id){
    if(!isMaster())return;const r=cs.combatants.find(x=>x.id===id);if(!r)return;
    showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATENTE</div><h3>Editar '+esc(r.name)+'</h3></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Nome<input id="eName" value="'+esc(r.name)+'"></label><label>Iniciativa<input id="eInit" type="number" value="'+Number(r.initiative||0)+'"></label><label>HP atual<input id="eHp" type="number" value="'+(r.hp_current??'')+'"></label><label>HP máximo<input id="eMax" type="number" value="'+(r.hp_max??'')+'"></label></div><label>Condições<input id="eCond" value="'+esc(r.conditions||'')+'"></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="eSave">Salvar</button></div>');
    $('eSave').onclick=async()=>{const u={name:$('eName').value.trim()||r.name,initiative:Number($('eInit').value||0),hp_current:$('eHp').value===''?null:Number($('eHp').value),hp_max:$('eMax').value===''?null:Number($('eMax').value),conditions:$('eCond').value.trim()};const q=await sb.from('combatants').update(u).eq('id',id).select('*').maybeSingle();if(q.error)return toast(q.error.message||'Não foi possível salvar.','error');const saved=q.data||await readRow('combatants',id,'o combatente');cs.combatants=cs.combatants.map(x=>x.id===id?saved:x);closeModal();render();};
  }

  async function persistCombatAction(payload){
    const row={id:crypto.randomUUID(),campaign_id:cid(),encounter_id:cs.encounter?.id||null,...payload,created_by:state.user.id};
    const q=await sb.from('combat_actions').insert(row).select('*').maybeSingle();
    if(q.error)throw q.error;
    return q.data||await readRow('combat_actions',row.id,'a ação de combate');
  }
  async function mirrorHpToSource(r,after){
    if(r?.character_id){
      const q=await sb.from('characters').update({hp_current:after}).eq('id',r.character_id).select('*').maybeSingle();
      if(q.error)throw q.error;
      const saved=q.data;
      if(saved)state.characters=(state.characters||[]).map(x=>x.id===r.character_id?saved:x);
    }else if(r?.npc_id){
      const n=(state.npcs||[]).find(x=>x.id===r.npc_id);
      if(n){
        const data={...(n.data||{}),hp_current:after};
        const q=await sb.from('npcs').update({data}).eq('id',r.npc_id).select('*').maybeSingle();
        if(q.error)throw q.error;
        if(q.data)state.npcs=(state.npcs||[]).map(x=>x.id===r.npc_id?q.data:x);
      }
    }
  }
  async function setCombatHp(id,next,reason='ajuste de HP'){
    if(!isMaster())return;
    const r=cs.combatants.find(x=>x.id===id);if(!r)return null;
    if(r.hp_current==null)return toast('Este combatente não possui HP configurado.','error');
    const max=r.hp_max==null?null:Number(r.hp_max),before=Number(r.hp_current);
    const after=max==null?Math.max(0,Number(next)):Math.min(max,Math.max(0,Number(next)));
    const q=await sb.from('combatants').update({hp_current:after}).eq('id',id).select('*').maybeSingle();
    if(q.error)return toast(q.error.message||'Não foi possível atualizar o HP.','error');
    const saved=q.data||await readRow('combatants',id,'o HP');
    try{await mirrorHpToSource(saved,after);}catch(err){console.warn('RPG HUB combat mirror HP:',err);}
    cs.combatants=cs.combatants.map(x=>x.id===id?saved:x);render();highlight();
    const delta=after-before;
    if(typeof logCampaignActivity==='function')await logCampaignActivity('combat_hp','combat',saved.name+' '+(delta>=0?'recuperou':'perdeu')+' '+Math.abs(delta)+' HP ('+before+' → '+after+')',saved.id,{before,after,delta,reason,down:isDown(saved)}).catch(()=>{});
    return saved;
  }
  async function hp(id,delta){const r=cs.combatants.find(x=>x.id===id);if(!r)return;await setCombatHp(id,Number(r.hp_current)+Number(delta),'ajuste rápido de HP');}
  async function showHealModal(){
    if(!isMaster()||!cs.encounter)return;
    const list=rows().filter(x=>!isDown(x));
    showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATE</div><h3>Cura</h3></div><button class="closeButton" data-close>×</button></div><label>Alvo<select id="healTarget">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>Quantidade de cura<input id="healAmount" value="1d8+0" placeholder="1d8+2"></label><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="healRoll">Aplicar cura</button></div>');
    $('healRoll').onclick=async()=>{
      const t=cs.combatants.find(x=>x.id===$('healTarget').value);const m=/^(\d+)d(\d+)([+-]\d+)?$/i.exec($('healAmount').value.trim());if(!t||!m)return toast('Informe um alvo e uma fórmula válida.','error');
      const count=Math.min(50,Math.max(1,Number(m[1]))),sides=Math.min(1000,Math.max(2,Number(m[2]))),mod=Number(m[3]||0);let roll=mod;for(let i=0;i<count;i++)roll+=(crypto.getRandomValues(new Uint32Array(1))[0]%sides)+1;const before=Number(t.hp_current),saved=await setCombatHp(t.id,before+Math.max(0,roll),'cura');
      if(!saved)return;const action=await persistCombatAction({attacker_combatant_id:null,target_combatant_id:t.id,attacker_name:'Cura',target_name:t.name,action_name:'Cura',attack_notation:null,attack_roll:null,attack_modifier:null,target_defense:null,hit:true,critical:false,damage_notation:$('healAmount').value.trim(),damage_roll:roll,damage_bonus:0,damage_total:Math.max(0,roll),hp_before:before,hp_after:saved.hp_current,hp_lost_percent:0,effect_percent:null,notes:'Cura aplicada'}).catch(err=>{console.warn('RPG HUB combat action:',err);return null});
      if(typeof logCampaignActivity==='function')await logCampaignActivity('combat_heal','combat',t.name+' recuperou '+Math.max(0,roll)+' HP',t.id,{amount:Math.max(0,roll),before,hp_after:saved.hp_current,notation:$('healAmount').value.trim(),action_id:action?.id||null}).catch(()=>{});closeModal();toast(t.name+' recuperou '+Math.max(0,roll)+' HP.');render();
    };
  }
  async function showConditionsModal(){
    if(!isMaster()||!cs.encounter)return;
    const list=rows();
    showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATE</div><h3>Condições</h3></div><button class="closeButton" data-close>×</button></div><label>Combatente<select id="condTarget">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>Condição<input id="condValue" maxlength="80" placeholder="Atordoado, Caído, Cego..."></label><label>Duração em turnos <span class="optional">(0 = permanente)</span><input id="condDuration" type="number" min="0" value="0"></label><div class="modalActions"><button class="softButton" id="condRemove">Remover</button><button class="primarySmall" id="condAdd">Aplicar</button></div>');
    const change=async(add)=>{
      const r=cs.combatants.find(x=>x.id===$('condTarget').value),value=$('condValue').value.trim(),duration=Math.max(0,Number($('condDuration')?.value||0));if(!r||!value)return toast('Informe a condição.','error');
      const rules=window.rpgCombatRules?.stateOf(r)||{resistances:[],immunities:[],vulnerabilities:[],saves:{},conditions:[]};const nextConditions=window.rpgCombatRules?(add?window.rpgCombatRules.addCondition(r,value,duration,state.user.id):window.rpgCombatRules.removeCondition(r,value)):rules.conditions;const names=nextConditions.map(c=>typeof c==='string'?c:c.name);
      const q=await sb.from('combatants').update({conditions:names.join(', '),rules_state:{...rules,conditions:nextConditions}}).eq('id',r.id).select('*').maybeSingle();if(q.error)return toast(q.error.message||'Não foi possível salvar a condição.','error');
      const saved=q.data||await readRow('combatants',r.id,'a condição');cs.combatants=cs.combatants.map(x=>x.id===r.id?saved:x);render();
      if(typeof logCampaignActivity==='function')await logCampaignActivity(add?'combat_condition_add':'combat_condition_remove','combat',r.name+(add?' recebeu ':' perdeu ')+value,r.id,{condition:value}).catch(()=>{});
      toast(add?'Condição aplicada.':'Condição removida.');
    };
    $('condAdd').onclick=()=>change(true);$('condRemove').onclick=()=>change(false);
  }
  async function rollInit(id){if(!isMaster())return;const r=cs.combatants.find(x=>x.id===id);if(!r)return;const n=(crypto.getRandomValues(new Uint32Array(1))[0]%20)+1;const q=await sb.from('combatants').update({initiative:n}).eq('id',id).select('*').maybeSingle();if(q.error)return toast(q.error.message||'Não foi possível salvar a iniciativa.','error');const saved=q.data||await readRow('combatants',id,'a iniciativa');cs.combatants=cs.combatants.map(x=>x.id===id?saved:x);render();toast(r.name+' tirou '+n);}
  async function remove(id){if(!isMaster())return;const r=cs.combatants.find(x=>x.id===id);if(!r||!confirm('Remover '+r.name+' do combate?'))return;const q=await sb.from('combatants').delete().eq('id',id);if(q.error)return toast(q.error.message||'Não foi possível remover.','error');cs.combatants=cs.combatants.filter(x=>x.id!==id);render();}
  async function advance(){
    if(!isMaster()||!cs.encounter||cs.encounter.status==='finished')return;
    const r=rows().filter(x=>!isDown(x)); if(!r.length){
      const q=await sb.from('combat_encounters').update({status:'finished'}).eq('id',cs.encounter.id).select('*').maybeSingle();
      if(q.error)return toast(q.error.message||'Não foi possível encerrar.','error');
      cs.encounter=q.data||await readRow('combat_encounters',cs.encounter.id,'o encerramento');render();return toast('Todos os combatentes estão fora de combate.');
    }
    const all=rows(),current=active(),currentIndex=current?Math.max(0,r.findIndex(x=>x.id===current.id)): -1;
    let nextPos=currentIndex+1,round=Number(cs.encounter.round||1);
    if(nextPos>=r.length){nextPos=0;round++;}
    const target=r[nextPos], allIndex=Math.max(0,all.findIndex(x=>x.id===target.id));
    const q=await sb.from('combat_encounters').update({current_index:allIndex,round}).eq('id',cs.encounter.id).select('*').maybeSingle();
    if(q.error)return toast(q.error.message||'Não foi possível avançar.','error');
    cs.encounter=q.data||await readRow('combat_encounters',cs.encounter.id,'o turno');
    const refreshed=[];for(const combatant of cs.combatants){const tick=window.rpgCombatRules?.tick(combatant);const payload={actions_available:1,reactions_available:1,movement_remaining:Number(combatant.movement_remaining||0),rules_state:tick?.rules_state||combatant.rules_state||{}};if(tick?.expired?.length)payload.conditions=String((tick.rules_state.conditions||[]).map(x=>x.name)).replace(/,/g,', ');try{const rr=await sb.from('combatants').update(payload).eq('id',combatant.id).select('*').maybeSingle();if(!rr.error&&rr.data)refreshed.push(rr.data);else refreshed.push(combatant);}catch(_){refreshed.push(combatant);}}if(refreshed.length)cs.combatants=refreshed;render();
    if(typeof logCampaignActivity==='function')await logCampaignActivity('combat_turn','combat','Turno de '+target.name+' · rodada '+round,cs.encounter.id,{combatant_id:target.id,round}).catch(()=>{});
  }
  async function end(){if(!isMaster()||!cs.encounter||!confirm('Encerrar o combate atual?'))return;const q=await sb.from('combat_encounters').update({status:'finished'}).eq('id',cs.encounter.id).select('*').maybeSingle();if(q.error)return toast(q.error.message||'Não foi possível encerrar.','error');cs.encounter=q.data||await readRow('combat_encounters',cs.encounter.id,'o encerramento');render();toast('Combate encerrado');}

  async function applyCombatHp(id,delta,reason='ajuste de HP'){
    if(!isMaster())return;
    const r=cs.combatants.find(x=>x.id===id); if(!r||r.hp_current==null)return;
    const max=r.hp_max==null?null:Number(r.hp_max);
    const before=Number(r.hp_current), nextRaw=before+Number(delta);
    const after=max==null?Math.max(0,nextRaw):Math.min(max,Math.max(0,nextRaw));
    const q=await sb.from('combatants').update({hp_current:after}).eq('id',id).select('*').maybeSingle();
    if(q.error)return toast(q.error.message||'Não foi possível atualizar o HP.','error');
    const saved=q.data||await readRow('combatants',id,'o HP');
    cs.combatants=cs.combatants.map(x=>x.id===id?saved:x); render();
    if(typeof logCampaignActivity==='function'){
      await logCampaignActivity('combat_hp','combat',r.name+' '+(delta>=0?'recuperou':'perdeu')+' '+Math.abs(Number(delta))+' HP ('+before+' → '+after+')',id,{before,after,delta:Number(delta),reason}).catch(()=>{});
    }
    return saved;
  }

  async function attackModal(){
    if(!isMaster()||!cs.encounter)return;
    const list=rows().filter(x=>!isDown(x));
    if(list.length<2)return toast('É preciso ter ao menos dois combatentes ativos.','error');
    showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATE</div><h3>Ataque</h3></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Atacante<select id="atkFrom">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>Alvo<select id="atkTarget">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label></div><div class="formGrid"><label>Bônus de ataque<input id="atkBonus" type="number" value="0"></label><label>CA do alvo<input id="atkAc" type="number" value="10"></label><label>Dano<input id="atkDamage" value="1d6+0" placeholder="1d6+3"></label><label>Tipo de dano<select id="atkType"><option>físico</option><option>corte</option><option>perfuração</option><option>contundente</option><option>fogo</option><option>frio</option><option>ácido</option><option>elétrico</option><option>veneno</option><option>psíquico</option><option>necrótico</option></select></label></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="atkRoll">Rolar ataque</button></div>');
    let equipmentByCharacter={};
    const loadEquipment=async(characterId)=>{
      if(!characterId||equipmentByCharacter[characterId])return equipmentByCharacter[characterId]||[];
      const q=await sb.from('character_inventory').select('name,equipped,metadata,weight').eq('character_id',characterId).eq('equipped',true);
      if(q.error){console.warn('RPG HUB equipamento:',q.error);return [];}
      equipmentByCharacter[characterId]=q.data||[];return equipmentByCharacter[characterId];
    };
    const equipmentMods=items=>items.reduce((a,x)=>{const m=x.metadata&&typeof x.metadata==='object'?x.metadata:{};return{attack:a.attack+Number(m.attack_bonus||0),damage:a.damage+Number(m.damage_bonus||0),ac:a.ac+Number(m.ac_bonus||0),damageType:m.damage_type||a.damageType}}, {attack:0,damage:0,ac:0,damageType:''});
    const sync=async()=>{const t=cs.combatants.find(x=>x.id===$('atkTarget').value),from=cs.combatants.find(x=>x.id===$('atkFrom').value);$('atkAc').value=t?defenseFor(t):10;const mods=equipmentMods(await loadEquipment(from?.character_id));$('atkBonus').value=mods.attack; if(mods.damageType&&$('atkType').value==='físico')$('atkType').value=mods.damageType;};
    $('atkTarget').onchange=()=>sync();$('atkFrom').onchange=()=>sync();sync();
    $('atkRoll').onclick=async()=>{
      const from=cs.combatants.find(x=>x.id===$('atkFrom').value),target=cs.combatants.find(x=>x.id===$('atkTarget').value);if(!from||!target||from.id===target.id||isDown(from)||isDown(target))return toast('Escolha combatentes ativos diferentes.','error');if(Number(from.actions_available??1)<=0)return toast(from.name+' não possui ações disponíveis neste turno.','error');
      const d20=(crypto.getRandomValues(new Uint32Array(1))[0]%20)+1,bonus=Number($('atkBonus').value||0),ac=Number($('atkAc').value||10),total=d20+bonus,natural1=d20===1,critical=d20===20,hit=!natural1&&(critical||total>=ac);
      let damage=null,diceRoll=null,dmgBonus=0,notation=$('atkDamage').value.trim();
      if(hit){const m=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(notation);if(!m)return toast('Dano inválido. Use 1d6 ou 2d6+3.','error');const count=Math.min(50,Math.max(1,Number(m[1]))),sides=Math.min(1000,Math.max(2,Number(m[2]))),mod=Number(m[3]||0);dmgBonus=mod;diceRoll=0;for(let i=0;i<count;i++)diceRoll+=(crypto.getRandomValues(new Uint32Array(1))[0]%sides)+1;damage=Math.max(0,(diceRoll+mod)*(critical?2:1));}
      const equipment=equipmentMods(await loadEquipment(from.character_id));damage+=equipment.damage;
      const damageType=$('atkType')?.value||'físico';const rawDamage=damage;const modified=hit&&window.rpgCombatRules?window.rpgCombatRules.applyDamage(target,rawDamage,damageType):{total:rawDamage,multiplier:1,type:damageType};damage=modified.total;const before=target.hp_current==null?null:Number(target.hp_current);let saved=target;
      if(hit&&before!=null)saved=await setCombatHp(target.id,before-damage,'ataque de '+from.name+' · '+damageType);
      const action=await persistCombatAction({attacker_combatant_id:from.id,target_combatant_id:target.id,attacker_name:from.name,target_name:target.name,action_name:'Ataque',attack_notation:'1d20',attack_roll:d20,attack_modifier:bonus,target_defense:ac,hit,critical,damage_notation:hit?notation:null,damage_roll:hit?diceRoll:null,damage_bonus:hit?dmgBonus:null,damage_total:hit?damage:null,hp_before:before,hp_after:saved?.hp_current??before,hp_lost_percent:before&&damage!=null?Math.max(0,Math.min(100,damage/before*100)):null,effect_percent:null,notes:(natural1?'Falha crítica natural':critical?'Acerto crítico':hit?'Acerto':'Erro')+' · '+damageType+' · multiplicador '+modified.multiplier});
      const actionState=window.rpgCombatRules?.normalize(from)||{actions_available:1,reactions_available:1,movement_remaining:0};const actionUpdate=await sb.from('combatants').update({actions_available:Math.max(0,Number(actionState.actions_available)-1)}).eq('id',from.id).select('*').maybeSingle();if(!actionUpdate.error&&actionUpdate.data)cs.combatants=cs.combatants.map(x=>x.id===from.id?actionUpdate.data:x);
      const summary=from.name+' atacou '+target.name+': '+total+' vs CA '+ac+' — '+(critical?'ACERTO CRÍTICO':hit?'ACERTO':'ERRO')+(hit?' · '+damage+' dano':'')+' · '+damageType;
      if(typeof logCampaignActivity==='function')await logCampaignActivity('combat_attack','combat',summary,action?.id||null,{attacker_id:from.id,target_id:target.id,attack:d20,bonus,ac,total,hit,critical,damage,action_id:action?.id||null}).catch(()=>{});
      closeModal();toast(summary);render();highlight();
    };
  }
  async function abilityModal(){
    if(!isMaster()||!cs.encounter)return;
    const list=rows().filter(x=>!isDown(x)),ids=list.map(x=>x.character_id).filter(Boolean);
    if(!ids.length)return toast('Nenhum personagem disponível para usar habilidades.','error');
    const q=await sb.from('character_abilities').select('*').in('character_id',ids).eq('prepared',true).order('created_at');
    if(q.error)return toast(q.error.message,'error');
    const abilities=q.data||[];if(!abilities.length)return toast('Nenhuma habilidade ou magia preparada.','error');
    showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATE</div><h3>Habilidade / magia</h3></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Usuário<select id="abilityFrom">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>Habilidade<select id="abilityPick">'+abilities.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+' · '+esc(x.category)+'</option>').join('')+'</select></label><label>Alvo<select id="abilityTarget">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label></div><div class="formGrid"><label>Tipo de dano<input id="abilityType"></label><label>CD alternativa<input id="abilityDc" type="number" min="0" value="0"></label></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="abilityExecute">Executar</button></div>');
    const sync=()=>{const a=abilities.find(x=>x.id===$('abilityPick').value);if(a){$('abilityType').value=a.damage_type||'physical';$('abilityDc').value=a.save_dc||0;}};$('abilityPick').onchange=sync;sync();
    $('abilityExecute').onclick=async()=>{
      const from=cs.combatants.find(x=>x.id===$('abilityFrom').value),target=cs.combatants.find(x=>x.id===$('abilityTarget').value),a=abilities.find(x=>x.id===$('abilityPick').value);
      if(!from||!target||!a)return;
      if(a.action_type==='action'&&Number(from.actions_available??1)<=0)return toast(from.name+' não possui ação disponível.','error');
      const m=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(String(a.damage_formula||'').trim());let roll=0,raw=0,bonus=0;
      if(m){const count=Math.min(50,Math.max(1,Number(m[1]))),sides=Math.min(1000,Math.max(2,Number(m[2])));bonus=Number(m[3]||0);for(let i=0;i<count;i++)roll+=(crypto.getRandomValues(new Uint32Array(1))[0]%sides)+1;raw=Math.max(0,roll+bonus);}
      const dc=Math.max(0,Number($('abilityDc').value||a.save_dc||0)),save=a.save_ability&&dc&&window.rpgCombatRules?window.rpgCombatRules.rollSave(target,a.save_ability,dc):null;
      const postSave=save?.success?Math.floor(raw/2):raw,mod=window.rpgCombatRules?.applyDamage(target,postSave,$('abilityType').value||a.damage_type||'physical')||{total:postSave,multiplier:1};
      const before=target.hp_current==null?null:Number(target.hp_current),after=before==null?null:Math.max(0,before-mod.total);let saved=target;if(after!==null)saved=await setCombatHp(target.id,after,'habilidade '+a.name);
      if(a.uses_max){const uq=await sb.from('character_abilities').update({uses_remaining:Math.max(0,Number(a.uses_remaining)-1),updated_at:new Date().toISOString()}).eq('id',a.id).select('*').maybeSingle();if(uq.error)throw uq.error;}
      const action=await persistCombatAction({attacker_combatant_id:from.id,target_combatant_id:target.id,attacker_name:from.name,target_name:target.name,action_name:a.name,attack_notation:a.damage_formula||null,damage_notation:a.damage_formula||null,damage_roll:roll||null,damage_bonus:bonus,damage_total:mod.total,hp_before:before,hp_after:saved?.hp_current??after,hit:true,critical:false,notes:'Habilidade '+a.category+' · '+a.action_type+(save?' · salvamento '+a.save_ability+' '+save.total+'/'+dc:'')});
      if(a.action_type==='action'){const au=await sb.from('combatants').update({actions_available:Math.max(0,Number(from.actions_available??1)-1)}).eq('id',from.id).select('*').maybeSingle();if(!au.error&&au.data)cs.combatants=cs.combatants.map(x=>x.id===from.id?au.data:x);}
      await logCampaignActivity?.('combat_ability','combat',from.name+' usou '+a.name+' em '+target.name+' · '+mod.total+' dano',action?.id||null,{ability_id:a.id,damage:mod.total,save:save||null}).catch?.(()=>{});
      closeModal();toast(a.name+' executada.');render();highlight();
    };
  }
  async function reactionModal(){
    if(!isMaster()||!cs.encounter)return;
    const list=rows().filter(x=>!isDown(x));
    if(list.length<2)return toast('É preciso ter ao menos dois combatentes ativos.','error');
    showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATE</div><h3>Reação</h3><p class="modalHint">A reação é um recurso genérico; a regra específica pode ser definida pelo sistema de RPG.</p></div><button class="closeButton" data-close>×</button></div><div class="formGrid"><label>Combatente<select id="reactFrom">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label><label>Alvo<select id="reactTarget">'+list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('')+'</select></label></div><div class="formGrid"><label>Efeito<input id="reactName" maxlength="80" value="Reação"></label><label>Dano <span class="optional">(0 = sem dano)</span><input id="reactDamage" value="0" placeholder="1d6+2"></label><label>Tipo<select id="reactType"><option>físico</option><option>fogo</option><option>frio</option><option>ácido</option><option>elétrico</option><option>veneno</option><option>psíquico</option><option>necrótico</option></select></label></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="reactApply">Usar reação</button></div>');
    $('reactApply').onclick=async()=>{
      const from=cs.combatants.find(x=>x.id===$('reactFrom').value),target=cs.combatants.find(x=>x.id===$('reactTarget').value);
      if(!from||!target||from.id===target.id||isDown(from)||isDown(target))return toast('Escolha combatentes ativos diferentes.','error');
      if(Number(from.reactions_available??1)<=0)return toast(from.name+' não possui reação disponível.','error');
      const name=$('reactName').value.trim()||'Reação',notation=$('reactDamage').value.trim(),type=$('reactType').value||'físico';
      let raw=0,roll=0,mod=0;
      if(notation&&notation!=='0'){const m=/^(\d+)d(\d+)([+-]\d+)?$/i.exec(notation);if(!m)return toast('Dano inválido. Use 1d6 ou 2d6+3.','error');const count=Math.min(50,Math.max(1,Number(m[1]))),sides=Math.min(1000,Math.max(2,Number(m[2])));mod=Number(m[3]||0);for(let i=0;i<count;i++)roll+=(crypto.getRandomValues(new Uint32Array(1))[0]%sides)+1;raw=Math.max(0,roll+mod);}
      const modified=window.rpgCombatRules?.applyDamage(target,raw,type)||{total:raw,multiplier:1,type};
      const before=target.hp_current==null?null:Number(target.hp_current);let saved=target;
      if(before!=null&&modified.total>0)saved=await setCombatHp(target.id,before-modified.total,'reação de '+from.name+' · '+type);
      const action=await persistCombatAction({attacker_combatant_id:from.id,target_combatant_id:target.id,attacker_name:from.name,target_name:target.name,action_name:name,attack_notation:null,attack_roll:null,attack_modifier:0,target_defense:null,hit:modified.total>0,critical:false,damage_notation:notation&&notation!=='0'?notation:null,damage_roll:notation&&notation!=='0'?roll:null,damage_bonus:notation&&notation!=='0'?mod:0,damage_total:modified.total,hp_before:before,hp_after:saved?.hp_current??before,hp_lost_percent:before&&modified.total?Math.max(0,Math.min(100,modified.total/before*100)):0,effect_percent:0,notes:'Reação · '+type+' · multiplicador '+modified.multiplier});
      const next=Math.max(0,Number(from.reactions_available??1)-1);
      const uq=await sb.from('combatants').update({reactions_available:next}).eq('id',from.id).select('*').maybeSingle();
      if(!uq.error&&uq.data)cs.combatants=cs.combatants.map(x=>x.id===from.id?uq.data:x);
      const summary=from.name+' usou '+name+' contra '+target.name+(modified.total?' · '+modified.total+' dano':'');
      if(typeof logCampaignActivity==='function')await logCampaignActivity('combat_reaction','combat',summary,action?.id||null,{attacker_id:from.id,target_id:target.id,damage:modified.total,action_id:action?.id||null}).catch(()=>{});
      closeModal();toast(summary);render();highlight();
    };
  }
  function manage(){if(!isMaster())return;const r=rows();showModal('<div class="modalHeader"><div><div class="eyebrow">COMBATE</div><h3>Combatentes</h3></div><button class="closeButton" data-close>×</button></div><div class="rpgCombatModalList">'+(r.length?r.map(x=>'<article class="rpgCombatModalItem"><div><b>'+esc(x.name)+'</b><small>Iniciativa '+Number(x.initiative||0)+'</small></div><button class="dangerButton" data-mremove="'+x.id+'">Remover</button></article>').join(''):'<div class="rpgCombatEmpty">Nenhum combatente.</div>')+'</div><div class="modalActions"><button class="primarySmall" data-close>Fechar</button></div>');document.querySelectorAll('[data-mremove]').forEach(b=>b.onclick=async()=>{await remove(b.dataset.mremove);closeModal();});}

  function bind(){
    const m=$('rpgCombatMount');if(!m||m.dataset.bound)return;m.dataset.bound='1';
    m.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.matches('[data-start-combat]'))startCombat();else if(b.matches('[data-add]'))addModal();else if(b.matches('[data-attack]'))attackModal();else if(b.matches('[data-reaction]'))reactionModal();else if(b.matches('[data-ability]'))abilityModal();else if(b.matches('[data-ruleset]'))window.rpgCampaignRulesOpen?.();else if(b.matches('[data-edit]'))editModal(b.dataset.edit);else if(b.matches('[data-rules]')){const r=cs.combatants.find(x=>x.id===b.dataset.rules);if(r&&window.rpgCombatRules)window.rpgCombatRules.configureModal(r,showModal,esc);}else if(b.matches('[data-remove]'))remove(b.dataset.remove);else if(b.matches('[data-hp]'))hp(b.dataset.hp,b.dataset.delta);else if(b.matches('[data-init]'))rollInit(b.dataset.init);else if(b.matches('[data-advance]'))advance();else if(b.matches('[data-end]'))end();else if(b.matches('[data-manage]'))manage();else if(b.matches('[data-heal]'))showHealModal();else if(b.matches('[data-conditions]'))showConditionsModal();else if(b.matches('[data-focus]'))focusToken(cs.combatants.find(x=>x.id===b.dataset.focus));else if(b.matches('[data-go-table]')){state.view='table';renderView();}else if(b.matches('[data-go-sessions]')){state.view='sessions';renderView();}});
  }

  function init(){
    if(typeof state==='undefined'||typeof sb==='undefined'){setTimeout(init,250);return;}
    if(cs.initialized)return;cs.initialized=true;styles();mountUI();bind();realtime();loadCombat(true);
    setInterval(()=>{mountUI();bind();const k=(cid()+':'+(activeSession()?.id||null));if(k!==cs.key)loadCombat(true);if(cid()!==cs.campaignId)realtime();if(state.view==='combat')render();},2000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();