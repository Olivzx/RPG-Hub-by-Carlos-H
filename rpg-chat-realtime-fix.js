/* RPG HUB — chat realtime bridge.
   The chat is persisted in campaign_chat_messages and mirrored through
   Supabase Broadcast so a new message appears immediately on every client.
*/
(() => {
  let boundChannel = null;

  function receiveChatBroadcast(message) {
    const row = message?.payload?.record;
    const state = window.state;
    if (!row?.id || !state?.campaign || row.campaign_id !== state.campaign.id) return;
    if (state.chatMessages?.some(item => item.id === row.id)) return;

    state.chatMessages = [...(state.chatMessages || []), row].slice(-200);
    window.renderAll?.();
  }

  function bind() {
    const channel = window.state?.campaignChannel;
    if (!channel || channel === boundChannel) return;

    boundChannel = channel;
    channel.on(
      'broadcast',
      { event: 'chat_message' },
      receiveChatBroadcast
    );

    console.info('[RPG HUB] Chat realtime bridge conectado.');
  }

  // app.js creates/recreates the campaign channel asynchronously, including
  // when the user changes campaign. Rebind whenever that channel changes.
  const timer = setInterval(bind, 250);
  window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
})();
