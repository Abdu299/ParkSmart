/* global nativeSend */
(() => {
  let mode = 'login';
  let busy = false;
  let currentEmail = '';
  const vehicleKey = 'parksmart-default-vehicle';

  const byId = id => document.getElementById(id);
  const status = (message, error = false) => {
    const target = byId('authSignedIn')?.hidden === false ? byId('authProfileStatus') : byId('authStatus');
    if (!target) return;
    target.textContent = message || '';
    target.classList.toggle('error', error);
  };

  function setBusy(value) {
    busy = value;
    document.querySelectorAll('#profile input, #profile button').forEach(element => { element.disabled = value; });
    document.querySelectorAll('#profile .auth-submit').forEach(button => {
      if (!button.dataset.label) button.dataset.label = button.textContent;
      button.textContent = value ? 'Vennligst vent …' : button.dataset.label;
    });
  }

  window.setAuthMode = next => {
    if (busy || !['login', 'register'].includes(next)) return;
    mode = next;
    byId('authLoginForm').hidden = mode !== 'login';
    byId('authRegisterForm').hidden = mode !== 'register';
    byId('authLoginTab').setAttribute('aria-selected', String(mode === 'login'));
    byId('authRegisterTab').setAttribute('aria-selected', String(mode === 'register'));
    status('');
  };

  window.toggleAuthPassword = (id, button) => {
    const field = byId(id);
    if (!field) return;
    const visible = field.type === 'text';
    field.type = visible ? 'password' : 'text';
    button.textContent = visible ? 'Vis' : 'Skjul';
    button.setAttribute('aria-label', visible ? 'Vis passord' : 'Skjul passord');
    field.focus({ preventScroll: true });
  };

  window.submitAuthLogin = event => {
    event?.preventDefault();
    if (busy) return;
    status('');
    nativeSend({ type: 'authLogin', email: byId('authLoginEmail').value, password: byId('authLoginPassword').value });
  };

  window.submitAuthRegistration = event => {
    event?.preventDefault();
    if (busy) return;
    const password = byId('authRegisterPassword').value;
    if (password !== byId('authRegisterConfirm').value) { status('Passordene er ikke like.', true); return; }
    if (password.length < 6) { status('Passordet må ha minst 6 tegn.', true); return; }
    status('');
    nativeSend({ type: 'authRegister', email: byId('authRegisterEmail').value, password });
  };

  window.requestPasswordReset = () => {
    const email = byId('authLoginEmail').value.trim();
    if (!email) { status('Skriv inn e-postadressen først.', true); return; }
    nativeSend({ type: 'authReset', email });
  };

  window.logoutParkSmart = () => { if (!busy) nativeSend({ type: 'authLogout' }); };
  window.resetSignedInPassword = () => {
    if (!busy && currentEmail) nativeSend({ type: 'authReset', email: currentEmail });
  };

  window.setProfileVehicle = value => {
    if (!['Bil', 'MC'].includes(value)) return;
    try { window.localStorage.setItem(vehicleKey, value); } catch {}
    document.querySelectorAll('[data-profile-vehicle]').forEach(button => {
      const selected = button.dataset.profileVehicle === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (typeof window.changeVehicle === 'function') window.changeVehicle(value);
  };

  function receiveState(packet) {
    const signedIn = !!packet.user;
    byId('authSignedOut').hidden = signedIn;
    byId('authSignedIn').hidden = !signedIn;
    if (signedIn) {
      currentEmail = packet.user.email || '';
      byId('authUserEmail').textContent = currentEmail || 'ParkSmart-bruker';
      status('');
    } else if (packet.configured === false) {
      currentEmail = '';
      status('Firebase må konfigureres før innlogging kan brukes.', true);
    } else currentEmail = '';
  }

  const previousReceive = window.ParkSmartNative.receive;
  window.ParkSmartNative.receive = packet => {
    if (packet.type === 'authState') { receiveState(packet); return; }
    if (packet.type === 'authBusy') { setBusy(!!packet.value); return; }
    if (packet.type === 'authError') { status(packet.message || 'Noe gikk galt.', true); return; }
    if (packet.type === 'authMessage') { status(packet.message || 'Ferdig.'); return; }
    if (packet.type === 'authSuccess') { status(''); return; }
    previousReceive(packet);
  };

  let savedVehicle = 'Bil';
  try { savedVehicle = window.localStorage.getItem(vehicleKey) || 'Bil'; } catch {}
  window.setProfileVehicle(savedVehicle === 'MC' ? 'MC' : 'Bil');
})();
