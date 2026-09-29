/* RPG HUB — authentication hardening */
(() => {
  'use strict';

  const sb = window.rpgSupabase;
  if (!sb?.auth) return;

  const params = new URLSearchParams(location.search);
  const isRecovery = params.get('type') === 'recovery' || /type=recovery/i.test(location.hash);
  const realGetSession = sb.auth.getSession.bind(sb.auth);

  /* The legacy login page redirects any valid session immediately.
     During password recovery, keep the recovery session on this page. */
  if (isRecovery) {
    sb.auth.getSession = async (...args) => {
      const result = await realGetSession(...args);
      if (result?.data?.session) {
        return {
          ...result,
          data: { ...result.data, session: null }
        };
      }
      return result;
    };
  }

  const $ = (id) => document.getElementById(id);

  function setMessage(text, type='') {
    const node = $('authMessage');
    if (!node) return;
    node.className = 'formMessage' + (type ? ' ' + type : '');
    node.textContent = text || '';
  }

  function removeMasterRegistrationOption() {
    const select = $('accountType');
    if (!select) return;
    Array.from(select.options).forEach(option => {
      if (option.value === 'master') option.remove();
    });
    select.value = 'player';
    select.disabled = true;
  }

  async function setupRecovery() {
    const result = await realGetSession();
    if (!result?.data?.session) {
      setMessage('O link de redefinição expirou ou é inválido. Solicite outro link.', 'error');
      return;
    }

    const form = $('authForm');
    if (!form) return;

    $('loginTab')?.classList.remove('active');
    $('registerTab')?.classList.remove('active');
    $('displayNameField')?.classList.add('hidden');
    $('accountTypeField')?.classList.add('hidden');
    $('forgotBtn')?.classList.add('hidden');

    $('authTitle').textContent = 'Definir nova senha';
    $('authSubtitle').textContent = 'Escolha uma nova senha para voltar à sua campanha.';

    form.innerHTML = `
      <label>Nova senha<input id="recoveryPassword" type="password" autocomplete="new-password" minlength="6" required placeholder="••••••••"></label>
      <label>Confirmar senha<input id="recoveryPasswordConfirm" type="password" autocomplete="new-password" minlength="6" required placeholder="••••••••"></label>
      <button class="primaryButton full" id="recoverySubmit" type="submit"><span>Salvar nova senha</span><span>→</span></button>
    `;

    form.onsubmit = async (event) => {
      event.preventDefault();
      const password = $('recoveryPassword').value;
      const confirm = $('recoveryPasswordConfirm').value;
      const button = $('recoverySubmit');

      if (password.length < 6) {
        setMessage('A senha precisa ter pelo menos 6 caracteres.', 'error');
        return;
      }
      if (password !== confirm) {
        setMessage('As senhas não coincidem.', 'error');
        return;
      }

      button.disabled = true;
      setMessage('Salvando…');

      try {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        setMessage('Senha atualizada. Abrindo sua campanha…', 'success');
        history.replaceState({}, document.title, 'login.html');
        setTimeout(() => { location.href = 'mesa.html'; }, 500);
      } catch (error) {
        setMessage(error.message || 'Não foi possível atualizar a senha.', 'error');
      } finally {
        button.disabled = false;
      }
    };
  }

  function hardenForgotPassword() {
    if (isRecovery) return;
    const button = $('forgotBtn');
    const email = $('email');
    if (!button || button.dataset.rpgAuthHardened) return;
    button.dataset.rpgAuthHardened = '1';
    button.onclick = async () => {
      const value = email?.value.trim();
      if (!value) {
        setMessage('Digite seu e-mail primeiro.', 'error');
        return;
      }
      const { error } = await sb.auth.resetPasswordForEmail(value, {
        redirectTo: location.origin + location.pathname + '?type=recovery'
      });
      setMessage(
        error?.message || 'Se o e-mail existir, o link de redefinição foi enviado.',
        error ? 'error' : 'success'
      );
    };
  }

  function init() {
    removeMasterRegistrationOption();
    hardenForgotPassword();
    if (isRecovery) setupRecovery();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
