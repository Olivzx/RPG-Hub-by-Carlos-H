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

  // Realtime da mesa: carrega somente na página que possui a camada de tokens.
  window.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('tokenLayer')) return;
    const script = document.createElement('script');
    script.src = 'table-realtime.js?v=20260927';
    script.async = true;
    document.body.appendChild(script);
  });
})();