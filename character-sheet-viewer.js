(() => {
  'use strict';

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const first = (obj, keys, fallback='') => {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') return obj[key];
    }
    return fallback;
  };
  const arr = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return parsed; } catch (_) {}
      return value.split(/\n|,|;/).map(v => v.trim()).filter(Boolean);
    }
    return [];
  };
  function characterImage(c) { return first(c, ['avatar_url','avatar','image_url','photo_url','photo','portrait_url','portrait','foto_url','foto'], ''); }
  function customFields(c) { const raw = first(c, ['custom_fields','fields','extra_fields','metadata'], null); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []; return Object.entries(raw).filter(([_,v]) => v !== null && v !== undefined && String(v).trim() !== '').map(([k,v]) => [k,v]); }
  function weapons(c) { return arr(first(c, ['weapons','weapon','armas','arma','armamentos','weapon_list'], '')); }
  function equipment(c) { return arr(first(c, ['equipment','equipments','equipamentos','inventory','inventario','items','itens','gear'], '')); }
  function itemLabel(item) { if (typeof item === 'string') return item; if (!item || typeof item !== 'object') return String(item ?? ''); return first(item, ['name','nome','title','item','description','descricao'], 'Item'); }
  function statCard(label, value, tone='') { return `<div class="rpg-sheet-stat ${tone}"><span>${esc(label)}</span><b>${esc(value || '—')}</b></div>`; }
  function itemCard(title) { return `<div class="rpg-sheet-item"><div class="rpg-sheet-item-icon">◆</div><div><b>${esc(title)}</b></div></div>`; }

  function renderCharacterSheet(c) {
    const name = first(c,['name','nome'],'Personagem');
    const className = first(c,['class_name','class','classe','role','function','funcao','funcção'],'Sem classe definida');
    const origin = first(c,['origin','origem','ancestry','ancestralidade'],'Sem origem definida');
    const level = first(c,['level','nivel','nível'],1);
    const hp = first(c,['current_hp','hp_current','vida_atual','vidaAtual','hp','vida'],'—');
    const maxHp = first(c,['max_hp','hp_max','vida_maxima','vidaMaxima','maxHealth','vida_max'],'—');
    const defense = first(c,['defense','defesa','armor_class','armorClass','ca'],'—');
    const luck = first(c,['luck','sorte'],'0');
    const avatar = characterImage(c);
    const complement = first(c,['complementary_sheet','complementary','ficha_complementar','complementar','notes','observations','observacoes','observações'],'');
    const strength = first(c,['strength','forca','força'],'—');
    const dexterity = first(c,['dexterity','destreza'],'—');
    const constitution = first(c,['constitution','constituicao','constituição'],'—');
    const intelligence = first(c,['intelligence','inteligencia','inteligência'],'—');
    const wisdom = first(c,['wisdom','sabedoria'],'—');
    const charisma = first(c,['charisma','carisma'],'—');
    const weaponsList = weapons(c), equipmentList = equipment(c), extras = customFields(c);
    const modal = document.getElementById('modalCard'); if (!modal) return;
    const avatarMarkup = avatar ? `<img src="${esc(avatar)}" alt="${esc(name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"> <span class="rpg-sheet-avatar-fallback">${esc(name.charAt(0).toUpperCase())}</span>` : `<span class="rpg-sheet-avatar-fallback">${esc(name.charAt(0).toUpperCase())}</span>`;
    modal.className = 'modalCard wide rpg-character-view-modal';
    modal.innerHTML = `<div class="rpg-sheet-shell">
      <header class="rpg-sheet-header"><div class="rpg-sheet-title-wrap"><span class="rpg-sheet-kicker">FICHA DE PERSONAGEM</span><h2>${esc(name)}</h2><p>Nível ${esc(level)} · ${esc(className)} · ${esc(origin)}</p></div><div class="rpg-sheet-header-actions"><span class="rpg-sheet-status">Ficha ativa</span><button type="button" class="primarySmall rpg-sheet-edit-header" data-sheet-edit>Editar ficha</button><button type="button" class="softButton" data-sheet-close>Fechar</button></div></header>
      <div class="rpg-sheet-layout">
        <aside class="rpg-sheet-left"><div class="rpg-sheet-avatar">${avatarMarkup}</div><div class="rpg-sheet-section-title">COMBATE</div><div class="rpg-sheet-stats">${statCard('VIDA',`${hp} / ${maxHp}`,'hp')}${statCard('DEFESA',defense)}${statCard('SORTE',luck)}</div><div class="rpg-sheet-section-title">ATRIBUTOS</div><div class="rpg-sheet-attributes">${statCard('Força',strength)}${statCard('Destreza',dexterity)}${statCard('Constituição',constitution)}${statCard('Inteligência',intelligence)}${statCard('Sabedoria',wisdom)}${statCard('Carisma',charisma)}</div></aside>
        <main class="rpg-sheet-right">
          <section class="rpg-sheet-panel"><div class="rpg-sheet-panel-head"><div><h3>Informações da ficha</h3><small>Dados principais e informações complementares</small></div></div><div class="rpg-sheet-info-grid"><div><span>CLASSE / FUNÇÃO</span><b>${esc(className)}</b></div><div><span>ORIGEM / ANCESTRALIDADE</span><b>${esc(origin)}</b></div></div></section>
          <section class="rpg-sheet-panel"><div class="rpg-sheet-panel-head"><div><h3>Armas</h3><small>Armas utilizadas pelo personagem</small></div><span class="rpg-sheet-count">${weaponsList.length}</span></div><div class="rpg-sheet-items">${weaponsList.length ? weaponsList.map(x => itemCard(itemLabel(x))).join('') : '<div class="rpg-sheet-empty">Nenhuma arma registrada.</div>'}</div></section>
          <section class="rpg-sheet-panel"><div class="rpg-sheet-panel-head"><div><h3>Itens & equipamentos</h3><small>Inventário utilizado pelo personagem</small></div><span class="rpg-sheet-count">${equipmentList.length}</span></div><div class="rpg-sheet-items">${equipmentList.length ? equipmentList.map(x => itemCard(itemLabel(x))).join('') : '<div class="rpg-sheet-empty">Nenhum equipamento registrado.</div>'}</div></section>
          <section class="rpg-sheet-panel rpg-sheet-text-panel"><div class="rpg-sheet-panel-head"><div><h3>Ficha complementar</h3><small>História, personalidade, habilidades e observações</small></div></div><p>${esc(complement || 'Nenhuma informação complementar registrada.').replace(/\n/g,'<br>')}</p></section>
          ${extras.length ? `<section class="rpg-sheet-panel"><div class="rpg-sheet-panel-head"><div><h3>Informações adicionais</h3><small>Campos personalizados desta campanha</small></div></div><div class="rpg-sheet-extra-grid">${extras.map(([k,v]) => `<div><span>${esc(k)}</span><b>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</b></div>`).join('')}</div></section>` : ''}
        </main>
      </div>
    </div>`;
    modal.querySelectorAll('[data-sheet-close]').forEach(btn => btn.addEventListener('click', () => { if (typeof closeModal === 'function') closeModal(); }));
    modal.querySelector('[data-sheet-edit]')?.addEventListener('click', () => { if (typeof openCharacterModal === 'function') openCharacterModal(c.id); });
  }

  function resolveCharacter(button) {
    const grid = document.getElementById('charactersGrid'); if (!grid || !Array.isArray(state.characters)) return null;
    let node = button;
    for (let i=0; i<5 && node; i++, node=node.parentElement) { const id = node.dataset?.characterId || node.dataset?.id; if (id) { const found = state.characters.find(c => String(c.id) === String(id)); if (found) return found; } }
    const text = button.closest('.card,.characterCard,.character-card,article,div')?.textContent || '';
    const exact = state.characters.find(c => text.includes(String(c.name || ''))); if (exact) return exact;
    const buttons = Array.from(grid.querySelectorAll('button')).filter(b => /abrir ficha|ver ficha/i.test(b.textContent || '')); const index = buttons.indexOf(button); return index >= 0 ? state.characters[index] : null;
  }

  function bind() {
    const grid = document.getElementById('charactersGrid'); if (!grid) return;
    grid.querySelectorAll('button').forEach(button => { if (!/abrir ficha|ver ficha/i.test(button.textContent || '') || button.dataset.rpgSheetBound) return; button.dataset.rpgSheetBound='true'; button.addEventListener('click', event => { event.preventDefault(); event.stopImmediatePropagation(); const character=resolveCharacter(button); if(!character){if(typeof toast==='function')toast('Não foi possível localizar esta ficha.','error');return;} if(typeof showModal==='function')showModal('',true); renderCharacterSheet(character); }, true); });
  }

  function injectStyles() {
    if (document.getElementById('rpg-character-sheet-view-style')) return;
    const style=document.createElement('style'); style.id='rpg-character-sheet-view-style'; style.textContent=`
      .rpg-character-view-modal{max-width:min(1280px,96vw)!important;padding:0!important;background:#101620!important;border:1px solid #293241!important;overflow:hidden!important}.rpg-sheet-shell{color:#e7eaf0}.rpg-sheet-header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:28px 30px 24px;border-bottom:1px solid #28303c;background:linear-gradient(135deg,#121925,#0d121a)}.rpg-sheet-kicker{display:block;font-size:9px;letter-spacing:.13em;color:#7f899b;font-weight:700}.rpg-sheet-header h2{margin:8px 0 4px;font-size:30px;letter-spacing:-.04em;color:#f2f4f8}.rpg-sheet-header p{margin:0;color:#8e98aa;font-size:11px}.rpg-sheet-header-actions{display:flex;align-items:center;gap:10px}.rpg-sheet-status{min-width:130px;text-align:center;padding:12px 16px;border:1px solid rgba(148,135,255,.55);border-radius:12px;color:#c7bfff;background:rgba(148,135,255,.06);font-size:10px}.rpg-sheet-edit-header{min-width:120px}.rpg-sheet-layout{display:grid;grid-template-columns:minmax(300px,.72fr) minmax(0,1.5fr);gap:16px;padding:18px;background:#0b1017}.rpg-sheet-left,.rpg-sheet-panel{border:1px solid #293241;border-radius:16px;background:#0d131c}.rpg-sheet-left{padding:20px}.rpg-sheet-avatar{width:166px;height:166px;margin:0 auto 24px;border-radius:50%;border:1px solid #394353;background:#202735;display:grid;place-items:center;overflow:hidden;box-shadow:inset 0 0 0 20px rgba(255,255,255,.025)}.rpg-sheet-avatar img{width:100%;height:100%;object-fit:cover}.rpg-sheet-avatar-fallback{display:grid;place-items:center;width:100%;height:100%;font-size:52px;font-weight:800;color:#a9a0ff}.rpg-sheet-section-title{margin:18px 0 10px;font-size:9px;letter-spacing:.08em;color:#7d8798;font-weight:700}.rpg-sheet-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.rpg-sheet-stat{min-width:0;padding:12px;border:1px solid #2b3442;border-radius:12px;background:#111822}.rpg-sheet-stat span{display:block;font-size:8px;color:#788395;text-transform:uppercase}.rpg-sheet-stat b{display:block;margin-top:7px;font-size:22px;color:#e9ecf3}.rpg-sheet-attributes{display:grid;grid-template-columns:1fr 1fr;gap:10px 18px;padding:4px 8px 8px}.rpg-sheet-attributes .rpg-sheet-stat{border:0;background:transparent;padding:7px 0;display:flex;align-items:center;justify-content:space-between}.rpg-sheet-attributes .rpg-sheet-stat b{margin:0;font-size:13px}.rpg-sheet-right{display:grid;gap:14px;min-width:0}.rpg-sheet-panel{padding:18px}.rpg-sheet-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.rpg-sheet-panel h3{margin:0;font-size:15px;color:#edf0f5}.rpg-sheet-panel small{display:block;margin-top:4px;color:#727e90;font-size:9px}.rpg-sheet-count{min-width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:#181c2a;color:#aaa1ff;font-size:10px}.rpg-sheet-info-grid,.rpg-sheet-extra-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rpg-sheet-info-grid>div,.rpg-sheet-extra-grid>div{padding:14px;border:1px solid #2a3340;border-radius:12px;background:#111822}.rpg-sheet-info-grid span,.rpg-sheet-extra-grid span{display:block;font-size:8px;color:#778294;text-transform:uppercase}.rpg-sheet-info-grid b,.rpg-sheet-extra-grid b{display:block;margin-top:8px;font-size:12px;color:#e0e4eb}.rpg-sheet-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rpg-sheet-item{display:flex;align-items:center;gap:10px;min-width:0;padding:12px;border:1px solid #2a3340;border-radius:12px;background:#111822}.rpg-sheet-item-icon{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;flex:0 0 auto;background:#18152b;border:1px solid #3a3360;color:#9e94ff;font-size:10px}.rpg-sheet-item b{display:block;font-size:10px;color:#e2e6ed;overflow:hidden;text-overflow:ellipsis}.rpg-sheet-empty,.rpg-sheet-text-panel p{color:#788395;font-size:10px;line-height:1.7}.rpg-sheet-text-panel p{margin:0;white-space:normal}
      @media(max-width:850px){.rpg-sheet-header{align-items:flex-start;flex-direction:column}.rpg-sheet-header-actions{width:100%;justify-content:flex-start;flex-wrap:wrap}.rpg-sheet-layout{grid-template-columns:1fr;padding:10px}.rpg-sheet-avatar{width:130px;height:130px}.rpg-sheet-items,.rpg-sheet-info-grid,.rpg-sheet-extra-grid{grid-template-columns:1fr}.rpg-sheet-stats{grid-template-columns:repeat(3,minmax(0,1fr))}.rpg-sheet-header h2{font-size:25px}}@media(max-width:480px){.rpg-sheet-header-actions{display:grid;grid-template-columns:1fr 1fr}.rpg-sheet-status{grid-column:1/-1;width:auto}.rpg-sheet-edit-header,.rpg-sheet-header-actions [data-sheet-close]{width:100%}.rpg-sheet-stats{grid-template-columns:1fr}.rpg-sheet-attributes{grid-template-columns:1fr}.rpg-sheet-header{padding:20px}.rpg-sheet-panel,.rpg-sheet-left{padding:14px}}
    `; document.head.appendChild(style);
  }

  function start(){ injectStyles(); bind(); const grid=document.getElementById('charactersGrid'); if(grid)new MutationObserver(bind).observe(grid,{childList:true,subtree:true}); new MutationObserver(bind).observe(document.body,{childList:true,subtree:true}); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
