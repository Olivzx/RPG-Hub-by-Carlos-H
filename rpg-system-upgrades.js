/* RPG HUB — system upgrades / hardening
 * Loaded after the legacy client so the current UI can be improved without
 * destabilizing the campaign renderer.
 */
(() => {
  'use strict';

  const AUDIT_LIMIT = 100;
  const DICE_HISTORY_LIMIT = 50;
  const GRID_KEY = 'rpgHub.grid.v1';

  const upgrade = {
    auditChannel: null,
    auditCampaignId: null,
    diceChannel: null,
    diceCampaignId: null,
    initialized: false,
    rerenderTimer: null
  };

  const safe = (value) => {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  };

  const byId = (id) => document.getElementById(id);

  function currentCampaignId() {
    return typeof state !== 'undefined' ? state.campaign?.id || null : null;
  }

  function isMasterCampaign() {
    return typeof canEdit === 'function' && canEdit();
  }

  function queueRender() {
    clearTimeout(upgrade.rerenderTimer);
    upgrade.rerenderTimer = setTimeout(() => {
      try { if (typeof renderAll === 'function') renderAll(); } catch (error) { console.warn('RPG HUB render sync:', error); }
    }, 80);
  }

  function injectStyles() {
    if (byId('rpgSystemUpgradeStyles')) return;
    const style = document.createElement('style');
    style.id = 'rpgSystemUpgradeStyles';
    style.textContent = `
      .rpgSystemNetwork{
        display:inline-flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #252c37;border-radius:10px;
        background:#0f141b;color:#80899a;font-size:9px;white-space:nowrap
      }
      .rpgSystemNetwork i{width:7px;height:7px;border-radius:50%;display:block;background:#6ee7b7;box-shadow:0 0 12px rgba(110,231,183,.45)}
      .rpgSystemNetwork.offline{border-color:#4b2730;color:#ff9bab}
      .rpgSystemNetwork.offline i{background:#fb7185;box-shadow:0 0 12px rgba(251,113,133,.45)}
      .rpgAuditView{padding-bottom:30px}
      .rpgAuditLayout{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,.65fr);gap:14px}
      .rpgAuditCard,.rpgAuditSummary{border:1px solid #293241;border-radius:16px;background:linear-gradient(145deg,#101721,#0c1118)}
      .rpgAuditCard{overflow:hidden}
      .rpgAuditHead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:18px 20px;border-bottom:1px solid #252d39}
      .rpgAuditHead h3{margin:4px 0 0;color:#eef1f6;font-size:14px}
      .rpgAuditHead p{margin:5px 0 0;color:#717c8f;font-size:9px;line-height:1.5}
      .rpgAuditBadge{padding:6px 8px;border-radius:999px;border:1px solid #3c3565;background:#18162b;color:#aaa1ff;font-size:8px;white-space:nowrap}
      .rpgAuditList{display:grid;max-height:62vh;overflow:auto}
      .rpgAuditItem{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.045)}
      .rpgAuditItem:last-child{border-bottom:0}
      .rpgAuditItem>i{width:7px;height:7px;border-radius:50%;margin-top:5px;background:#9487ff;box-shadow:0 0 12px rgba(148,135,255,.28)}
      .rpgAuditItem.action-DELETE>i{background:#fb7185;box-shadow:0 0 12px rgba(251,113,133,.28)}
      .rpgAuditItem.action-INSERT>i{background:#6ee7b7;box-shadow:0 0 12px rgba(110,231,183,.24)}
      .rpgAuditItem b{display:block;color:#dfe3ea;font-size:10px}
      .rpgAuditItem small{display:block;margin-top:3px;color:#697487;font-size:8px;line-height:1.45}
      .rpgAuditItem time{color:#5f6979;font-size:8px;white-space:nowrap}
      .rpgAuditEmpty{padding:34px 20px;text-align:center;color:#667183;font-size:9px}
      .rpgAuditSummary{padding:18px}
      .rpgAuditSummary h3{margin:0;color:#eef1f6;font-size:13px}
      .rpgAuditSummary p{margin:5px 0 14px;color:#6d7889;font-size:9px;line-height:1.5}
      .rpgAuditStats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .rpgAuditStat{padding:12px;border:1px solid #27303d;border-radius:12px;background:#111821}
      .rpgAuditStat span{display:block;color:#697486;font-size:8px;text-transform:uppercase}
      .rpgAuditStat b{display:block;margin-top:6px;color:#e4e7ed;font-size:19px}
      .rpgAuditRefresh{margin-top:12px;width:100%}
      .rpgGridToggle{position:relative}
      .rpgGridToggle.active{border-color:var(--accent,#9487ff)!important;color:var(--theme-soft,#c9c3ff)!important;background:color-mix(in srgb,var(--accent,#9487ff) 9%,#10151d)!important}
      #board.rpg-grid-enabled{
        background-image:
          linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),
          linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px),
          radial-gradient(circle at 50% 25%,rgba(148,135,255,.07),transparent 40%);
        background-size:5% 5%,5% 5%,100% 100%;
      }
      .rpgProfileReadonly{padding:11px;border:1px solid #2a3240;border-radius:11px;background:#0c1118;color:#778293;font-size:9px;line-height:1.55}
      .rpgProfileReadonly strong{color:#d7dbe3}
      @media(max-width:900px){
        .rpgAuditLayout{grid-template-columns:1fr}
        .rpgAuditList{max-height:48vh}
      }
      @media(max-width:700px){
        .rpgSystemNetwork{display:none}
        .rpgAuditItem{grid-template-columns:8px minmax(0,1fr)}
        .rpgAuditItem time{grid-column:2}
      }
    `;
    document.head.appendChild(style);
  }

  function installNetworkIndicator() {
    const actions = document.querySelector('.workspaceTop .topActions');
    if (!actions || byId('rpgSystemNetwork')) return;
    const node = document.createElement('div');
    node.id = 'rpgSystemNetwork';
    node.className = 'rpgSystemNetwork';
    node.innerHTML = '<i></i><span>Conectado</span>';
    const sessionOnline = actions.querySelector('.sessionOnline');
    actions.insertBefore(node, sessionOnline || null);

    const sync = () => {
      const online = navigator.onLine;
      node.classList.toggle('offline', !online);
      node.querySelector('span').textContent = online ? 'Conectado' : 'Sem internet';
      if (!online && typeof setSave === 'function') setSave('Sem conexão · alterações aguardando rede', false);
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    sync();
  }

  function gridEnabled() {
    try { return localStorage.getItem(GRID_KEY) === '1'; } catch (_) { return false; }
  }

  function setGrid(enabled) {
    try { localStorage.setItem(GRID_KEY, enabled ? '1' : '0'); } catch (_) {}
    byId('board')?.classList.toggle('rpg-grid-enabled', enabled);
    const button = byId('rpgGridToggle');
    if (button) {
      button.classList.toggle('active', enabled);
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? '▦ Grade' : '▦ Grade';
      button.title = enabled ? 'Ocultar grade' : 'Exibir grade';
    }
  }

  function installGridControl() {
    const toolbar = document.querySelector('.boardToolbar .toolbarActions');
    if (!toolbar || byId('rpgGridToggle')) return;
    const button = document.createElement('button');
    button.id = 'rpgGridToggle';
    button.className = 'toolButton rpgGridToggle';
    button.type = 'button';
    button.setAttribute('aria-pressed', 'false');
    button.textContent = '▦ Grade';
    button.title = 'Exibir grade de alinhamento';
    button.addEventListener('click', () => setGrid(!gridEnabled()));
    const zoomOut = byId('zoomOut');
    toolbar.insertBefore(button, zoomOut || toolbar.firstChild);
    setGrid(gridEnabled());
  }

  function installAuditView() {
    if (!isMasterCampaign()) return;
    const nav = byId('sideNav');
    const workspace = document.querySelector('.workspace');
    if (!nav || !workspace) return;

    let navButton = nav.querySelector('[data-view="audit"]');
    if (!navButton) {
      navButton = document.createElement('button');
      navButton.type = 'button';
      navButton.dataset.view = 'audit';
      navButton.id = 'rpgAuditNav';
      navButton.innerHTML = '◷ <span>Atividade</span>';
      nav.appendChild(navButton);
    }
    navButton.classList.remove('hidden');

    let view = byId('viewAudit');
    if (!view) {
      view = document.createElement('section');
      view.id = 'viewAudit';
      view.className = 'view rpgAuditView';
      view.innerHTML = `
        <div class="sectionTop">
          <div>
            <div class="eyebrow">SEGURANÇA DA CAMPANHA</div>
            <h2>Atividade</h2>
            <p>Um histórico privado das principais alterações feitas na campanha.</p>
          </div>
          <div class="sectionActions"><button id="rpgAuditRefreshBtn" class="softButton">Atualizar</button></div>
        </div>
        <div class="rpgAuditLayout">
          <section class="rpgAuditCard">
            <div class="rpgAuditHead">
              <div><span class="eyebrow">LOG DA CAMPANHA</span><h3>Últimas alterações</h3><p>Movimentações, fichas, sessões, NPCs, mapa e rolagens.</p></div>
              <span class="rpgAuditBadge">PRIVADO DO MESTRE</span>
            </div>
            <div id="rpgAuditList" class="rpgAuditList"></div>
          </section>
          <aside class="rpgAuditSummary">
            <h3>Resumo</h3>
            <p>O histórico é salvo no banco e fica associado à campanha.</p>
            <div id="rpgAuditStats" class="rpgAuditStats"></div>
          </aside>
        </div>`;
      workspace.appendChild(view);
    }

    const route = () => {
      if (state.view !== 'audit') return;
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'viewAudit'));
      nav.querySelectorAll('[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === 'audit'));
    };
    if (!navButton.dataset.bound) {
      navButton.dataset.bound = '1';
      navButton.addEventListener('click', () => {
        state.view = 'audit';
        route();
        loadAuditActivity();
      });
    }
    const refreshButton = byId('rpgAuditRefreshBtn');
    if (refreshButton && !refreshButton.dataset.bound) {
      refreshButton.dataset.bound = '1';
      refreshButton.addEventListener('click', loadAuditActivity);
    }
    route();
  }

  async function loadAuditActivity() {
    if (!isMasterCampaign() || !state.campaign) return;
    const list = byId('rpgAuditList');
    const stats = byId('rpgAuditStats');
    if (!list || !stats) return;

    list.innerHTML = '<div class="rpgAuditEmpty">Carregando atividade…</div>';
    const { data, error } = await sb.from('campaign_activity')
      .select('id,action,entity_type,entity_id,summary,metadata,created_at')
      .eq('campaign_id', state.campaign.id)
      .order('created_at', { ascending: false })
      .limit(AUDIT_LIMIT);

    if (error) {
      list.innerHTML = '<div class="rpgAuditEmpty">Não foi possível carregar o histórico.</div>';
      toast(error.message || 'Falha ao carregar atividade.', 'error');
      return;
    }

    const rows = data || [];
    list.innerHTML = rows.length
      ? rows.map(row => '<article class="rpgAuditItem action-' + safe(row.action) + '"><i></i><div><b>' + safe(row.summary) + '</b><small>' + safe(row.entity_type) + (row.entity_id ? ' · ' + safe(row.entity_id) : '') + '</small></div><time>' + safe(typeof fmtDate === 'function' ? fmtDate(row.created_at) : row.created_at) + '</time></article>').join('')
      : '<div class="rpgAuditEmpty">Nenhuma alteração registrada ainda.</div>';

    const byType = rows.reduce((acc, row) => {
      const key = row.entity_type || 'outro';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const total = rows.length;
    const deletes = rows.filter(r => r.action === 'DELETE').length;
    const inserts = rows.filter(r => r.action === 'INSERT').length;
    stats.innerHTML = [
      ['Eventos', total],
      ['Criações', inserts],
      ['Exclusões', deletes],
      ['Tipos', Object.keys(byType).length]
    ].map(([label, value]) => '<div class="rpgAuditStat"><span>' + safe(label) + '</span><b>' + value + '</b></div>').join('');
  }

  async function subscribeAuditRealtime() {
    const campaignId = currentCampaignId();
    if (!isMasterCampaign() || !campaignId) return;
    if (upgrade.auditCampaignId === campaignId && upgrade.auditChannel) return;

    if (upgrade.auditChannel) {
      await sb.removeChannel(upgrade.auditChannel).catch(() => {});
      upgrade.auditChannel = null;
    }

    const channel = sb.channel('rpg-hub-audit-' + campaignId, { config: { private: true } });
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'campaign_activity',
      filter: 'campaign_id=eq.' + campaignId
    }, () => {
      if (state.view === 'audit') loadAuditActivity();
    });
    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('RPG HUB audit realtime:', status, error);
    });
    upgrade.auditChannel = channel;
    upgrade.auditCampaignId = campaignId;
  }

  async function subscribePlayerDiceRealtime() {
    const campaignId = currentCampaignId();
    if (!campaignId || isMasterCampaign()) return;
    if (upgrade.diceCampaignId === campaignId && upgrade.diceChannel) return;

    if (upgrade.diceChannel) {
      await sb.removeChannel(upgrade.diceChannel).catch(() => {});
      upgrade.diceChannel = null;
    }

    const channel = sb.channel('rpg-hub-dice-' + campaignId, { config: { private: true } });
    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'dice_rolls',
      filter: 'campaign_id=eq.' + campaignId
    }, (payload) => {
      const row = payload?.new;
      if (!row?.id) return;
      if (!state.rolls.some(r => r.id === row.id)) state.rolls = [row, ...state.rolls].slice(0, DICE_HISTORY_LIMIT);
      if (typeof renderDice === 'function') renderDice();
      if (typeof renderDiceResult === 'function') renderDiceResult(row);
      const mine = row.roller_user_id === state.user?.id;
      if (!mine && typeof toast === 'function') {
        toast((row.roller_display_name || 'Jogador') + ' rolou ' + (row.notation || 'dados') + ' → ' + row.final_result);
      }
    });
    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('RPG HUB dice realtime:', status, error);
    });
    upgrade.diceChannel = channel;
    upgrade.diceCampaignId = campaignId;
  }

  async function loadPlayerDiceHistory() {
    const campaignId = currentCampaignId();
    if (!campaignId || isMasterCampaign()) return;
    const { data, error } = await sb.from('dice_rolls')
      .select('id,campaign_id,session_id,roller_user_id,character_id,notation,base_results,rule_results,final_result,created_at,roller_display_name')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(DICE_HISTORY_LIMIT);

    if (error) {
      console.warn('RPG HUB dice history:', error);
      return;
    }
    state.rolls = data || [];
    if (typeof renderDice === 'function') renderDice();
  }

  function installSafeProfileModal() {
    if (typeof window.profileModal !== 'function' || window.profileModal.__rpgSafeProfile) return;
    const safeProfileModal = async function () {
      const currentType = state.profile?.account_type === 'master' ? 'Mestre' : 'Jogador';
      showModal(`
        <div class="modalHeader">
          <div><div class="eyebrow">PERFIL</div><h3>Sua conta de mesa</h3></div>
          <button class="closeButton" data-close>×</button>
        </div>
        <div class="profileEditor">
          <div class="profilePreview">${state.profile?.avatar_url ? '<img src="' + safe(state.profile.avatar_url) + '" alt="">' : '✦'}</div>
          <label>Nome de exibição<input id="profileName" maxlength="80" value="${safe(state.profile?.display_name || '')}"></label>
          <div class="rpgProfileReadonly"><strong>Tipo de conta: ${currentType}</strong><br>O tipo de conta controla permissões da plataforma e só pode ser alterado por uma operação administrativa segura.</div>
          <label>Avatar<input id="profileUrl" value="${safe(state.profile?.avatar_url || '')}" placeholder="https://..."></label>
          <label>Enviar foto<input id="profileFile" type="file" accept="image/*"></label>
          <label>Bio<textarea id="profileBio" rows="4" maxlength="500">${safe(state.profile?.bio || '')}</textarea></label>
        </div>
        <div class="modalActions"><button class="softButton" data-close>Cancelar</button><button id="saveProfile" class="primarySmall">Salvar perfil</button></div>`);

      byId('saveProfile').onclick = async () => {
        const button = byId('saveProfile');
        button.disabled = true;
        try {
          let avatar = byId('profileUrl').value.trim() || null;
          const file = byId('profileFile')?.files?.[0];
          if (file && typeof uploadMedia === 'function') avatar = await uploadMedia(file, 'profile');
          const { data, error } = await sb.from('profiles')
            .update({
              display_name: byId('profileName').value.trim() || 'Aventureiro',
              avatar_url: avatar,
              bio: byId('profileBio').value.trim()
            })
            .eq('id', state.user.id)
            .select('*')
            .single();
          if (error) throw error;
          state.profile = data;
          closeModal();
          queueRender();
          toast('Perfil atualizado');
        } catch (error) {
          toast(error.message || 'Não foi possível salvar o perfil.', 'error');
        } finally {
          button.disabled = false;
        }
      };
    };
    safeProfileModal.__rpgSafeProfile = true;
    safeProfileModal.__base = window.profileModal;
    window.profileModal = safeProfileModal;
  }

  function wrapRenderShell() {
    if (typeof window.renderShell !== 'function' || window.renderShell.__rpgSystemWrapped) return;
    const base = window.renderShell;
    const wrapped = function () {
      const result = base();
      installNetworkIndicator();
      installGridControl();
      installAuditView();
      return result;
    };
    wrapped.__rpgSystemWrapped = true;
    wrapped.__base = base;
    window.renderShell = wrapped;
  }

  function wrapRenderAll() {
    if (typeof window.renderAll !== 'function' || window.renderAll.__rpgSystemWrapped) return;
    const base = window.renderAll;
    const wrapped = function () {
      const result = base();
      installNetworkIndicator();
      installGridControl();
      installAuditView();
      subscribeAuditRealtime();
      if (!isMasterCampaign()) {
        subscribePlayerDiceRealtime();
      }
      return result;
    };
    wrapped.__rpgSystemWrapped = true;
    wrapped.__base = base;
    window.renderAll = wrapped;
  }

  async function refreshCampaignBoundFeatures() {
    if (!currentCampaignId()) return;
    installNetworkIndicator();
    installGridControl();
    installAuditView();
    await subscribeAuditRealtime();
    if (!isMasterCampaign()) {
      await subscribePlayerDiceRealtime();
      await loadPlayerDiceHistory();
    }
  }

  function observeCampaignChanges() {
    const select = byId('campaignSelect');
    if (!select || select.dataset.rpgSystemBound) return;
    select.dataset.rpgSystemBound = '1';
    select.addEventListener('change', () => {
      setTimeout(() => refreshCampaignBoundFeatures(), 450);
    });
  }

  function bootstrap() {
    if (typeof state === 'undefined' || !window.rpgSupabase) {
      setTimeout(bootstrap, 250);
      return;
    }
    if (upgrade.initialized) return;
    upgrade.initialized = true;
    injectStyles();
    installSafeProfileModal();
    wrapRenderShell();
    wrapRenderAll();
    observeCampaignChanges();
    installNetworkIndicator();
    installGridControl();
    installAuditView();
    refreshCampaignBoundFeatures();

    setInterval(() => {
      observeCampaignChanges();
      if (currentCampaignId()) {
        installAuditView();
        installGridControl();
      }
    }, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
