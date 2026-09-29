/* RPG HUB — campaign ruleset configuration */
(()=>{'use strict';
const api=()=>window.rpgSupabase,st=()=>window.state||{},master=()=>typeof window.canEdit==='function'&&window.canEdit();
const esc=v=>typeof window.escapeHtml==='function'?window.escapeHtml(v):String(v??'');
async function open(){
 if(!master()||!st().campaign?.id)return;
 const q=await api().from('campaign_rulesets').select('*').eq('campaign_id',st().campaign.id).maybeSingle();
 if(q.error)return window.toast?.(q.error.message,'error');
 const row=q.data||{system:'generic',config:{}};
 const opts=Object.entries(window.rpgCombatRules?.PRESETS||{}).map(([k,v])=>'<option value="'+k+'" '+(row.system===k?'selected':'')+'>'+esc(v.name)+'</option>').join('');
 window.showModal?.('<div class="modalHeader"><div><div class="eyebrow">REGRAS DA CAMPANHA</div><h3>Sistema de RPG</h3><p class="modalHint">O perfil define a base de ações, dano crítico e deslocamento. Regras individuais continuam configuráveis por combatente.</p></div><button class="closeButton" data-close>×</button></div><label>Sistema<select id="campaignRulesSystem">'+opts+'</select></label><div class="formGrid"><label>Deslocamento base<input id="campaignRulesMove" type="number" min="0" step=".5" value="'+Number(row.config?.movementUnits??window.rpgCombatRules?.preset(row.system).movementUnits??6)+'"></label><label>Multiplicador crítico<input id="campaignRulesCrit" type="number" min="1" step=".5" value="'+Number(row.config?.criticalMultiplier??window.rpgCombatRules?.preset(row.system).criticalMultiplier??2)+'"></label></div><div class="modalActions"><button class="softButton" data-close>Cancelar</button><button class="primarySmall" id="campaignRulesSave">Salvar regras</button></div>');
 $('campaignRulesSave').onclick=async()=>{
   const system=$('campaignRulesSystem').value,config={movementUnits:Math.max(0,Number($('campaignRulesMove').value||0)),criticalMultiplier:Math.max(1,Number($('campaignRulesCrit').value||2))};
   const payload={id:row.id||crypto.randomUUID(),campaign_id:st().campaign.id,system,config,updated_by:st().user.id,updated_at:new Date().toISOString()};
   const x=await api().from('campaign_rulesets').upsert(payload,{onConflict:'campaign_id'}).select('*').maybeSingle();
   if(x.error)return window.toast?.(x.error.message,'error');
   window.rpgCampaignRules={...x.data};
   window.closeModal?.();window.toast?.('Regras da campanha salvas.');
 };
}
window.rpgCampaignRulesOpen=open;
})();