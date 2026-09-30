/* RPG HUB — public browser client.
   The publishable key is intentionally client-safe. Never put a service_role/secret key here. */
(() => {
  const SUPABASE_URL = 'https://ymexyrqgqpktxzajgsdi.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dUDAD55Y6jTIni-gk_z8DQ_e9AaCLPa';
  if (!window.supabase?.createClient) {
    throw new Error('Supabase JS não carregou.');
  }
  window.rpgSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // Carrega a camada multiplayer adicional depois dos módulos principais.
  // Ela espera o estado da mesa existir antes de inicializar presença/combate.
  const loadMultiplayerLayer = () => {
    if (window.__rpgMultiplayerLayerLoaded) return;
    window.__rpgMultiplayerLayerLoaded = true;
    const script = document.createElement('script');
    script.src = 'rpg-multiplayer-combat.js?v=20260929';
    script.async = true;
    document.head.appendChild(script);
  };

  const loadChatRealtimeFix = () => {
    if (window.__rpgChatRealtimeFixLoaded) return;
    window.__rpgChatRealtimeFixLoaded = true;
    const script = document.createElement('script');
    script.src = 'rpg-chat-realtime-fix.js?v=20260930-1';
    script.async = true;
    document.head.appendChild(script);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(loadMultiplayerLayer, 700);
      setTimeout(loadChatRealtimeFix, 900);
    }, { once: true });
  } else {
    setTimeout(loadMultiplayerLayer, 700);
    setTimeout(loadChatRealtimeFix, 900);
  }
})();
