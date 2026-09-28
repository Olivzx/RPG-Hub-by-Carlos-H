/* RPG HUB — Área inicial da campanha
 * O dashboard fica em uma aba própria ANTES da Mesa.
 * A Mesa permanece focada no mapa e nos controles de jogo.
 */
(() => {
  'use strict';

  function goTo(view){
    const button = document.querySelector(`#sideNav [data-view="${view}"]`);
    if(button) button.click();
  }

  function build(){
    const nav = document.getElementById('sideNav');
    const tableView = document.getElementById('viewTable');
    if(!nav || !tableView || document.getElementById('viewDashboard')) return;

    /* Cria a navegação "Início" imediatamente antes de Mesa. */
    const tableButton = nav.querySelector('[data-view="table"]');
    const dashboardButton = document.createElement('button');
    dashboardButton.type = 'button';
    dashboardButton.dataset.view = 'dashboard';
    dashboardButton.className = 'rpg-dashboard-nav';
    dashboardButton.innerHTML = '✦ <span>Visão geral</span>';
    if(tableButton) nav.insertBefore(dashboardButton, tableButton);
    else nav.prepend(dashboardButton);

    /* O dashboard é uma view independente. Nada é inserido dentro da Mesa. */
    const view = document.createElement('section');
    view.id = 'viewDashboard';
    view.className = 'view rpg-dashboard-view';
    view.innerHTML = `
      <div class="rpg-dashboard">
        <section class="rpg-dashboard-hero" id="rpgDashboardHero">
          <div class="rpg-dashboard-hero-glow"></div>
          <div class="rpg-dashboard-hero-content">
            <span class="rpg-dashboard-kicker">VISÃO GERAL DA CAMPANHA</span>
            <h2>Bem-vindo à sua mesa de RPG.</h2>
            <p>Tenha uma visão rápida da campanha antes de entrar na mesa. O mapa e os controles de jogo continuam separados para manter a interface limpa.</p>
            <div class="rpg-dashboard-actions">
              <button type="button" class="rpg-dashboard-primary" data-dashboard-view="table-map">⌖ <span>Entrar na mesa</span> <b>›</b></button>
              <button type="button" class="rpg-dashboard-secondary" data-dashboard-view="dice">◇ <span>Abrir utilitários</span></button>
            </div>
          </div>
          <div class="rpg-dashboard-orb orb-one"></div>
          <div class="rpg-dashboard-orb orb-two"></div>
        </section>

        <section class="rpg-dashboard-feature-grid" aria-label="Atalhos da campanha">
          <article class="rpg-feature-card" data-dashboard-view="table-map"><div class="rpg-feature-icon">⌖</div><h3>Mesa da campanha</h3><p>Entre no mapa e conduza a aventura sem elementos extras poluindo a área de jogo.</p><button type="button">Abrir mesa <b>›</b></button></article>
          <article class="rpg-feature-card" data-dashboard-view="dice"><div class="rpg-feature-icon">◇</div><h3>Sistema de dados</h3><p>Role dados, use dados personalizados e consulte os utilitários da sessão.</p><button type="button">Rolar dados <b>›</b></button></article>
          <article class="rpg-feature-card" data-dashboard-view="characters"><div class="rpg-feature-icon">♙</div><h3>Personagens</h3><p>Acesse fichas, atributos, HP e informações dos personagens da campanha.</p><button type="button">Ver personagens <b>›</b></button></article>
          <article class="rpg-feature-card" data-dashboard-view="dice-audio"><div class="rpg-feature-icon">◖</div><h3>Áudio da sessão</h3><p>Controle ou acesse o áudio da campanha sem ocupar espaço dentro do mapa.</p><button type="button">Controlar áudio <b>›</b></button></article>
        </section>

        <section class="rpg-dashboard-lower">
          <article class="rpg-activity-card">
            <header><div><span class="rpg-dashboard-kicker">CAMPANHA</span><h3>Estado da aventura</h3><p>Informações rápidas sobre o ambiente compartilhado.</p></div><span class="rpg-live-pill"><i></i> ONLINE</span></header>
          <div class="rpg-activity-list" id="rpgDashboardActivity">
            <div class="rpg-activity-item"><span class="rpg-activity-avatar">✦</span><div><b>Mesa sincronizada</b><small>O estado da campanha é compartilhado em tempo real entre os participantes.</small></div><time>agora</time></div>
            <div class="rpg-activity-item"><span class="rpg-activity-avatar">◇</span><div><b>Dados disponíveis</b><small>As rolagens usam o sistema da sessão e podem incluir dados personalizados.</small></div><time>agora</time></div>
            <div class="rpg-activity-item"><span class="rpg-activity-avatar">♙</span><div><b>Fichas da campanha</b><small>Os personagens permanecem sincronizados com a mesa.</small></div><time>agora</time></div>
          </div>
        </article>
        <aside class="rpg-presence-card">
          <header><div class="rpg-feature-icon small">♧</div><div><h3>Presença dos jogadores</h3><p><strong id="rpgDashboardOnlineCount">—</strong> conectados</p></div></header>
          <div class="rpg-presence-status"><i></i><span>Campanha online</span></div>
          <div class="rpg-presence-copy">A comunicação da campanha permanece ativa enquanto os participantes estiverem conectados.</div>
        </aside>
      </section>
      </div>
    `;

    tableView.parentNode.insertBefore(view, tableView);

    view.querySelectorAll('[data-dashboard-view]').forEach(el => {
      el.addEventListener('click', () => {
        const target = el.dataset.dashboardView;
        if(target === 'table-map'){
          goTo('table');
          return;
        }
        if(target === 'dice-audio'){
          goTo('dice');
          setTimeout(() => document.getElementById('sessionAudioCard')?.scrollIntoView({behavior:'smooth',block:'start'}), 120);
          return;
        }
        goTo(target);
      });
    });

    const online = document.getElementById('onlineCount');
    const onlineTarget = document.getElementById('rpgDashboardOnlineCount');
    const syncOnline = () => {
      if(onlineTarget && online) onlineTarget.textContent = online.textContent.replace(/[^0-9]/g,'') || '0';
    };
    syncOnline();
    if(online) new MutationObserver(syncOnline).observe(online,{childList:true,subtree:true,characterData:true});

    /* A nova aba é a tela inicial, mas o jogador pode entrar na Mesa normalmente. */
    if(typeof state !== 'undefined'){
      state.view = 'dashboard';
      if(typeof renderView === 'function') renderView();
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',build,{once:true});
  else build();
})();
