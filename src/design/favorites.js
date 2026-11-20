/* global PARKING_DATA, escapeHtml, go */
(() => {
  let userId = '';
  let favorites = new Set();

  const storageKey = () => `parksmart-favorites:${userId}`;
  const encodedId = id => JSON.stringify(id).replace(/"/g, '&quot;');

  function loadFavorites() {
    favorites = new Set();
    if (!userId) return;
    try {
      const value = JSON.parse(window.localStorage.getItem(storageKey()) || '[]');
      if (Array.isArray(value)) value.filter(id => typeof id === 'string').forEach(id => favorites.add(id));
    } catch {}
    const validIds = new Set(PARKING_DATA.map(place => place.id));
    favorites = new Set([...favorites].filter(id => validIds.has(id)));
  }

  function saveFavorites() {
    if (!userId) return;
    try { window.localStorage.setItem(storageKey(), JSON.stringify([...favorites])); } catch {}
  }

  function updateButtons() {
    document.querySelectorAll('[data-favorite-id]').forEach(button => {
      const saved = favorites.has(button.dataset.favoriteId);
      button.classList.toggle('saved', saved);
      button.setAttribute('aria-pressed', String(saved));
      button.setAttribute('aria-label', saved ? 'Fjern fra favoritter' : 'Legg til i favoritter');
      const star = button.querySelector('.favorite-star');
      if (star) star.textContent = saved ? '★' : '☆';
      const label = button.querySelector('.favorite-label');
      if (label) label.textContent = saved ? 'Lagret' : 'Favoritt';
    });
  }

  function renderFavorites() {
    const list = document.getElementById('favoriteList');
    const empty = document.getElementById('favoriteEmpty');
    const count = document.getElementById('favoriteCount');
    if (!list || !empty || !count) return;
    const places = [...favorites].map(id => PARKING_DATA.find(place => place.id === id)).filter(Boolean);
    count.textContent = `${places.length} lagret`;
    empty.hidden = places.length > 0;
    list.innerHTML = places.map(place => {
      const id = encodedId(place.id);
      return `<div class="favorite-place"><button type="button" class="favorite-place-main" onclick="appOpenDetails(${id})"><span class="favorite-place-icon">★</span><span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.address || 'Adresse ikke oppgitt')}</small></span><b>›</b></button><button type="button" class="favorite-remove" onclick="toggleFavorite(${id})" aria-label="Fjern ${escapeHtml(place.name)} fra favoritter">×</button></div>`;
    }).join('');
    updateButtons();
  }

  window.favoriteButton = (id, variant = '') => {
    const saved = favorites.has(id);
    const label = saved ? 'Lagret' : 'Favoritt';
    return `<button type="button" class="favorite-button ${variant === 'compact' ? 'favorite-compact' : 'favorite-detail'}${saved ? ' saved' : ''}" data-favorite-id="${escapeHtml(id)}" aria-pressed="${saved}" aria-label="${saved ? 'Fjern fra favoritter' : 'Legg til i favoritter'}" onclick="event.stopPropagation();toggleFavorite(${encodedId(id)})"><span class="favorite-star" aria-hidden="true">${saved ? '★' : '☆'}</span>${variant === 'compact' ? '' : `<span class="favorite-label">${label}</span>`}</button>`;
  };

  window.toggleFavorite = id => {
    if (!userId) {
      go('profile');
      const status = document.getElementById('authStatus');
      if (status) { status.textContent = 'Logg inn for å lagre favorittplasser.'; status.classList.remove('error'); }
      return;
    }
    if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
    saveFavorites();
    updateButtons();
    renderFavorites();
  };

  const previousReceive = window.ParkSmartNative.receive;
  window.ParkSmartNative.receive = packet => {
    if (packet.type === 'authState') {
      userId = packet.user?.uid || '';
      loadFavorites();
      renderFavorites();
      updateButtons();
    }
    previousReceive(packet);
  };

  renderFavorites();
})();
