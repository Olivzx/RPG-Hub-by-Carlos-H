/* RPG HUB — Dashboard visual da Mesa
 * Camada visual inspirada no layout de referência, sem substituir as funções existentes.
 */
(() => {
  'use strict';

  function goTo(view){
    const button = document.querySelector(`#sideNav [data-view="${view}"]`);
    if(button) button.click();
  }

  function build(){
    const view = document.getElementById('viewTable');
    if(!view || document.getElementById('rpgDashboardHero')) return;

    const sessionBar = view.querySelector('.sessionMetaBar');
    const dashboard = document.createElement('div');
    dashboard.className = 'rpg-dashboard';
    dashboard.innerHTML = `
      <section class="rpg-dashboard-hero" id="rpgDashboardHero">
        <div class="rpg-dashboard-hero-glow"></div>
        <div class="rpg-dashboard-hero-content">
          <span class="rpg-dashboard-kicker">MESA DA CAMPANHA</span>
          <h2>Bem-vindo à sua mesa de RPG.</h2>
          <p>Explore o mundo da campanha, gerencie seus personagens e conduza a aventura em tempo real.</p>
          <div class="rpg-dashboard-actions">
            <button type="button" class="rpg-dashboard-primary" data-dashboard-view="table-map">✦ <span>Ver mapa</span> <b>›</b></button>
            <button type="button" class="rpg-dashboard-secondary" data-dashboard-view="dice">♙ <span>Abrir utilitários</span></button>
          </div>
        </div>
        <div class="rpg-dashboard-orb orb-one"></div>
        <div class="rpg-dashboard-orb orb-two"></div>
      </section>

      <section class="rpg-dashboard-feature-grid" aria-label="Atalhos da campanha">
        <article class="rpg-feature-card" data-dashboard-view="table-map"><div class="rpg-feature-icon">⌖</div><h3>Mapa da mesa</h3><p>Visualize e interaja com o cenário da sua campanha.</p><button type="button">Acessar <b>›</b></button></article>
        <article class="rpg-feature-card" data-dashboard-view="dice"><div class="rpg-feature-icon">◇</div><h3>Sistema de dados</h3><p>Role dados, crie combinações e veja resultados em tempo real.</p><button type="button">Rolar dados <b>›</b></button></article>
        <article class="rpg-feature-card" data-dashboard-view="characters"><div class="rpg-feature-icon">♙</div><h3>Seus personagens</h3><p>Gerencie personagens e fichas de forma prática.</p><button type="button">Ver personagens <b>›</b></button></article>
        <article class="rpg-feature-card" data-dashboard-view="dice-audio"><div class="rpg-feature-icon">◖</div><h3>Áudio da sessão</h3><p>Ouça e controle a trilha sonora da sua campanha.</p><button type="button">Controlar áudio <b>›</b></button></article>
      </section>

      <section class="rpg-dashboard-lower">
        <article class="rpg-activity-card">
          <header><div><span class="rpg-dashboard-kicker">ATIVIDADE</span><h3>Atualizações da campanha</h3><p>Estado da mesa e eventos recentes em tempo real.</p></div><span class="rpg-live-pill"><i></i> AO VIVO</span></header>
          <div class="rpg-activity-list" id="rpgDashboardActivity">
            <div class="rpg-activity-item"><span class="rpg-activity-avatar">✦</span><div><b>Mesa sincronizada</b><small>Todos os participantes compartilham o estado da campanha.</small></div><time>agora</time></div>
            <div class="rpg-activity-item"><span class="rpg-activity-avatar">◇</span><div><b>Sistema de dados pronto</b><small>Rolagens e resultados podem ser atualizados em tempo real.</small></div><time>agora</time></div>
            <div class="rpg-activity-item"><span class="rpg-activity-avatar">♙</span><div><b>Personagens disponíveis</b><small>As fichas da campanha ficam acessíveis pela navegação lateral.</small></div><time>agora</time></div>
          </div>
        </article>
        <aside class="rpg-presence-card">
          <header><div class="rpg-feature-icon small">♧</div><div><h3>Presença dos jogadores</h3><p><strong id="rpgDashboardOnlineCount">—</strong> conectados</p></div></header>
          <div class="rpg-presence-status"><i></i><span>Campanha online</span></div>
          <div class="rpg-presence-copy">A comunicação da mesa é sincronizada enquanto os jogadores permanecem conectados.</div>
        </aside>
      </section>
    `;

    if(sessionBar) view.insertBefore(dashboard, sessionBar);
    else view.prepend(dashboard);

    dashboard.querySelectorAll('[data-dashboard-view]').forEach(el => {
      el.addEventListener('click', () => {
        const target = el.dataset.dashboardView;
        if(target === 'table-map'){
          document.querySelector('.boardPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
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
    const syncOnline = () => { if(onlineTarget && online) onlineTarget.textContent = online.textContent.replace(/[^0-9]/g,'') || '0'; };
    syncOnline();
    const observer = new MutationObserver(syncOnline);
    if(online) observer.observe(online,{childList:true,subtree:true,characterData:true});
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',build,{once:true});
  else build();
})();
