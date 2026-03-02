/**
 * ─────────────────────────────────────────────
 *  auth-guard.js
 *  Pega este script en dashboard.html y help.html
 *  ANTES de cerrar el </body>
 *
 *  Qué hace:
 *  1. Llama a /auth/me al cargar la página
 *  2. Si no hay sesión válida → redirige a /login.html
 *  3. Si hay sesión → inyecta el nombre del usuario en el sidebar
 *  4. Carga los servicios desde /api/services e inyecta las credenciales reales
 * ─────────────────────────────────────────────
 */

(async function authGuard() {
  try {
    // 1. Verificar sesión
    const meRes = await fetch('/auth/me', { credentials: 'same-origin' });

    if (!meRes.ok) {
      // No hay sesión válida → redirigir
      window.location.href = '/login.html?reason=unauthorized';
      return;
    }

    const { user } = await meRes.json();

    // 2. Inyectar nombre e iniciales en el sidebar
    const nameEl   = document.getElementById('sidebar-user-name');
    const avatarEl = document.getElementById('sidebar-user-avatar');
    const planEl   = document.getElementById('sidebar-user-plan');

    if (nameEl)   nameEl.textContent   = user.name;
    if (avatarEl) avatarEl.textContent = getInitials(user.name);
    if (planEl)   planEl.textContent   = user.role === 'admin' ? 'Admin' : 'Cliente';

    // 3. Cargar servicios y llenar credenciales en el dashboard
    if (document.getElementById('section-overview')) {
      await loadServices();
    }

  } catch (err) {
    console.error('Auth guard error:', err);
    window.location.href = '/login.html?reason=unauthorized';
  }
})();


// ─────────────────────────────────────────────
//  CARGAR SERVICIOS DEL USUARIO DESDE LA API
// ─────────────────────────────────────────────
async function loadServices() {
  try {
    const res      = await fetch('/api/services', { credentials: 'same-origin' });
    const { services } = await res.json();

    services.forEach(service => {
      const creds = service.credentials;

      switch (service.type) {

        case 'vps':
          fillField('vps-ip',   creds.ip   || '—');
          fillField('vps-user', creds.user  || '—');
          fillField('vps-pass', '••••••••••••', creds.password);
          fillField('vps-port', creds.port  || '22');
          updateServiceStatus('panel-vps', service.status);
          break;

        case 'cpanel':
          fillField('cp-url',  creds.url      || '—');
          fillField('cp-user', creds.user     || '—');
          fillField('cp-pass', '••••••••••••', creds.password);
          fillField('cp-ftp',  creds.ftp      || '—');
          fillField('cp-smtp', creds.smtp     || '—');
          fillField('cp-ns',   `${creds.ns1} · ${creds.ns2}` || '—');
          updateServiceStatus('panel-cpanel', service.status);
          break;

        case 'botia':
          if (service.status === 'active') {
            fillField('bot-token',    creds.token    || '—');
            fillField('bot-username', creds.username || '—');
            fillField('bot-apikey',   '••••••••••••', creds.api_key);
            fillField('bot-tokens',
              `${(creds.tokens_used || 0).toLocaleString()} / ${(creds.tokens_limit || 500000).toLocaleString()}`
            );
          }
          updateServiceStatus('panel-botia', service.status);
          break;

        case 'vpn':
          fillField('vpn-ip',   creds.server_ip  || '—');
          fillField('vpn-port', creds.port        || '51820');
          fillField('vpn-key',  '••••••••••••••••', creds.private_key);
          updateServiceStatus('panel-vpn', service.status);
          break;
      }
    });

  } catch (err) {
    console.error('Error cargando servicios:', err);
  }
}


// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

// Rellena un campo con su valor visible y guarda el valor real en data-real
function fillField(elementId, displayValue, realValue) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = displayValue;
  if (realValue !== undefined) {
    el.dataset.real = realValue; // usado por copyValue() y revealSecret()
  }
}

// Actualiza el badge de estado de un panel de servicio
function updateServiceStatus(panelId, status) {
  const panel  = document.getElementById(panelId);
  if (!panel) return;
  const badge  = panel.querySelector('.panel-status');
  if (!badge) return;

  const statusMap = {
    active:    { cls: 'active',   text: 'Activo' },
    pending:   { cls: 'pending',  text: 'Activando...' },
    suspended: { cls: 'inactive', text: 'Suspendido' },
  };
  const s = statusMap[status] || statusMap.pending;
  badge.className = `panel-status ${s.cls}`;
  badge.innerHTML = `<span class="status-led"></span> ${s.text}`;
}

// Obtiene las iniciales del nombre
function getInitials(name) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}