/* RPG HUB — combat rules engine */
(()=> {
  'use strict';
  const list=v=>String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const uniq=a=>[...new Set(a)];
  const stateOf=r=>{
    const s=r?.rules_state&&typeof r.rules_state==='object'?r.rules_state:{};
    return {
      resistances:uniq(list(s.resistances)),
      immunities:uniq(list(s.immunities)),
      vulnerabilities:uniq(list(s.vulnerabilities)),
      saves:s.saves&&typeof s.saves==='object'?s.saves:{},
      conditions:Array.isArray(s.conditions)?s.conditions:[],
      action_costs:s.action_costs&&typeof s.action_costs==='object'?s.action_costs:{}
    };
  };
  const PRESETS={
    generic:{name:'Genérico',abilityActions:true,weaponDamage:true,movementUnits:6,criticalMultiplier:2},
    dnd5e:{name:'D&D 5e',abilityActions:true,weaponDamage:true,movementUnits:6,criticalMultiplier:2},
    pathfinder2e:{name:'Pathfinder 2e',abilityActions:true,weaponDamage:true,movementUnits:6,criticalMultiplier:2},
    tormenta20:{name:'Tormenta 20',abilityActions:true,weaponDamage:true,movementUnits:6,criticalMultiplier:2}
  };
  function preset(name){return PRESETS[String(name||'generic').toLowerCase()]||PRESETS.generic}
  function multiplier(r,type){
    const t=String(type||'physical').trim().toLowerCase(),s=stateOf(r);
    if(s.immunities.includes(t))return 0;
    if(s.vulnerabilities.includes(t))return 2;
    if(s.resistances.includes(t))return .5;
    return 1;
  }
  function applyDamage(r,raw,type){
    const m=multiplier(r,type);
    return {raw:Number(raw)||0,multiplier:m,total:Math.max(0,Math.floor((Number(raw)||0)*m)),type:String(type||'physical').toLowerCase(),immune:m===0};
  }
  function addCondition(r,name,duration=0,source=null){
    const s=stateOf(r),key=String(name||'').trim();
    if(!key)return s.conditions;
    const next=s.conditions.filter(c=>String(c.name||'').toLowerCase()!==key.toLowerCase());
    next.push({name:key,remaining_turns:Math.max(0,Number(duration)||0),source:source||null,applied_at:new Date().toISOString()});
    return next;
  }
  function removeCondition(r,name){
    const s=stateOf(r);
    return s.conditions.filter(c=>String(c.name||'').toLowerCase()!==String(name||'').trim().toLowerCase());
  }
  function tick(r){
    const s=stateOf(r),expired=[];
    const conditions=s.conditions.map(c=>{
      const rem=Math.max(0,Number(c.remaining_turns)||0);
      if(rem===0)return c;
      const next=rem-1;
      if(next<=0){expired.push(c.name);return null;}
      return {...c,remaining_turns:next};
    }).filter(Boolean);
    return {rules_state:{...s,conditions},expired};
  }
  function saveBonus(r,ability){
    return Number(stateOf(r).saves?.[String(ability||'').toLowerCase()]||0);
  }
  function rollSave(r,ability,dc){
    const d20=(crypto.getRandomValues(new Uint32Array(1))[0]%20)+1,bonus=saveBonus(r,ability),total=d20+bonus;
    return {d20,bonus,total,dc:Number(dc)||0,success:total>=Number(dc)};
  }
  async function persist(id,payload){
    const sb=window.rpgSupabase;
    const q=await sb.from('combatants').update(payload).eq('id',id).select('*').maybeSingle();
    if(q.error)throw q.error;
    if(!q.data)throw new Error('Não foi possível confirmar as regras do combatente.');
    return q.data;
  }
  function configureModal(r,showModal,esc){
    const s=stateOf(r);
    showModal(
      '<div class="modalHeader"><div><div class="eyebrow">REGRAS</div><h3>'+esc(r.name)+'</h3><p class="modalHint">Tipos separados por vírgula: fogo, frio, ácido, elétrico, psíquico, físico...</p></div><button class="closeButton" data-close>×</button></div>'+
      '<label>Resistências<input id="ruleRes" value="'+esc(s.resistances.join(', '))+'"></label>'+
      '<label>Imunidades<input id="ruleImm" value="'+esc(s.immunities.join(', '))+'"></label>'+
      '<label>Vulnerabilidades<input id="ruleVul" value="'+esc(s.vulnerabilities.join(', '))+'"></label>'+
      '<label>Salvamentos <span class="optional">JSON</span><input id="ruleSave" value=\''+esc(JSON.stringify(s.saves))+'\' placeholder=\'{"destreza":2,"fortitude":3}\'></label>'+
      '<div class="formGrid"><label>Ações por turno<input id="ruleActions" type="number" min="0" value="'+Number(r.actions_available??1)+'"></label><label>Reações por rodada<input id="ruleReactions" type="number" min="0" value="'+Number(r.reactions_available??1)+'"></label><label>Movimento<input id="ruleMove" type="number" min="0" value="'+Number(r.movement_remaining??0)+'"></label></div>'+
      '<div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="ruleSaveBtn">Salvar regras</button></div>'
    );
    $('ruleSaveBtn').onclick=async()=>{
      let saves={};
      try{saves=JSON.parse($('ruleSave').value||'{}');if(!saves||typeof saves!=='object'||Array.isArray(saves))throw 0;}catch(_){return window.toast?.('Salvamentos devem estar em JSON válido.','error')}
      const payload={
        rules_state:{...s,resistances:list($('ruleRes').value),immunities:list($('ruleImm').value),vulnerabilities:list($('ruleVul').value),saves},
        actions_available:Math.max(0,Number($('ruleActions').value||0)),
        reactions_available:Math.max(0,Number($('ruleReactions').value||0)),
        movement_remaining:Math.max(0,Number($('ruleMove').value||0))
      };
      try{const saved=await persist(r.id,payload);window.dispatchEvent(new CustomEvent('rpg:combat-rules-updated',{detail:saved}));window.closeModal?.();window.toast?.('Regras salvas.')}catch(err){window.toast?.(err.message||'Não foi possível salvar as regras.','error')}
    };
  }
  window.rpgCombatRules={stateOf,multiplier,applyDamage,addCondition,removeCondition,tick,saveBonus,rollSave,configureModal,preset,PRESETS};
})();