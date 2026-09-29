(() => {
  'use strict';

  const mp = {
    presence: null,
    presenceCampaign: null,
    actionChannel: null,
    actionCampaign: null,
    lastEncounter: null,
    boundMount: null,
    observer: null,
    poll: null
  };

  const $ = id => document.getElementById(id);
  const esc = v => typeof escapeHtml === 'function' ? escapeHtml(v) : String(v ?? '').replace(/[&<>\"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[m]));
  const campaignId = () => state?.campaign?.id || null;
  const session = () => typeof currentSession === 'function' ? currentSession() : null;
  const master = () => typeof canEdit === 'function' && canEdit();

  function profileName(id, fallback='Aventureiro') {
    return state?.profiles?.get?.(id)?.display_name || (id === state?.user?.id ? state?.profile?.display_name : null) || fallback;
  }

  function injectStyles() {
    if ($('rpgMultiplayerCombatStyles')) return;
    const s = document.createElement('style');
    s.id = 'rpgMultiplayerCombatStyles';
    s.textContent = `
      .rpgOnlineWrap{position:relative;display:flex;align-items:center}
      .rpgOnlineButton{border:0;background:transparent;color:inherit;display:flex;align-items:center;gap:7px;cursor:pointer;padding:6px 8px;border-radius:10px}
      .rpgOnlineButton:hover{background:rgba(255,255,255,.045)}
      .rpgOnlineList{position:absolute;right:0;top:calc(100% + 8px);width:230px;z-index:150;background:#0d131a;border:1px solid #2a313d;border-radius:14px;padding:10px;box-shadow:0 18px 45px rgba(0,0,0,.35);display:none}
      .rpgOnlineList.open{display:block}
      .rpgOnlineList h4{margin:2px 4px 9px;color:#e7ebf2;font-size:10px}
      .rpgOnlineUser{display:flex;align-items:center;gap:9px;padding:8px;border-radius:9px}
      .rpgOnlineUser:hover{background:#131a23}
      .rpgOnlineDot{width:7px;height:7px;border-radius:50%;background:#6ee7b7;box-shadow:0 0 8px rgba(110,231,183,.45)}
      .rpgOnlineUser b{display:block;color:#dfe4eb;font-size:9px}.rpgOnlineUser small{display:block;color:#697485;font-size:7px;margin-top:2px}
      .rpgCombatActionBox{margin-top:14px;border:1px solid #29313d;background:#0d131a;border-radius:16px;padding:14px}
      .rpgCombatActionHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
      .rpgCombatActionHead b{color:#e5e9f0;font-size:11px}.rpgCombatActionHead span{color:#697485;font-size:8px}
      .rpgCombatActionRows{display:grid;gap:7px;max-height:310px;overflow:auto}
      .rpgCombatActionRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px;border:1px solid #252d38;border-radius:10px;background:#10161e}
      .rpgCombatActionRow b{color:#dfe4eb;font-size:9px}.rpgCombatActionRow p{margin:3px 0 0;color:#737e8e;font-size:8px;line-height:1.45}
      .rpgCombatActionStats{text-align:right}.rpgCombatActionStats strong{display:block;color:#e8c986;font-size:12px}.rpgCombatActionStats small{display:block;color:#697485;font-size:7px;margin-top:2px}
      .rpgCombatHit{color:#8ee1b6!important}.rpgCombatMiss{color:#ff9eaa!important}.rpgCombatCrit{color:#c5b9ff!important}
      .rpgAttackGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.rpgAttackGrid label:last-child{grid-column:1/-1}
      .rpgAttackPreview{padding:10px;border:1px solid #2d3542;border-radius:11px;background:#10161e;color:#8d97a7;font-size:8px;line-height:1.6}.rpgAttackPreview b{color:#e4e8ef}
      @media(max-width:600px){.rpgOnlineList{right:-70px}.rpgAttackGrid{grid-template-columns:1fr}.rpgAttackGrid label:last-child{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  function presenceUsers() {
    if (!mp.presence) return [];
    const raw = mp.presence.presenceState() || {};
    const users = new Map();
    Object.keys(raw).forEach(key => {
      const entries = Array.isArray(raw[key]) ? raw[key] : [];
      const entry = entries[entries.length - 1] || {};
      const id = entry.user_id || key;
      if (!users.has(id)) users.set(id, {
        id,
        name: entry.display_name || profileName(id),
        role: entry.account_type === 'master' ? 'Mestre' : 'Jogador',
        view: entry.view || 'Mesa'
      });
    });
    return [...users.values()].sort((a,b) => a.name.localeCompare(b.name,'pt-BR'));
  }

  function renderPresence() {
    const users = presenceUsers();
    const count = Math.max(1, users.length);
    const countEl = $('onlineCount');
    if (countEl) countEl.textContent = `${count} online`;
    let wrap = document.querySelector('.rpgOnlineWrap');
    if (!wrap && countEl) {
      const host = countEl.closest('.sessionOnline');
      if (host) {
        wrap = document.createElement('div');
        wrap.className = 'rpgOnlineWrap';
        host.replaceChildren(wrap);
        const button = document.createElement('button');
        button.type='button'; button.className='rpgOnlineButton'; button.id='rpgOnlineButton';
        button.innerHTML='<i></i><span id="rpgOnlineCountText">1 online</span>';
        const list=document.createElement('div'); list.className='rpgOnlineList'; list.id='rpgOnlineList';
        list.innerHTML='<h4>Jogadores nesta seção</h4><div id="rpgOnlineUsers"></div>';
        wrap.append(button,list);
        button.addEventListener('click',e=>{e.stopPropagation();list.classList.toggle('open')});
        document.addEventListener('click',()=>list.classList.remove('open'));
      }
    }
    const text=$('rpgOnlineCountText');if(text)text.textContent=`${count} online`;
    const list=$('rpgOnlineUsers');if(list){
      list.innerHTML=users.length?users.map(u=>`<div class="rpgOnlineUser"><i class="rpgOnlineDot"></i><div><b>${esc(u.name)}</b><small>${esc(u.role)} · ${esc(u.view)}</small></div></div>`).join(''):'<div class="rpgOnlineUser"><i class="rpgOnlineDot"></i><div><b>Você</b><small>Conectado</small></div></div>';
    }
  }

  async function connectPresence() {
    const c=campaignId(); if(!c||!state?.user)return;
    if(mp.presenceCampaign===c && mp.presence)return;
    if(mp.presence){await sb.removeChannel(mp.presence).catch(()=>{});mp.presence=null;}
    if(state.presenceChannel && state.presenceChannel !== mp.presence){await sb.removeChannel(state.presenceChannel).catch(()=>{});state.presenceChannel=null;}
    const ch=sb.channel(`rpg-hub-presence-v2-${c}`,{config:{private:true,presence:{key:state.user.id}}});
    ch.on('presence',{event:'sync'},renderPresence);
    ch.on('presence',{event:'join'},renderPresence);
    ch.on('presence',{event:'leave'},renderPresence);
    ch.subscribe(async status=>{
      if(status==='SUBSCRIBED'){
        await ch.track({user_id:state.user.id,display_name:state.profile?.display_name||'Aventureiro',account_type:state.profile?.account_type||'player',view:state.view||'table',joined_at:Date.now()});
        renderPresence();
      }
    });
    mp.presence=ch;mp.presenceCampaign=c;state.presenceChannel=ch;
  }

  async function updatePresenceView(){
    if(!mp.presence)return;
    try{await mp.presence.track({user_id:state.user.id,display_name:state.profile?.display_name||'Aventureiro',account_type:state.profile?.account_type||'player',view:state.view||'table',joined_at:Date.now()});}catch(e){}
  }

  function parseDice(notation) {
    const m=String(notation||'').trim().toLowerCase().match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if(!m) return null;
    const count=Math.min(50,Math.max(1,Number(m[1]))), sides=Math.min(1000,Math.max(2,Number(m[2]))), bonus=Number(m[3]||0);
    const rolls=[];for(let i=0;i<count;i++)rolls.push((crypto.getRandomValues(new Uint32Array(1))[0]%sides)+1);
    return {count,sides,bonus,rolls,total:rolls.reduce((a,b)=>a+b,0)+bonus};
  }

  function d20(){return (crypto.getRandomValues(new Uint32Array(1))[0]%20)+1;}
  function hitChance(mod,def){let hits=0;for(let f=1;f<=20;f++){if(f===1)continue;if(f===20||f+mod>=def)hits++;}return hits*5;}
  function defenseFor(combatant){
    if(combatant?.character_id){const c=(state.characters||[]).find(x=>x.id===combatant.character_id);if(c?.armor_class!=null)return Number(c.armor_class)||10;}
    if(combatant?.npc_id){const n=(state.npcs||[]).find(x=>x.id===combatant.npc_id);const d=n?.data||{};return Number(d.armor_class??d.ac??d.defense)||10;}
    return 10;
  }

  async function loadActions(encounterId){
    if(!encounterId)return [];
    const q=await sb.from('combat_actions').select('*').eq('encounter_id',encounterId).order('created_at',{ascending:false}).limit(100);
    return q.error?[]:(q.data||[]);
  }

  async function renderActionLog() {
    const mount=$('rpgCombatMount');if(!mount)return;
    const encounter=document.querySelector('#rpgCombatMount .rpgCombatHero') ? await findEncounter() : null;
    if(!encounter)return;
    const actions=await loadActions(encounter.id);
    let box=$('rpgCombatActionBox');
    if(!box){box=document.createElement('section');box.id='rpgCombatActionBox';box.className='rpgCombatActionBox';mount.appendChild(box);}
    box.innerHTML=`<div class="rpgCombatActionHead"><div><b>Histórico de ações</b><span> Ataques e dano aplicados nesta rodada</span></div><button class="softButton" id="rpgAttackButton" ${master()?'':'style="display:none"'}>⚔ Registrar ataque</button></div><div class="rpgCombatActionRows" id="rpgCombatActionRows">${actions.length?actions.map(actionHtml).join(''):'<div class="rpgCombatActionRow"><div><b>Nenhuma ação registrada</b><p>O mestre pode registrar ataques, rolagens, dano e efeitos aqui.</p></div></div>'}</div>`;
    $('rpgAttackButton')?.addEventListener('click',openAttackModal);
  }

  async function findEncounter(){
    const sid=session()?.id,c=campaignId();if(!sid||!c)return null;
    const q=await sb.from('combat_encounters').select('*').eq('campaign_id',c).eq('session_id',sid).order('created_at',{ascending:false}).limit(1);
    return q.data?.[0]||null;
  }

  function actionHtml(a){
    const result=a.hit?(a.critical?'CRÍTICO':'ACERTO'):'ERRO';
    const cls=a.hit?(a.critical?'rpgCombatCrit':'rpgCombatHit'):'rpgCombatMiss';
    const dmg=a.hit?` · ${Number(a.damage_total||0)} dano · ${Number(a.effect_percent||0).toFixed(1)}% da vida máxima`:'';
    return `<article class="rpgCombatActionRow"><div><b>${esc(a.attacker_name)} → ${esc(a.target_name)} · ${esc(a.action_name)}</b><p>${esc(result)} · d20 ${Number(a.attack_roll||0)} ${Number(a.attack_modifier||0)>=0?'+':''}${Number(a.attack_modifier||0)} vs CA ${Number(a.target_defense||10)} · chance calculada ${Number(a.hit_chance||0).toFixed(0)}%${dmg}</p></div><div class="rpgCombatActionStats"><strong class="${cls}">${a.hit?Number(a.damage_total||0)+' HP':'ERRO'}</strong><small>${Number(a.hp_after||0)} HP restantes</small></div></article>`;
  }

  async function openAttackModal(){
    if(!master())return;
    const encounter=await findEncounter();if(!encounter)return toast('Inicie um combate antes de registrar um ataque.','error');
    const q=await sb.from('combatants').select('*').eq('encounter_id',encounter.id).order('turn_order');
    if(q.error)return toast(q.error.message,'error');
    const combatants=q.data||[];if(combatants.length<2)return toast('Adicione pelo menos dois combatentes.','error');
    showModal(`<div class="modalHeader"><div><div class="eyebrow">AÇÃO DE COMBATE</div><h3>Registrar ataque</h3><p class="modalHint">O sistema calcula acerto, chance, crítico, dano e percentual de vida perdido.</p></div><button class="closeButton" data-close>×</button></div><div class="rpgAttackGrid"><label>Atacante<select id="rpgAttackAttacker">${combatants.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>Alvo<select id="rpgAttackTarget">${combatants.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>Ação<input id="rpgAttackName" value="Ataque"></label><label>Modificador do ataque<input id="rpgAttackMod" type="number" value="0"></label><label>Dano<input id="rpgDamageNotation" value="1d8+0" placeholder="1d8+3"></label><label>Defesa / CA<input id="rpgTargetDefense" type="number" value="10"></label><label>Observação<input id="rpgAttackNotes" maxlength="500" placeholder="Ex.: espada longa"></label></div><div class="rpgAttackPreview" id="rpgAttackPreview">A chance de acerto será calculada sobre um d20 contra a defesa do alvo.</div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="rpgResolveAttack">Rolar ataque e aplicar</button></div>`);
    const attacker=$('rpgAttackAttacker'),target=$('rpgAttackTarget'),def=$('rpgTargetDefense'),mod=$('rpgAttackMod'),preview=$('rpgAttackPreview');
    const sync=()=>{const t=combatants.find(x=>x.id===target.value);def.value=def.value==='10'||!def.value?defenseFor(t):def.value;const chance=hitChance(Number(mod.value||0),Number(def.value||10));preview.innerHTML=`Chance calculada: <b>${chance}%</b> · d20 + ${Number(mod.value||0)} contra CA <b>${Number(def.value||10)}</b>. Natural 1 falha e natural 20 acerta.`};
    target.onchange=()=>{def.value=String(defenseFor(combatants.find(x=>x.id===target.value)));sync()};mod.oninput=sync;def.oninput=sync;sync();
    $('rpgResolveAttack').onclick=async()=>{
      const a=combatants.find(x=>x.id===attacker.value),t=combatants.find(x=>x.id===target.value);if(!a||!t||a.id===t.id)return toast('Escolha atacante e alvo diferentes.','error');
      const attack=d20(),attackMod=Number(mod.value||0),defense=Number(def.value||10),chance=hitChance(attackMod,defense),critical=attack===20,hit=critical||(attack!==1&&attack+attackMod>=defense);const dmg=parseDice($('rpgDamageNotation').value);if(!dmg)return toast('Use uma expressão de dano como 1d8+3.','error');
      const total=hit?(critical?dmg.total*2:dmg.total):0;const button=$('rpgResolveAttack');button.disabled=true;
      const rpc=await sb.rpc('resolve_combat_attack',{p_encounter_id:encounter.id,p_attacker_id:a.id,p_target_id:t.id,p_action_name:$('rpgAttackName').value.trim()||'Ataque',p_attack_notation:'1d20',p_attack_roll:attack,p_attack_modifier:attackMod,p_target_defense:defense,p_hit_chance:chance,p_hit:hit,p_critical:critical,p_damage_notation:$('rpgDamageNotation').value.trim(),p_damage_roll:dmg.rolls.reduce((x,y)=>x+y,0),p_damage_bonus:dmg.bonus,p_damage_total:total,p_notes:$('rpgAttackNotes').value.trim()||null});
      if(rpc.error){button.disabled=false;return toast(rpc.error.message||'Não foi possível aplicar o ataque.','error');}
      const action=rpc.data;closeModal();
      try{if(mp.actionChannel)await mp.actionChannel.send({type:'broadcast',event:'combat_action',payload:{campaign_id:campaignId(),encounter_id:encounter.id,action}});}catch(e){}
      toast(hit?(critical?'CRÍTICO! '+a.name+' causou '+total+' de dano.':a.name+' acertou e causou '+total+' de dano.'):(a.name+' errou o ataque.'),hit?'ok':'error');
      renderActionLog();
    };
  }

  async function connectActions(){
    const c=campaignId();if(!c)return;
    if(mp.actionCampaign===c&&mp.actionChannel)return;
    if(mp.actionChannel)await sb.removeChannel(mp.actionChannel).catch(()=>{});
    const ch=sb.channel(`rpg-hub-combat-actions-${c}`,{config:{private:true}});
    ch.on('broadcast',{event:'combat_action'},async({payload})=>{
      if(payload?.action?.created_by===state.user?.id)return;
      if(payload?.action?.encounter_id){renderActionLog();window.dispatchEvent(new CustomEvent('rpg:database-change',{detail:{table:'combat_actions',operation:'INSERT',record:payload.action}}));}
    });
    ch.subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('Combate realtime:',status)});
    mp.actionChannel=ch;mp.actionCampaign=c;
  }

  function injectActionUI(){
    const mount=$('rpgCombatMount');if(!mount||state?.view!=='combat')return;
    if(mp.observer===null){
      mp.observer=new MutationObserver(()=>{if(state?.view==='combat'){clearTimeout(mp.poll);mp.poll=setTimeout(()=>renderActionLog(),80)}});
      mp.observer.observe(mount,{childList:true,subtree:false});
    }
    renderActionLog();
  }

  async function init(){
    if(typeof state==='undefined'||typeof sb==='undefined'){setTimeout(init,250);return;}
    injectStyles();
    await connectPresence();
    await connectActions();
    renderPresence();
    setInterval(async()=>{
      if(!state?.campaign)return;
      await connectPresence();await connectActions();updatePresenceView();renderPresence();
      if(state.view==='combat')injectActionUI();
    },2500);
    document.addEventListener('click',e=>{if(e.target.closest('[data-view]')||e.target.closest('[data-mobile-view]'))setTimeout(updatePresenceView,50)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
