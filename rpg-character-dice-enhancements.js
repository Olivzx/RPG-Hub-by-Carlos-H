(() => {
  'use strict';

  const CUSTOM_DICE_KEY = 'rpgHub.customDice.v1';
  const STANDARD_SIDES = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,20,24,30,32,40,50,60,80,90,100,120,200,500,1000];

  function getCustomDice() {
    try {
      const raw = JSON.parse(localStorage.getItem(CUSTOM_DICE_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(x => Number(x.sides) >= 2 && Number(x.sides) <= 1000) : [];
    } catch (_) {
      return [];
    }
  }

  function saveCustomDice(items) {
    localStorage.setItem(CUSTOM_DICE_KEY, JSON.stringify(items.slice(0, 30)));
  }

  function enhanceDiceBuilder() {
    const select = $('diceSides');
    const presetRow = document.querySelector('.dicePresetRow');
    if (!select || !presetRow) return;

    if (!select.dataset.rpgEnhanced) {
      const current = select.value || '20';
      const customItems = getCustomDice();
      const values = new Map();
      Array.from(select.options).forEach(option => values.set(String(option.value), option.textContent));
      STANDARD_SIDES.forEach(sides => {
        if (!values.has(String(sides))) values.set(String(sides), 'd' + sides);
      });
      customItems.forEach(item => {
        values.set(String(item.sides), 'd' + item.sides + (item.name ? ' · ' + item.name : ''));
      });
      select.innerHTML = Array.from(values.entries()).map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join('');
      select.value = values.has(current) ? current : '20';
      select.dataset.rpgEnhanced = 'true';
    }

    if ($('customDiceBuilder')) return;

    const panel = document.createElement('div');
    panel.id = 'customDiceBuilder';
    panel.className = 'customDiceBuilder';
    panel.innerHTML = `
      <div class="customDiceBuilderHead">
        <div><span class="eyebrow">DADOS PERSONALIZADOS</span><b>Crie seu próprio dado</b><small>Escolha qualquer quantidade de faces entre 2 e 1000 e salve como atalho.</small></div>
        <span class="customDiceBadge">LIVRE</span>
      </div>
      <div class="customDiceBuilderControls">
        <label>Faces<input id="customDiceSides" type="number" min="2" max="1000" value="20" inputmode="numeric"></label>
        <label>Nome do dado <span class="optional">(opcional)</span><input id="customDiceName" maxlength="40" placeholder="Ex.: Dado de Sorte"></label>
        <button id="useCustomDice" class="softButton">Usar dado</button>
        <button id="saveCustomDice" class="primarySmall">Salvar dado</button>
      </div>
      <div id="customDicePresets" class="customDicePresets"></div>`;
    presetRow.insertAdjacentElement('afterend', panel);

    const renderCustomPresets = () => {
      const wrap = $('customDicePresets');
      if (!wrap) return;
      const items = getCustomDice();
      wrap.innerHTML = items.length
        ? items.map((item, index) => `<div class="customDicePreset"><button data-custom-dice-index="${index}"><span>d${item.sides}</span><small>${escapeHtml(item.name || 'Dado personalizado')}</small></button><button class="customDiceDelete" data-custom-dice-delete="${index}" title="Remover">×</button></div>`).join('')
        : '<span class="customDiceEmpty">Seus dados personalizados salvos aparecerão aqui.</span>';

      wrap.querySelectorAll('[data-custom-dice-index]').forEach(button => {
        button.onclick = () => {
          const item = getCustomDice()[Number(button.dataset.customDiceIndex)];
          if (!item) return;
          ensureDiceOption(item.sides, item.name);
          select.value = String(item.sides);
          syncDiceBuilder();
        };
      });
      wrap.querySelectorAll('[data-custom-dice-delete]').forEach(button => {
        button.onclick = () => {
          const itemsNow = getCustomDice();
          itemsNow.splice(Number(button.dataset.customDiceDelete), 1);
          saveCustomDice(itemsNow);
          renderCustomPresets();
        };
      });
    };

    const ensureDiceOption = (sides, name) => {
      const value = String(Math.min(1000, Math.max(2, Number(sides) || 20)));
      let option = Array.from(select.options).find(o => o.value === value);
      if (!option) {
        option = document.createElement('option');
        option.value = value;
        select.appendChild(option);
      }
      option.textContent = 'd' + value + (name ? ' · ' + name : '');
      return option;
    };

    $('useCustomDice').onclick = () => {
      const sides = Math.min(1000, Math.max(2, Number($('customDiceSides').value) || 20));
      const name = $('customDiceName').value.trim();
      ensureDiceOption(sides, name);
      select.value = String(sides);
      $('customDiceSides').value = sides;
      syncDiceBuilder();
    };

    $('saveCustomDice').onclick = () => {
      const sides = Math.min(1000, Math.max(2, Number($('customDiceSides').value) || 20));
      const name = $('customDiceName').value.trim() || 'Dado d' + sides;
      const items = getCustomDice().filter(item => Number(item.sides) !== sides);
      items.unshift({ sides, name });
      saveCustomDice(items);
      ensureDiceOption(sides, name);
      select.value = String(sides);
      syncDiceBuilder();
      renderCustomPresets();
      toast('Dado personalizado salvo: d' + sides);
    };

    renderCustomPresets();
  }

  function injectSafeRoomRotateControls() {
    if (!canEdit()) return;
    document.querySelectorAll('#roomLayer .room').forEach(roomEl => {
      if (roomEl.querySelector('.roomRotateControl')) return;
      const id = roomEl.dataset.roomId;
      const roomData = state.rooms.find(item => item.id === id);
      if (!roomData) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'roomRotateControl';
      button.title = 'Girar 15° (Shift = -15°)';
      button.textContent = '↻';
      button.addEventListener('pointerdown', event => { event.preventDefault(); event.stopPropagation(); });
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof rotateRoomDirectly === 'function') rotateRoomDirectly(id, event.shiftKey ? -15 : 15);
        else if (typeof broadcastRoomRotate === 'function') safeRotateRoom(id, event.shiftKey ? -15 : 15);
      });
      roomEl.appendChild(button);
    });
  }

  async function safeRotateRoom(id, delta) {
    if (!canEdit()) return;
    const room = state.rooms.find(item => item.id === id);
    if (!room) return;
    let next = (Number(room.rotation) || 0) + Number(delta || 15);
    while (next > 180) next -= 360;
    while (next < -180) next += 360;
    const result = await sb.from('rooms').update({ rotation: next }).eq('id', id).select().single();
    if (result.error) { toast(result.error.message || 'Não foi possível rotacionar o cômodo.', 'error'); return; }
    state.rooms = state.rooms.map(item => item.id === id ? result.data : item);
    await broadcastRoomRotate({ room_id: id, rotation: next });
    renderTable();
    setSave('Rotação do cômodo salva');
  }

  function repairRoomRenderer() {
    if (typeof window.renderTable !== 'function') return;
    const current = window.renderTable;
    const base = current.__base || current;
    if (base.__rpgSafeRoomBase) return;
    const safe = function () {
      base();
      injectSafeRoomRotateControls();
    };
    safe.__rpgSafeRoomBase = true;
    safe.__base = base;
    window.renderTable = safe;
  }

  function improveCharacterSheetModal() {
    const modal = $('modalCard');
    if (!modal) return;
    if (modal.querySelector('#dynamicCharacterFields')) {
      modal.classList.add('characterSheetModal');
      modal.classList.add('wide');
      const header = modal.querySelector('.modalHeader');
      if (header && !header.querySelector('.characterSheetIcon')) {
        const icon = document.createElement('span');
        icon.className = 'characterSheetIcon';
        icon.textContent = '♙';
        header.prepend(icon);
      }
      const fields = modal.querySelector('#dynamicCharacterFields');
      if (fields && !fields.querySelector('.characterSheetSectionLabel')) {
        const label = document.createElement('div');
        label.className = 'characterSheetSectionLabel';
        label.innerHTML = '<span>INFORMAÇÕES DA FICHA</span><small>Preencha os atributos e dados da campanha.</small>';
        fields.prepend(label);
      }
    }
  }

  function wrapCharacterModal() {
    if (typeof window.openCharacterModal !== 'function' || window.openCharacterModal.__rpgCharacterEnhanced) return;
    const original = window.openCharacterModal;
    const enhanced = async function (id) {
      const result = original(id);
      await Promise.resolve(result);
      setTimeout(improveCharacterSheetModal, 0);
      return result;
    };
    enhanced.__rpgCharacterEnhanced = true;
    enhanced.__base = original;
    window.openCharacterModal = enhanced;
  }

  function injectStyles() {
    if ($('rpgCharacterDiceEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'rpgCharacterDiceEnhancementStyles';
    style.textContent = `
      .customDiceBuilder{margin-top:12px;border:1px solid #272e3a;border-radius:14px;background:linear-gradient(135deg,#10151d,#0c1016);padding:14px}
      .customDiceBuilderHead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:12px}
      .customDiceBuilderHead b{display:block;margin-top:5px;color:#e2e5eb;font-size:11px}
      .customDiceBuilderHead small{display:block;margin-top:4px;color:#697384;font-size:9px;line-height:1.5}
      .customDiceBadge{border:1px solid #40396d;background:#19162d;color:#aaa0e8;border-radius:999px;padding:5px 8px;font-size:8px;letter-spacing:.06em}
      .customDiceBuilderControls{display:grid;grid-template-columns:120px minmax(180px,1fr) auto auto;gap:9px;align-items:end}
      .customDiceBuilderControls label{display:grid;gap:5px;color:#778091;font-size:9px}
      .customDiceBuilderControls input{width:100%;box-sizing:border-box}
      .customDicePresets{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .customDicePreset{display:flex;border:1px solid #292f3a;border-radius:9px;overflow:hidden;background:#0f141b}
      .customDicePreset button{border:0;background:transparent;color:#aeb5c1;padding:7px 9px;font-size:8px;cursor:pointer}
      .customDicePreset button:first-child{display:flex;flex-direction:column;align-items:flex-start;gap:2px}
      .customDicePreset button:first-child span{color:#d3ceff;font-weight:700}
      .customDicePreset button:first-child small{color:#687282}
      .customDicePreset .customDiceDelete{border-left:1px solid #292f3a;color:#777f8d;padding:0 8px}
      .customDicePreset .customDiceDelete:hover{color:#ff9aa9;background:#21141a}
      .customDiceEmpty{color:#5f6877;font-size:8px;padding:4px}
      .characterSheetModal{max-width:min(1080px,94vw)!important;background:linear-gradient(145deg,#111722,#0b0f15)!important;border:1px solid #2b3341!important;box-shadow:0 25px 90px rgba(0,0,0,.58)!important}
      .characterSheetModal .modalHeader{display:grid!important;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;padding-bottom:15px;margin-bottom:14px;border-bottom:1px solid #262d39}
      .characterSheetIcon{width:40px;height:40px;display:grid;place-items:center;border:1px solid #403a70;border-radius:12px;background:#19172b;color:#aaa0ff;font-size:19px}
      .characterSheetModal .dynamicCharacterFields{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px!important}
      .characterSheetSectionLabel{grid-column:1/-1;padding:8px 2px 2px}
      .characterSheetSectionLabel span{display:block;color:#8e84d8;font-size:8px;letter-spacing:.08em}
      .characterSheetSectionLabel small{display:block;margin-top:4px;color:#626d7d;font-size:8px}
      .characterSheetModal .dynamicField,.characterSheetModal .dynamicCheck{margin:0!important;padding:11px!important;border:1px solid #252d39;border-radius:11px;background:#0c1118;min-width:0}
      .characterSheetModal .dynamicField:focus-within{border-color:#6258a0;box-shadow:0 0 0 2px rgba(125,109,224,.08)}
      .characterSheetModal .dynamicField input,.characterSheetModal .dynamicField select,.characterSheetModal .dynamicField textarea{margin-top:6px}
      .characterSheetModal .dynamicField textarea{min-height:100px;resize:vertical}
      .characterSheetModal .dynamicCheck{display:flex!important;align-items:center;gap:8px;color:#b5bbc5}
      .characterSheetModal .characterAssign{padding:11px;border:1px solid #252d39;border-radius:11px;background:#0c1118;margin-bottom:11px}
      .characterSheetModal .modalActions{position:sticky;bottom:-1px;margin:18px -20px -20px;padding:14px 20px;background:linear-gradient(180deg,rgba(11,15,21,.82),#0b0f15 35%);border-top:1px solid #252d39;z-index:5}
      @media(max-width:700px){.customDiceBuilderControls{grid-template-columns:1fr 1fr}.customDiceBuilderControls button{width:100%}.characterSheetModal .dynamicCharacterFields{grid-template-columns:1fr!important}.characterSheetModal .modalActions{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}}
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyles();
    repairRoomRenderer();
    wrapCharacterModal();
    enhanceDiceBuilder();
    setTimeout(() => { repairRoomRenderer(); enhanceDiceBuilder(); }, 250);
    setTimeout(improveCharacterSheetModal, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
