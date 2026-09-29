/* RPG HUB — character abilities, spells and inventory */
(() => {
  'use strict';
  const S={channel:null,campaignId:null,observer:null};
  const $=id=>document.getElementById(id);
  const api=()=>window.rpgSupabase;
  const st=()=>window.state||{};
  const master=()=>typeof window.canEdit==='function'&&window.canEdit();
  const esc=v=>typeof window.escapeHtml==='function'?window.escapeHtml(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const toast=(m,t)=>window.toast?.(m,t);

  function injectStyles(){
    if($('rpgLoadoutStyles'))return;
    const s=document.createElement('style');s.id='rpgLoadoutStyles';s.textContent=`
      .rpgLoadoutButton{border:1px solid #3a345d!important;color:#c7c1ff!important;background:#16142a!important}
      .rpgLoadout{display:grid;gap:12px}.rpgLoadoutTabs{display:flex;gap:6px;flex-wrap:wrap}.rpgLoadoutTab{border:1px solid #29313d;background:#10161e;color:#8993a3;border-radius:8px;padding:7px 10px;font-size:8px;cursor:pointer}.rpgLoadoutTab.active{border-color:#7064b8;color:#e5e1ff;background:#1a1730}
      .rpgLoadoutSection{display:grid;gap:8px}.rpgLoadoutList{display:grid;gap:7px;max-height:38vh;overflow:auto}.rpgLoadoutItem{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:10px;border:1px solid #29313d;border-radius:10px;background:#0e141b}.rpgLoadoutItem b{color:#dfe4eb;font-size:9px}.rpgLoadoutItem small{display:block;margin-top:3px;color:#737e8e;font-size:7px;line-height:1.45}.rpgLoadoutActions{display:flex;gap:5px;align-items:start}.rpgLoadoutActions button{border:1px solid #29313d;background:#111720;color:#9da6b4;border-radius:7px;padding:6px 7px;font-size:7px;cursor:pointer}.rpgLoadoutActions .danger{color:#ff9eaa;border-color:#4b2731}.rpgLoadoutForm{display:grid;gap:8px;padding:10px;border:1px solid #29313d;border-radius:10px;background:#0d131a}.rpgLoadoutForm .formGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rpgLoadoutForm label{display:grid;gap:4px;color:#737d8c;font-size:7px}.rpgLoadoutForm input,.rpgLoadoutForm select,.rpgLoadoutForm textarea{width:100%;box-sizing:border-box;border:1px solid #29313d;border-radius:7px;background:#090d13;color:#dfe4eb;padding:7px;font-size:8px}.rpgLoadoutEmpty{padding:18px;text-align:center;color:#687384;font-size:8px;border:1px dashed #29313d;border-radius:10px}.rpgLoadoutBadge{display:inline-flex;margin-left:5px;padding:2px 5px;border:1px solid #363c48;border-radius:999px;color:#9ba5b5;font-size:6px}.rpgLoadoutTitle{display:flex;justify-content:space-between;gap:8px;align-items:center}.rpgLoadoutTitle h4{margin:0;color:#e5e8ed;font-size:10px}.rpgLoadoutTitle button{border:1px solid #3a345d;background:#16142a;color:#c8c1ff;border-radius:7px;padding:6px 8px;font-size:7px;cursor:pointer}
      @media(max-width:600px){.rpgLoadoutForm .formGrid{grid-template-columns:1fr}.rpgLoadoutItem{grid-template-columns:1fr}.rpgLoadoutActions{justify-content:flex-start}}
    `;document.head.appendChild(s);
  }

  function canEditCharacter(c){return master()||c?.player_id===st().user?.id}
  async function rows(characterId){
    const [a,i]=await Promise.all([
      api().from('character_abilities').select('*').eq('character_id',characterId).order('created_at'),
      api().from('character_inventory').select('*').eq('character_id',characterId).order('created_at')
    ]);
    if(a.error)throw a.error;if(i.error)throw i.error;
    return {abilities:a.data||[],inventory:i.data||[]};
  }

  async function log(summary,entityId){
    try{if(typeof window.logCampaignActivity==='function')await window.logCampaignActivity('loadout','character',summary,entityId||null,{source:'character_loadout'});}catch(_){}
  }

  function formAbility(x={}){
    return '<div class="rpgLoadoutForm"><div class="formGrid">'+
      '<label>Nome<input id="loadAbilityName" value="'+esc(x.name||'')+'" placeholder="Ex.: Bola de fogo"></label>'+
      '<label>Categoria<select id="loadAbilityCategory"><option value="ability" '+(x.category==='ability'?'selected':'')+'>Habilidade</option><option value="spell" '+(x.category==='spell'?'selected':'')+'>Magia</option><option value="feature" '+(x.category==='feature'?'selected':'')+'>Característica</option></select></label>'+
      '<label>Ação<select id="loadAbilityAction"><option value="action" '+(x.action_type==='action'?'selected':'')+'>Ação</option><option value="bonus" '+(x.action_type==='bonus'?'selected':'')+'>Ação bônus</option><option value="reaction" '+(x.action_type==='reaction'?'selected':'')+'>Reação</option><option value="free" '+(x.action_type==='free'?'selected':'')+'>Livre</option></select></label>'+
      '<label>Custo<input id="loadAbilityCost" value="'+esc(x.cost||'')+'" placeholder="1 ponto, 1 slot..."></label>'+
      '<label>Fórmula de dano<input id="loadAbilityDamage" value="'+esc(x.damage_formula||'')+'" placeholder="2d6+3"></label>'+
      '<label>Tipo de dano<input id="loadAbilityDamageType" value="'+esc(x.damage_type||'physical')+'" placeholder="fogo"></label>'+
      '<label>Salvamento<input id="loadAbilitySave" value="'+esc(x.save_ability||'')+'" placeholder="destreza"></label>'+
      '<label>CD<input id="loadAbilityDc" type="number" min="0" value="'+Number(x.save_dc||0)+'"></label>'+
      '<label>Usos máximos<input id="loadAbilityUsesMax" type="number" min="0" value="'+Number(x.uses_max||0)+'"></label>'+
      '<label>Usos restantes<input id="loadAbilityUses" type="number" min="0" value="'+Number(x.uses_remaining??x.uses_max??0)+'"></label>'+
      '</div><label>Descrição<textarea id="loadAbilityDescription" rows="3" placeholder="Efeito, alcance e observações...">'+esc(x.description||'')+'</textarea></label><div class="modalActions"><button class="softButton" data-loadout-cancel>Cancelar</button><button class="primarySmall" data-loadout-save-ability>Salvar</button></div></div>';
  }

  function formInventory(x={}){
    return '<div class="rpgLoadoutForm"><div class="formGrid">'+
      '<label>Item<input id="loadItemName" value="'+esc(x.name||'')+'" placeholder="Espada longa"></label>'+
      '<label>Quantidade<input id="loadItemQty" type="number" min="0" value="'+Number(x.quantity||1)+'"></label>'+
      '<label>Peso<input id="loadItemWeight" type="number" min="0" step=".1" value="'+Number(x.weight||0)+'"></label>'+
      '<label>Espaço/equipamento<input id="loadItemSlot" value="'+esc(x.slot||'')+'" placeholder="Mão principal"></label>'+
      '</div><label><input id="loadItemEquipped" type="checkbox" '+(x.equipped?'checked':'')+'> Equipado</label><label>Descrição<textarea id="loadItemDescription" rows="3">'+esc(x.description||'')+'</textarea></label><div class="modalActions"><button class="softButton" data-loadout-cancel>Cancelar</button><button class="primarySmall" data-loadout-save-item>Salvar</button></div></div>';
  }

  async function open(characterId){
    const c=st().characters?.find(x=>x.id===characterId);if(!c)return;
    if(!canEditCharacter(c)){toast('Você só pode abrir o arsenal da sua própria ficha.','error');return}
    let data;try{data=await rows(characterId)}catch(e){toast(e.message||'Não foi possível carregar habilidades e inventário.','error');return}
    let tab='abilities',editing=null,editingType=null;
    const render=()=>{
      const body=tab==='abilities'
        ? '<div class="rpgLoadoutTitle"><h4>Habilidades e magias</h4><button data-loadout-new-ability>+ Nova</button></div><div class="rpgLoadoutList">'+(data.abilities.length?data.abilities.map(x=>'<article class="rpgLoadoutItem"><div><b>'+esc(x.name)+'</b><span class="rpgLoadoutBadge">'+esc(x.category)+'</span><small>'+esc(x.description||'Sem descrição')+(x.damage_formula?' · Dano '+esc(x.damage_formula)+' '+esc(x.damage_type):'')+(x.uses_max?' · Usos '+Number(x.uses_remaining)+'/'+Number(x.uses_max):'')+'</small></div><div class="rpgLoadoutActions">'+(x.uses_max?'<button data-loadout-use="'+x.id+'">Usar</button>':'')+'<button data-loadout-edit-ability="'+x.id+'">Editar</button><button class="danger" data-loadout-del-ability="'+x.id+'">Excluir</button></div></article>').join(''):'<div class="rpgLoadoutEmpty">Nenhuma habilidade ou magia cadastrada.</div>')+'</div>'
        : '<div class="rpgLoadoutTitle"><h4>Inventário e equipamentos</h4><button data-loadout-new-item>+ Novo</button></div><div class="rpgLoadoutList">'+(data.inventory.length?data.inventory.map(x=>'<article class="rpgLoadoutItem"><div><b>'+esc(x.name)+'</b><span class="rpgLoadoutBadge">'+Number(x.quantity)+'x'+(x.equipped?' · equipado':'')+'</span><small>'+esc(x.description||'Sem descrição')+(x.slot?' · '+esc(x.slot):'')+(x.weight?' · '+Number(x.weight)+' peso':'')+'</small></div><div class="rpgLoadoutActions"><button data-loadout-equip="'+x.id+'">'+(x.equipped?'Desequipar':'Equipar')+'</button><button data-loadout-edit-item="'+x.id+'">Editar</button><button class="danger" data-loadout-del-item="'+x.id+'">Excluir</button></div></article>').join(''):'<div class="rpgLoadoutEmpty">Nenhum item cadastrado.</div></div>';
      const form=editing?(editingType==='ability'?formAbility(editing):formInventory(editing)):'';
      $('loadoutBody').innerHTML=body+form;
      $('loadoutBody').querySelectorAll('[data-loadout-new-ability]').forEach(b=>b.onclick=()=>{editing={};editingType='ability';render()});
      $('loadoutBody').querySelectorAll('[data-loadout-new-item]').forEach(b=>b.onclick=()=>{editing={};editingType='item';render()});
      $('loadoutBody').querySelectorAll('[data-loadout-edit-ability]').forEach(b=>b.onclick=()=>{editing=data.abilities.find(x=>x.id===b.dataset.loadoutEditAbility)||{};editingType='ability';render()});
      $('loadoutBody').querySelectorAll('[data-loadout-edit-item]').forEach(b=>b.onclick=()=>{editing=data.inventory.find(x=>x.id===b.dataset.loadoutEditItem)||{};editingType='item';render()});
      $('loadoutBody').querySelectorAll('[data-loadout-cancel]').forEach(b=>b.onclick=()=>{editing=null;editingType=null;render()});
      $('loadoutBody').querySelectorAll('[data-loadout-del-ability]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir esta habilidade?'))return;const q=await api().from('character_abilities').delete().eq('id',b.dataset.loadoutDelAbility);if(q.error)return toast(q.error.message,'error');data.abilities=data.abilities.filter(x=>x.id!==b.dataset.loadoutDelAbility);render();log('Habilidade excluída: '+b.dataset.loadoutDelAbility,characterId)});
      $('loadoutBody').querySelectorAll('[data-loadout-del-item]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este item?'))return;const q=await api().from('character_inventory').delete().eq('id',b.dataset.loadoutDelItem);if(q.error)return toast(q.error.message,'error');data.inventory=data.inventory.filter(x=>x.id!==b.dataset.loadoutDelItem);render();log('Item excluído',characterId)});
      $('loadoutBody').querySelectorAll('[data-loadout-equip]').forEach(b=>b.onclick=async()=>{const item=data.inventory.find(x=>x.id===b.dataset.loadoutEquip);if(!item)return;const q=await api().from('character_inventory').update({equipped:!item.equipped,updated_at:new Date().toISOString()}).eq('id',item.id).select('*').maybeSingle();if(q.error)return toast(q.error.message,'error');const saved=q.data||{...item,equipped:!item.equipped};data.inventory=data.inventory.map(x=>x.id===item.id?saved:x);render();log((saved.equipped?'Equipou ':'Desequipou ')+saved.name,characterId)});
      $('loadoutBody').querySelectorAll('[data-loadout-use]').forEach(b=>b.onclick=async()=>{const x=data.abilities.find(a=>a.id===b.dataset.loadoutUse);if(!x)return;const next=Math.max(0,Number(x.uses_remaining)-1);const q=await api().from('character_abilities').update({uses_remaining:next,updated_at:new Date().toISOString()}).eq('id',x.id).select('*').maybeSingle();if(q.error)return toast(q.error.message,'error');const saved=q.data||{...x,uses_remaining:next};data.abilities=data.abilities.map(a=>a.id===x.id?saved:a);render();await log('Usou '+x.name+' · '+next+'/'+x.uses_max+' usos restantes',characterId);toast(x.name+' usado')});
      $('loadoutBody').querySelectorAll('[data-loadout-save-ability]').forEach(b=>b.onclick=async()=>{
        const payload={campaign_id:st().campaign.id,character_id:characterId,name:$('loadAbilityName').value.trim(),category:$('loadAbilityCategory').value,action_type:$('loadAbilityAction').value,cost:$('loadAbilityCost').value.trim(),damage_formula:$('loadAbilityDamage').value.trim(),damage_type:$('loadAbilityDamageType').value.trim()||'physical',save_ability:$('loadAbilitySave').value.trim(),save_dc:Number($('loadAbilityDc').value||0),uses_max:Math.max(0,Number($('loadAbilityUsesMax').value||0)),uses_remaining:Math.max(0,Number($('loadAbilityUses').value||0)),description:$('loadAbilityDescription').value.trim(),updated_at:new Date().toISOString(),created_by:st().user.id};
        if(!payload.name)return toast('Informe o nome da habilidade.','error');
        const q=editing.id?await api().from('character_abilities').update(payload).eq('id',editing.id).select('*').maybeSingle():await api().from('character_abilities').insert({...payload,id:crypto.randomUUID()}).select('*').maybeSingle();
        if(q.error)return toast(q.error.message,'error');const saved=q.data;if(!saved)return toast('O servidor não confirmou a habilidade.','error');
        const wasEdit=!!editing.id;data.abilities=wasEdit?data.abilities.map(x=>x.id===editing.id?saved:x):[...data.abilities,saved];editing=null;editingType=null;render();await log((wasEdit?'Editou ':'Criou ')+saved.name,characterId);toast('Habilidade salva');
      });
      $('loadoutBody').querySelectorAll('[data-loadout-save-item]').forEach(b=>b.onclick=async()=>{
        const payload={campaign_id:st().campaign.id,character_id:characterId,name:$('loadItemName').value.trim(),quantity:Math.max(0,Number($('loadItemQty').value||1)),weight:Math.max(0,Number($('loadItemWeight').value||0)),slot:$('loadItemSlot').value.trim(),equipped:$('loadItemEquipped').checked,description:$('loadItemDescription').value.trim(),updated_at:new Date().toISOString(),created_by:st().user.id};
        if(!payload.name)return toast('Informe o nome do item.','error');
        const q=editing.id?await api().from('character_inventory').update(payload).eq('id',editing.id).select('*').maybeSingle():await api().from('character_inventory').insert({...payload,id:crypto.randomUUID()}).select('*').maybeSingle();
        if(q.error)return toast(q.error.message,'error');const saved=q.data;if(!saved)return toast('O servidor não confirmou o item.','error');
        const wasEdit=!!editing.id;data.inventory=wasEdit?data.inventory.map(x=>x.id===editing.id?saved:x):[...data.inventory,saved];editing=null;editingType=null;render();await log((wasEdit?'Editou ':'Criou ')+saved.name,characterId);toast('Item salvo');
      });
    };
    window.showModal?.('<div class="modalHeader"><div><div class="eyebrow">PERSONAGEM</div><h3>Habilidades, magias e inventário</h3><p class="modalHint">'+esc(c.name)+'</p></div><button class="closeButton" data-close>×</button></div><div class="rpgLoadout"><div class="rpgLoadoutTabs"><button class="rpgLoadoutTab active" data-loadout-tab="abilities">Habilidades / magias</button><button class="rpgLoadoutTab" data-loadout-tab="inventory">Inventário / equipamento</button></div><div id="loadoutBody"></div></div>',true);
    document.querySelectorAll('[data-loadout-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.loadoutTab;document.querySelectorAll('[data-loadout-tab]').forEach(x=>x.classList.toggle('active',x===b));editing=null;editingType=null;render()});
    render();
  }

  function mountButtons(){
    const grid=$('charactersGrid');if(!grid)return;
    grid.querySelectorAll('[data-edit-character]').forEach(btn=>{
      const id=btn.dataset.editCharacter,card=btn.closest('.dataCard');if(!card||card.querySelector('[data-loadout]'))return;
      const b=document.createElement('button');b.className='rpgLoadoutButton';b.dataset.loadout=id;b.textContent='Habilidades / inventário';b.onclick=()=>open(id);btn.parentElement.appendChild(b);
    });
  }

  async function realtime(){
    const c=st().campaign?.id;if(!c||!api())return;
    if(S.channel&&S.campaignId===c)return;
    if(S.channel)await api().removeChannel(S.channel).catch(()=>{});
    const ch=api().channel('rpg-hub-loadout-'+c,{config:{private:true}});
    ['character_abilities','character_inventory'].forEach(table=>ch.on('postgres_changes',{event:'*',schema:'public',table,filter:'campaign_id=eq.'+c},()=>mountButtons()));
    ch.subscribe((status,error)=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('RPG HUB loadout realtime:',status,error)});
    S.channel=ch;S.campaignId=c;
  }

  function tick(){injectStyles();mountButtons();realtime();if(!S.observer){const g=$('charactersGrid');if(g){S.observer=new MutationObserver(mountButtons);S.observer.observe(g,{childList:true,subtree:true})}}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick,{once:true});else tick();
  setInterval(tick,1800);
})();