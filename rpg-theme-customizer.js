/* RPG HUB — Theme Customizer
 * Personal accent themes for each player. Preferences stay local to the device.
 */
(() => {
  'use strict';

  const THEMES = [
    { id: 'violet', name: 'Violeta', accent: '#8b5cf6', soft: '#6d4ad8' },
    { id: 'blue', name: 'Azul', accent: '#3b82f6', soft: '#2563eb' },
    { id: 'cyan', name: 'Ciano', accent: '#06b6d4', soft: '#0891b2' },
    { id: 'emerald', name: 'Esmeralda', accent: '#10b981', soft: '#059669' },
    { id: 'gold', name: 'Dourado', accent: '#eab308', soft: '#ca8a04' },
    { id: 'orange', name: 'Laranja', accent: '#f97316', soft: '#ea580c' },
    { id: 'pink', name: 'Rosa', accent: '#ec4899', soft: '#db2777' },
    { id: 'ruby', name: 'Rubi', accent: '#ef4444', soft: '#dc2626' }
  ];

  const STORAGE_KEY = 'rpg_hub_theme';

  function currentTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'violet';
  }

  function applyTheme(id) {
    const theme = THEMES.find(t => t.id === id) || THEMES[0];
    const root = document.documentElement;
    root.dataset.rpgTheme = theme.id;
    root.style.setProperty('--rpg-accent', theme.accent);
    root.style.setProperty('--rpg-accent-strong', theme.soft);
    root.style.setProperty('--rpg-accent-rgb', hexToRgb(theme.accent));
    localStorage.setItem(STORAGE_KEY, theme.id);
    updateSelectedState(theme.id);
  }

  function hexToRgb(hex) {
    const value = hex.replace('#', '');
    const n = parseInt(value, 16);
    return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
  }

  function updateSelectedState(id) {
    document.querySelectorAll('[data-rpg-theme-option]').forEach(button => {
      const selected = button.dataset.rpgThemeOption === id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
  }

  function injectStyles() {
    if (document.getElementById('rpg-theme-customizer-style')) return;
    const style = document.createElement('style');
    style.id = 'rpg-theme-customizer-style';
    style.textContent = `
      :root {
        --rpg-accent: #8b5cf6;
        --rpg-accent-strong: #6d4ad8;
        --rpg-accent-rgb: 139, 92, 246;
      }
      .rpg-theme-trigger {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 0;
        background: transparent;
        color: inherit;
        padding: 10px 12px;
        border-radius: 10px;
        cursor: pointer;
        text-align: left;
        transition: background .18s ease, color .18s ease;
      }
      .rpg-theme-trigger:hover { background: rgba(var(--rpg-accent-rgb), .10); }
      .rpg-theme-trigger .theme-dot {
        width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto;
        background: var(--rpg-accent);
        box-shadow: 0 0 12px rgba(var(--rpg-accent-rgb), .55);
      }
      .rpg-theme-panel {
        position: fixed;
        z-index: 10050;
        width: 285px;
        padding: 15px;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 16px;
        background: rgba(15,17,24,.98);
        box-shadow: 0 22px 60px rgba(0,0,0,.45), 0 0 0 1px rgba(var(--rpg-accent-rgb), .08);
        backdrop-filter: blur(18px);
        opacity: 0;
        transform: translateY(8px) scale(.98);
        pointer-events: none;
        transition: opacity .16s ease, transform .16s ease;
      }
      .rpg-theme-panel.is-open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
      .rpg-theme-panel .theme-heading { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #f5f7fb; }
      .rpg-theme-panel .theme-subheading { margin-top: 4px; font-size: 11px; color: #8e97aa; line-height: 1.45; }
      .rpg-theme-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
      .rpg-theme-option {
        min-width: 0; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.025);
        border-radius: 11px; padding: 9px 6px 8px; cursor: pointer; color: #b8c0d0;
        display: flex; flex-direction: column; align-items: center; gap: 6px; transition: .16s ease;
      }
      .rpg-theme-option:hover { transform: translateY(-1px); border-color: rgba(var(--rpg-accent-rgb), .38); background: rgba(var(--rpg-accent-rgb), .07); }
      .rpg-theme-option.is-selected { border-color: var(--theme-color); color: #fff; box-shadow: inset 0 0 0 1px var(--theme-color), 0 0 18px rgba(var(--theme-rgb), .13); }
      .rpg-theme-swatch { width: 25px; height: 25px; border-radius: 50%; background: var(--theme-color); box-shadow: 0 0 14px rgba(var(--theme-rgb), .35); }
      .rpg-theme-name { font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
      .rpg-theme-footer { display:flex; align-items:center; justify-content:space-between; margin-top:13px; padding-top:11px; border-top:1px solid rgba(255,255,255,.07); }
      .rpg-theme-note { font-size: 10px; color:#727c90; }
      .rpg-theme-reset { border:0; background:transparent; color:#9ca5b7; font-size:10px; cursor:pointer; padding:5px 0; }
      .rpg-theme-reset:hover { color:#fff; }
      :root[data-rpg-theme] .btn-primary, :root[data-rpg-theme] .primary-btn, :root[data-rpg-theme] button.primary,
      :root[data-rpg-theme] .nav-item.active, :root[data-rpg-theme] .sidebar-item.active {
        --accent-color: var(--rpg-accent);
      }
      @media (max-width: 700px) {
        .rpg-theme-panel { width: min(285px, calc(100vw - 24px)); }
      }
    `;
    document.head.appendChild(style);
  }

  function findSidebarBottom() {
    return document.querySelector('.sideBottom, .sidebar-bottom, [class*="sideBottom"], [class*="sidebar-bottom"]');
  }

  function build() {
    const bottom = findSidebarBottom();
    if (!bottom || document.getElementById('rpg-theme-trigger')) return;

    const wrap = document.createElement('div');
    wrap.className = 'rpg-theme-wrap';
    wrap.style.position = 'relative';
    wrap.innerHTML = `
      <button id="rpg-theme-trigger" class="rpg-theme-trigger" type="button" aria-expanded="false" aria-controls="rpg-theme-panel">
        <span class="theme-dot" aria-hidden="true"></span>
        <span>Aparência</span>
      </button>
      <div id="rpg-theme-panel" class="rpg-theme-panel" role="radiogroup" aria-label="Tema da interface">
        <div class="theme-heading">Aparência</div>
        <div class="theme-subheading">Personalize a cor dos detalhes da sua interface.</div>
        <div class="rpg-theme-grid">
          ${THEMES.map(theme => `
            <button class="rpg-theme-option" type="button" role="radio" aria-label="Tema ${theme.name}" data-rpg-theme-option="${theme.id}" style="--theme-color:${theme.accent};--theme-rgb:${hexToRgb(theme.accent)}">
              <span class="rpg-theme-swatch" aria-hidden="true"></span>
              <span class="rpg-theme-name">${theme.name}</span>
            </button>
          `).join('')}
        </div>
        <div class="rpg-theme-footer">
          <span class="rpg-theme-note">Salvo neste dispositivo</span>
          <button class="rpg-theme-reset" id="rpg-theme-reset" type="button">Restaurar padrão</button>
        </div>
      </div>
    `;

    const profile = bottom.querySelector('.profile, [class*="profile"], button:last-child');
    bottom.insertBefore(wrap, profile || bottom.firstChild);

    const trigger = wrap.querySelector('#rpg-theme-trigger');
    const panel = wrap.querySelector('#rpg-theme-panel');

    function positionPanel() {
      const rect = trigger.getBoundingClientRect();
      panel.style.left = `${Math.max(12, rect.right - 285)}px`;
      panel.style.top = `${Math.max(12, rect.top - panel.offsetHeight - 10)}px`;
    }

    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const open = panel.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(open));
      if (open) requestAnimationFrame(positionPanel);
    });

    wrap.querySelectorAll('[data-rpg-theme-option]').forEach(option => {
      option.addEventListener('click', () => applyTheme(option.dataset.rpgThemeOption));
    });

    wrap.querySelector('#rpg-theme-reset').addEventListener('click', () => applyTheme('violet'));

    document.addEventListener('click', event => {
      if (!wrap.contains(event.target)) {
        panel.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('resize', () => {
      if (panel.classList.contains('is-open')) positionPanel();
    });

    applyTheme(currentTheme());
  }

  injectStyles();
  applyTheme(currentTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else build();

  const observer = new MutationObserver(() => {
    if (!document.getElementById('rpg-theme-trigger')) build();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
