(function () {
  'use strict';

  const sb = window.rpgSupabase;
  if (!sb) return;

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
  }[m]));

  let channel = null;
  let campaignId = null;
  let refreshTimer = null;

  function currentFloorId() {
    return document.querySelector('#floorSwitch [data-floor].chosen')?.dataset.floor ||
      document.querySelector('#floorSwitch [data-floor][class*="chosen"]')?.dataset.floor || null;
  }

  function tokenMarkup(entity, avatarUrl) {
    const icon = entity.entity_kind === 'npc' ? '♜' : entity.entity_kind === 'enemy' ? '☠' : '♙';
    const avatar = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="" draggable="false">`
      : `<span class="realtimeTokenIcon">${icon}</span>`;
    return `<div class="tokenBig realtimeSyncedToken" data-realtime-entity-id="${escapeHtml(entity.id)}" data-entity-id="${escapeHtml(entity.id)}" style="left:${Number(entity.x ?? 50)}%;top:${Number(entity.y ?? 50)}%;--token-color:${escapeHtml(entity.color || '#9487ff')}">${avatar}<span>${escapeHtml(entity.display_name)}</span></div>`;
  }

  async function getAvatarUrl(entity) {
    if (entity.avatar_url) return entity.avatar_url;
    if (entity.npc_id) {
      const { data } = await sb.from('npcs').select('avatar_url').eq('id', entity.npc_id).maybeSingle();
      return data?.avatar_url || null;
    }
    if (!entity.character_id) return null;
    const { data: character } = await sb.from('characters').select('avatar_url,player_id').eq('id', entity.character_id).maybeSingle();
    if (character?.avatar_url) return character.avatar_url;
    if (character?.player_id) {
      const { data: profile } = await sb.from('profiles').select('avatar_url').eq('id', character.player_id).maybeSingle();
      return profile?.avatar_url || null;
    }
    return null;
  }

  async function renderEntity(entity) {
    if (!entity?.id) return;
    const layer = $('tokenLayer');
    if (!layer) return;
    const floorId = currentFloorId();
    const selectorId = CSS.escape(entity.id);
    const old = layer.querySelector(`[data-realtime-entity-id="${selectorId}"]`);

    if (entity.visible === false || entity.floor_id !== floorId) {
      old?.remove();
      return;
    }

    const normal = layer.querySelector(`[data-entity-id="${selectorId}"]:not(.realtimeSyncedToken)`);
    if (normal) {
      old?.remove();
      return;
    }

    const avatarUrl = await getAvatarUrl(entity);
    const current = layer.querySelector(`[data-realtime-entity-id="${selectorId}"]`);
    if (current) {
      current.style.left = `${Number(entity.x ?? 50)}%`;
      current.style.top = `${Number(entity.y ?? 50)}%`;
      current.style.setProperty('--token-color', entity.color || '#9487ff');
      const label = current.querySelector('span:not(.realtimeTokenIcon)');
      if (label) label.textContent = entity.display_name || '';
      return;
    }

    layer.insertAdjacentHTML('beforeend', tokenMarkup(entity, avatarUrl));
  }

  async function refreshVisibleEntities() {
    if (!campaignId) return;
    const floorId = currentFloorId();
    if (!floorId) return;
    const { data, error } = await sb.from('world_entities')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('floor_id', floorId)
      .neq('visible', false);
    if (error) return;

    const rows = data || [];
    const ids = new Set(rows.map((row) => row.id));
    document.querySelectorAll('#tokenLayer .realtimeSyncedToken').forEach((el) => {
      if (!ids.has(el.dataset.realtimeEntityId)) el.remove();
    });
    for (const row of rows) await renderEntity(row);
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshVisibleEntities, 80);
  }

  function observeFloorAndRenderer() {
    const floorSwitch = $('floorSwitch');
    const tokenLayer = $('tokenLayer');
    if (floorSwitch) new MutationObserver(scheduleRefresh).observe(floorSwitch, { childList: true, subtree: true, attributes: true });
    if (tokenLayer) new MutationObserver(scheduleRefresh).observe(tokenLayer, { childList: true });
  }

  async function subscribe() {
    const select = $('campaignSelect');
    campaignId = select?.value || null;
    if (!campaignId) return;

    if (channel) await sb.removeChannel(channel).catch(() => {});
    channel = sb.channel(`rpg-hub-table-entities-${campaignId}`, { config: { private: true } });

    channel.on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'world_entities', filter: `campaign_id=eq.${campaignId}`
    }, async ({ new: row }) => {
      if (row?.id) await renderEntity(row);
    });

    channel.on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'world_entities', filter: `campaign_id=eq.${campaignId}`
    }, async ({ new: row }) => {
      if (row?.id) await renderEntity(row);
    });

    channel.on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'world_entities', filter: `campaign_id=eq.${campaignId}`
    }, ({ old: row }) => {
      if (!row?.id) return;
      document.querySelectorAll(`[data-realtime-entity-id="${CSS.escape(row.id)}"]`).forEach((el) => el.remove());
    });

    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('Table entity realtime:', status, error);
    });

    await refreshVisibleEntities();
    observeFloorAndRenderer();
  }

  function waitForCampaign() {
    const select = $('campaignSelect');
    if (select?.value) return subscribe();
    setTimeout(waitForCampaign, 150);
  }

  waitForCampaign();
})();
