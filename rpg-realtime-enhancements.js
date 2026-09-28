(() => {
  'use strict';

  const roomChannelState = {
    channel: null,
    campaignId: null,
    initialized: false,
    poll: null
  };

  function currentCampaignId() {
    return state?.campaign?.id || $('campaignSelect')?.value || null;
  }

  function currentFloorId() {
    return state?.floor || null;
  }

  function roomBelongsToCurrentCampaign(row) {
    return !!row?.floor_id && (state.floors || []).some(function (floor) {
      return floor.id === row.floor_id;
    });
  }

  async function subscribeTableRealtime() {
    const campaignId = currentCampaignId();
    if (!campaignId) {
      roomChannelState.poll = setTimeout(subscribeTableRealtime, 250);
      return;
    }

    if (roomChannelState.campaignId === campaignId && roomChannelState.channel) return;

    if (roomChannelState.channel) {
      await sb.removeChannel(roomChannelState.channel).catch(function () {});
    }

    roomChannelState.campaignId = campaignId;
    const channel = sb.channel('rpg-hub-world-realtime-' + campaignId, { config: { private: true } });

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'rooms'
    }, function (payload) {
      const row = payload.new || payload.old;
      if (!roomBelongsToCurrentCampaign(row)) return;

      if (payload.eventType === 'INSERT' && payload.new) {
        if (!state.rooms.some(function (item) { return item.id === row.id; })) {
          state.rooms.push(row);
        }
        renderTable();
        if (!canEdit()) toast('Novo cômodo disponível: ' + (row.name || 'Cômodo'));
        return;
      }

      if (payload.eventType === 'UPDATE' && payload.new) {
        state.rooms = state.rooms.map(function (item) {
          return item.id === row.id ? payload.new : item;
        });
        if (state.selected?.type === 'room' && state.selected.id === row.id && row.floor_id !== currentFloorId()) {
          state.selected = null;
        }
        renderTable();
        return;
      }

      if (payload.eventType === 'DELETE' && payload.old) {
        state.rooms = state.rooms.filter(function (item) { return item.id !== row.id; });
        if (state.selected?.type === 'room' && state.selected.id === row.id) state.selected = null;
        renderAll();
      }
    });

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'world_entities',
      filter: 'campaign_id=eq.' + campaignId
    }, function (payload) {
      const row = payload.new || payload.old;
      if (!row?.id) return;

      if (payload.eventType === 'INSERT' && payload.new) {
        if (!state.entities.some(function (item) { return item.id === row.id; })) {
          state.entities.push(row);
        }
        renderTable();
        if (!canEdit() && row.entity_kind === 'character') {
          toast((row.display_name || 'Personagem') + ' entrou na mesa');
        }
        return;
      }

      if (payload.eventType === 'UPDATE' && payload.new) {
        state.entities = state.entities.map(function (item) {
          return item.id === row.id ? payload.new : item;
        });
        if (state.selected?.type === 'entity' && state.selected.id === row.id && row.visible === false) {
          state.selected = null;
        }
        renderTable();
        if (row.visible === false && row.entity_kind === 'character') {
          toast((row.display_name || 'Personagem') + ' saiu do mapa');
        }
        return;
      }

      if (payload.eventType === 'DELETE' && payload.old) {
        state.entities = state.entities.filter(function (item) { return item.id !== row.id; });
        if (state.selected?.type === 'entity' && state.selected.id === row.id) state.selected = null;
        renderTable();
      }
    });

    channel.subscribe(function (status, error) {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('RPG HUB world realtime:', status, error);
      }
    });

    roomChannelState.channel = channel;
  }

  async function rotateRoomDirectly(id, delta) {
    if (!requireMaster()) return;
    const room = state.rooms.find(function (item) { return item.id === id; });
    if (!room) return;

    let next = (Number(room.rotation) || 0) + Number(delta || 15);
    while (next > 180) next -= 360;
    while (next < -180) next += 360;

    const result = await sb.from('rooms')
      .update({ rotation: next })
      .eq('id', id)
      .select()
      .single();

    if (result.error) {
      toast(result.error.message || 'Não foi possível rotacionar o cômodo.', 'error');
      return;
    }

    state.rooms = state.rooms.map(function (item) {
      return item.id === id ? result.data : item;
    });

    if (typeof broadcastRoomRotate === 'function') {
      await broadcastRoomRotate({
        room_id: id,
        rotation: Number(result.data.rotation || 0)
      });
    }

    renderTable();
    setSave('Rotação do cômodo salva');
  }

  function injectRoomControls() {
    if (!canEdit()) return;

    document.querySelectorAll('#roomLayer .room').forEach(function (roomEl) {
      if (roomEl.querySelector('.roomRotateControl')) return;

      const id = roomEl.dataset.roomId;
      const room = state.rooms.find(function (item) { return item.id === id; });
      if (!room) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'roomRotateControl';
      button.dataset.rotateRoom = id;
      button.title = 'Girar 15° (Shift = -15°)';
      button.textContent = '↻';

      button.addEventListener('pointerdown', function (event) {
        event.preventDefault();
        event.stopPropagation();
      });

      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        rotateRoomDirectly(id, event.shiftKey ? -15 : 15);
      });

      roomEl.appendChild(button);
    });
  }

  if (typeof renderTable === 'function' && !renderTable.__rpgEnhanced) {
    const baseRenderTable = renderTable;
    const enhancedRenderTable = function () {
      baseRenderTable();
      injectRoomControls();
    };
    enhancedRenderTable.__rpgEnhanced = true;
    enhancedRenderTable.__base = baseRenderTable;
    window.renderTable = enhancedRenderTable;
  }

  function openDeleteCharacterModalEnhanced(id) {
    if (!requireMaster()) return;
    const character = state.characters.find(function (item) { return item.id === id; });
    if (!character) return;

    showModal(
      '<div class="modalHeader"><div><div class="eyebrow dangerEyebrow">EXCLUSÃO DE FICHA</div><h3>Excluir personagem</h3></div><button class="closeButton" data-close>×</button></div>' +
      '<div class="dangerPanel"><strong>' + escapeHtml(character.name) + ' será excluído da campanha.</strong><p>O personagem e o token da mesa serão removidos, mas o histórico do personagem continuará salvo para registrar o que aconteceu.</p></div>' +
      '<label>Digite o nome do personagem para confirmar <span class="requiredMark">*</span><input id="deleteCharacterNameEnhanced" autocomplete="off" placeholder="' + escapeHtml(character.name) + '"></label>' +
      '<div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="confirmDeleteCharacterEnhanced" class="dangerButton" disabled>Excluir ficha</button></div>'
    );

    const input = $('deleteCharacterNameEnhanced');
    const button = $('confirmDeleteCharacterEnhanced');

    const sync = function () {
      button.disabled = input.value.trim() !== character.name.trim();
    };

    input.addEventListener('input', sync);

    button.addEventListener('click', async function () {
      if (input.value.trim() !== character.name.trim()) return;
      button.disabled = true;

      const result = await sb.from('characters').delete().eq('id', character.id);
      if (result.error) {
        button.disabled = false;
        toast(result.error.message || 'Não foi possível excluir a ficha.', 'error');
        return;
      }

      state.characters = state.characters.filter(function (item) { return item.id !== character.id; });
      state.entities = state.entities.filter(function (item) { return item.character_id !== character.id; });
      if (state.selected?.type === 'entity' && !state.entities.some(function (item) { return item.id === state.selected.id; })) {
        state.selected = null;
      }

      closeModal();
      renderAll();
      toast('Ficha excluída · histórico preservado');
    });
  }

  function enhanceCharacterCards() {
    if (typeof renderCharacters !== 'function') return;
    const actions = document.querySelector('#viewCharacters .sectionActions');
    if (actions && !actions.querySelector('#characterHistoryBtnEnhanced')) {
      const historyButton = document.createElement('button');
      historyButton.id = 'characterHistoryBtnEnhanced';
      historyButton.className = 'softButton';
      historyButton.textContent = 'Histórico';
      historyButton.addEventListener('click', openCharacterHistoryModalEnhanced);
      actions.insertBefore(historyButton, $('newCharacterBtn'));
    }

    if (!canEdit()) return;

    document.querySelectorAll('#charactersGrid [data-edit-character]').forEach(function (editButton) {
      const card = editButton.closest('.dataCard');
      if (!card) return;
      const id = editButton.dataset.editCharacter;
      if (!id || card.querySelector('[data-delete-character-enhanced]')) return;

      const deleteButton = document.createElement('button');
      deleteButton.className = 'dangerButton';
      deleteButton.dataset.deleteCharacterEnhanced = id;
      deleteButton.textContent = 'Excluir ficha';
      deleteButton.addEventListener('click', function () {
        openDeleteCharacterModalEnhanced(id);
      });
      card.querySelector('.cardActions')?.appendChild(deleteButton);
    });
  }

  if (typeof renderCharacters === 'function' && !renderCharacters.__rpgEnhanced) {
    const baseRenderCharacters = renderCharacters;
    const enhancedRenderCharacters = function () {
      baseRenderCharacters();
      enhanceCharacterCards();
    };
    enhancedRenderCharacters.__rpgEnhanced = true;
    enhancedRenderCharacters.__base = baseRenderCharacters;
    window.renderCharacters = enhancedRenderCharacters;
  }

  async function openCharacterHistoryModalEnhanced() {
    if (!state.campaign) return;

    const result = await sb.from('character_history')
      .select('id,character_id,character_name,event_type,hp_before,hp_after,message,created_at')
      .eq('campaign_id', state.campaign.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (result.error) {
      toast(result.error.message || 'Não foi possível carregar o histórico dos personagens.', 'error');
      return;
    }

    const labels = {
      defeated: 'Derrota',
      revived: 'Retorno',
      deleted: 'Ficha excluída'
    };

    const rows = result.data || [];
    const body = rows.length
      ? '<div class="characterHistoryList">' + rows.map(function (event) {
          const hp = event.hp_after == null ? '' : ' · HP ' + event.hp_after;
          return '<article class="characterHistoryRow"><div><span class="characterHistoryEvent ' + escapeHtml(event.event_type) + '">' + escapeHtml(labels[event.event_type] || event.event_type) + '</span><b>' + escapeHtml(event.character_name) + '</b><p>' + escapeHtml(event.message) + escapeHtml(hp) + '</p></div><small>' + escapeHtml(fmtDate(event.created_at)) + '</small></article>';
        }).join('') + '</div>'
      : '<div class="emptyPanel">Nenhum evento de personagem foi registrado ainda.</div>';

    showModal(
      '<div class="modalHeader"><div><div class="eyebrow">MEMÓRIA DOS PERSONAGENS</div><h3>Histórico da campanha</h3><p class="modalHint">Derrotas, retornos e exclusões ficam registrados sem apagar o contexto do que aconteceu.</p></div><button class="closeButton" data-close>×</button></div>' +
      body +
      '<div class="modalActions"><button class="primarySmall" data-close>Fechar</button></div>',
      true
    );
  }

  function injectStyles() {
    if ($('rpgRealtimeEnhancementStyles')) return;
    const style = document.createElement('style');
    style.id = 'rpgRealtimeEnhancementStyles';
    style.textContent =
      '.room{transform-origin:center center!important}' +
      '.roomRotateControl{position:absolute;right:6px;top:5px;width:24px;height:24px;border:1px solid #4a5060;border-radius:7px;background:#0e1218;color:#b9b1ff;font:700 14px/1 system-ui;display:grid;place-items:center;cursor:pointer;z-index:20;box-shadow:0 5px 18px rgba(0,0,0,.3);padding:0}' +
      '.roomRotateControl:hover{background:#1b2030;border-color:#7f73db;transform:scale(1.05)}' +
      '.characterDefeatedBadge,.characterHistoryEvent{display:inline-flex;align-items:center;border:1px solid #4b2630;border-radius:999px;padding:5px 8px;color:#ff9bab;font-size:8px;letter-spacing:.06em}' +
      '.characterHistoryList{display:grid;gap:8px;max-height:60vh;overflow:auto}' +
      '.characterHistoryRow{display:flex;justify-content:space-between;gap:16px;padding:12px;border:1px solid #272d38;background:#0f1319;border-radius:10px}' +
      '.characterHistoryRow>b{margin-left:7px;font-size:10px;color:#c3c8d2}' +
      '.characterHistoryRow p{margin:6px 0 0;color:#78808e;font-size:9px;line-height:1.5}' +
      '.characterHistoryRow small{color:#626a78;font-size:8px;white-space:nowrap}' +
      '.characterHistoryEvent.defeated{border-color:#4b2630;color:#ff9bab}' +
      '.characterHistoryEvent.revived{border-color:#31513f;color:#9be0bd}' +
      '.characterHistoryEvent.deleted{border-color:#54452b;color:#e8c986}';
    document.head.appendChild(style);
  }


  let playerAudioResumeBound = false;
  let playerAudioResumeTimer = null;

  async function syncPlayerAudioNow(forceUnlock) {
    if (typeof canEdit === 'function' && canEdit()) return;
    if (!state.campaign) return;

    state.audioEnabled = true;
    if (typeof renderDice === 'function') renderDice();

    try {
      if (typeof restoreCampaignAudioState === 'function') {
        const restoring = restoreCampaignAudioState();
        if (forceUnlock) await restoring;
        else restoring.catch(function (error) {
          console.warn('RPG HUB audio restore:', error);
        });
      }
      if (typeof renderDice === 'function') renderDice();
    } catch (error) {
      console.warn('RPG HUB audio resume:', error);
    }
  }

  function bindPlayerAudioResume() {
    if (playerAudioResumeBound) return;
    playerAudioResumeBound = true;

    const resume = async function () {
      document.removeEventListener('pointerdown', resume, true);
      document.removeEventListener('touchstart', resume, true);
      document.removeEventListener('keydown', resume, true);
      document.removeEventListener('click', resume, true);
      await syncPlayerAudioNow(true);
    };

    document.addEventListener('pointerdown', resume, true);
    document.addEventListener('touchstart', resume, true);
    document.addEventListener('keydown', resume, true);
    document.addEventListener('click', resume, true);
  }

  function schedulePlayerAudioSync(delay) {
    clearTimeout(playerAudioResumeTimer);
    playerAudioResumeTimer = setTimeout(function () {
      syncPlayerAudioNow(false);
    }, delay || 150);
  }

  function makePlayerAudioUiActive() {
    const button = $('enableAudioBtn');
    if (!button || canEdit()) return;
    button.textContent = 'Áudio sincronizado';
    button.classList.add('audioReady');
    button.setAttribute('aria-label', 'Áudio da campanha sincronizado automaticamente');
  }


  function hookSessionAudioSync() {
    if (typeof activateSession !== 'function' || activateSession.__rpgAudioEnhanced) return;
    const baseActivateSession = activateSession;
    const enhancedActivateSession = async function (id) {
      const result = await baseActivateSession(id);
      if (!canEdit()) {
        setTimeout(function () {
          initPlayerAudioSync();
          syncPlayerAudioNow(false);
        }, 100);
      }
      return result;
    };
    enhancedActivateSession.__rpgAudioEnhanced = true;
    enhancedActivateSession.__base = baseActivateSession;
    window.activateSession = enhancedActivateSession;
  }

  function initPlayerAudioSync() {
    if (!state || canEdit()) return;

    state.audioEnabled = true;
    makePlayerAudioUiActive();
    schedulePlayerAudioSync(0);
    bindPlayerAudioResume();

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) schedulePlayerAudioSync(0);
    });

    window.addEventListener('focus', function () {
      schedulePlayerAudioSync(0);
    });
  }

  function init() {
    if (!window.rpgSupabase || typeof state === 'undefined') {
      roomChannelState.poll = setTimeout(init, 250);
      return;
    }

    injectStyles();
    subscribeTableRealtime();

    const campaignSelect = $('campaignSelect');
    if (campaignSelect && !campaignSelect.dataset.worldRealtime) {
      campaignSelect.dataset.worldRealtime = '1';
      campaignSelect.addEventListener('change', function () {
        setTimeout(subscribeTableRealtime, 500);
        setTimeout(enhanceCharacterCards, 700);
        setTimeout(hookSessionAudioSync, 500);
        setTimeout(initPlayerAudioSync, 900);
      });
    }

    enhanceCharacterCards();
    setTimeout(enhanceCharacterCards, 500);
    setTimeout(enhanceCharacterCards, 1200);
    hookSessionAudioSync();
    setTimeout(initPlayerAudioSync, 100);
    setTimeout(makePlayerAudioUiActive, 700);
  }

  window.addEventListener('load', init);
  setTimeout(init, 0);
})();