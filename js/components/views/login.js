/** Inicio de sesión con la cuenta compartida del hogar. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import * as auth from '../../api/auth.js';
import { getConfig, clearConfig, resetClient } from '../../api/client.js';
import { field, input, setFieldError } from '../ui/form.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';

export function render({ onDone, onReconfigure }) {
  let mode = 'signin';
  const root = h('div.auth-screen');

  const emailInput = input({
    name: 'email', type: 'email', placeholder: 'hogar@ejemplo.com',
    autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', inputmode: 'email',
  });
  const passwordInput = input({
    name: 'password', type: 'password', placeholder: '••••••••', autocomplete: 'current-password',
  });

  const title = h('h2', 'Entrar al hogar');
  const hint = h('p.muted.small', 'Usa el mismo correo y contraseña en todos los teléfonos de la casa.');
  const submit = h('button.btn.btn-primary.btn-block', { type: 'submit' }, 'Entrar');
  const switcher = h('button.btn.btn-ghost.btn-block', { type: 'button', onclick: toggleMode }, 'Crear la cuenta del hogar');

  const form = h('form.stack', { onsubmit: (event) => { event.preventDefault(); submitForm(); } },
    field('Correo', emailInput, { required: true }),
    field('Contraseña', passwordInput, { required: true }),
    submit,
    h('button.btn.btn-ghost.btn-sm.btn-block', { type: 'button', onclick: recover }, '¿Olvidaste la contraseña?'),
  );

  root.append(
    h('div.auth-brand',
      h('img', { src: './assets/icons/icon-192.png', alt: '', width: 64, height: 64 }),
      h('h1', 'Despensa'),
      h('p.muted', 'Control de lo que hay en casa'),
    ),
    h('div.card', title, hint, h('div.mt-2', form)),
    h('div.mt-2', switcher),
    h('button.btn.btn-ghost.btn-sm.btn-block.mt-2', { type: 'button', onclick: reconfigure },
      h('span', { html: icon('database', { size: 16 }) }), `Conectado a ${shortUrl()}`),
  );

  return root;

  function shortUrl() {
    try { return new URL(getConfig().url).hostname; } catch (_) { return 'la base de datos'; }
  }

  function toggleMode() {
    mode = mode === 'signin' ? 'signup' : 'signin';
    const signup = mode === 'signup';
    title.textContent = signup ? 'Crear la cuenta del hogar' : 'Entrar al hogar';
    hint.textContent = signup
      ? 'Crea una sola cuenta y compártela con tu familia: todos verán la misma despensa.'
      : 'Usa el mismo correo y contraseña en todos los teléfonos de la casa.';
    submit.textContent = signup ? 'Crear cuenta' : 'Entrar';
    switcher.textContent = signup ? 'Ya tengo una cuenta' : 'Crear la cuenta del hogar';
    passwordInput.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  }

  async function submitForm() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    setFieldError(emailInput, email ? null : 'Escribe el correo del hogar.');
    setFieldError(passwordInput, password ? null : 'Escribe la contraseña.');
    if (!email || !password) return;
    if (mode === 'signup' && password.length < 6) {
      setFieldError(passwordInput, 'Usa al menos 6 caracteres.');
      return;
    }

    submit.disabled = true;
    submit.textContent = mode === 'signup' ? 'Creando…' : 'Entrando…';
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await auth.signUp(email, password);
        if (needsConfirmation) {
          openSheet({
            title: 'Confirma tu correo',
            dialog: true,
            content: h('div',
              h('p', `Enviamos un enlace a ${email}. Ábrelo desde este dispositivo para activar la cuenta del hogar.`),
              h('div.notice.notice--info',
                h('span', { html: icon('info', { size: 18 }) }),
                h('span.grow', 'Si prefieres entrar de inmediato, desactiva «Confirm email» en Supabase → Authentication → Providers → Email.')),
            ),
            actions: [{ label: 'Entendido', variant: 'btn-primary', onClick: () => {} }],
          });
        } else {
          toastOk('Cuenta creada');
          onDone();
          return;
        }
      } else {
        await auth.signIn(email, password);
        onDone();
        return;
      }
    } catch (error) {
      toastError(error);
    } finally {
      submit.disabled = false;
      submit.textContent = mode === 'signup' ? 'Crear cuenta' : 'Entrar';
    }
  }

  async function recover() {
    const email = emailInput.value.trim();
    if (!email) {
      setFieldError(emailInput, 'Escribe primero el correo del hogar.');
      return;
    }
    try {
      await auth.sendPasswordReset(email);
      toastOk('Te enviamos un enlace para cambiar la contraseña');
    } catch (error) {
      toastError(error);
    }
  }

  async function reconfigure() {
    const ok = await confirmDialog({
      title: '¿Cambiar la conexión?',
      message: 'Podrás escribir la URL y la clave de otro proyecto de base de datos.',
      confirmText: 'Cambiar',
      danger: false,
    });
    if (!ok) return;
    clearConfig();
    resetClient();
    onReconfigure();
  }
}
