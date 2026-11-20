/* global PARKING_DATA, escapeHtml, go */
(() => {
  let userId = '';
  let favorites = new Set();
  let selectedArea = '';
  let pendingDeleteId = '';

  const areaCenters = [
    ['Sentrum', 59.9139, 10.7413], ['Frogner', 59.9188, 10.7041], ['Majorstuen', 59.9296, 10.7147],
    ['St. Hanshaugen', 59.9270, 10.7380], ['Grünerløkka', 59.9238, 10.7594], ['Sagene', 59.9382, 10.7531],
    ['Torshov', 59.9387, 10.7705], ['Gamle Oslo', 59.9077, 10.7814], ['Helsfyr', 59.9127, 10.8037],
    ['Sinsen', 59.9385, 10.7854], ['Økern', 59.9289, 10.8060], ['Bjerke', 59.9414, 10.8241],
    ['Nydalen', 59.9505, 10.7680], ['Nordre Aker', 59.9560, 10.7500], ['Ullern', 59.9254, 10.6654],
    ['Røa', 59.9475, 10.6428], ['Alna', 59.9300, 10.8420], ['Grorud', 59.9594, 10.8810],
    ['Stovner', 59.9625, 10.9240], ['Østensjø', 59.8917, 10.8260], ['Nordstrand', 59.8617, 10.7950],
    ['Søndre Nordstrand', 59.8330, 10.8200]
  ];

  const storageKey = () => `parksmart-favorites:${userId}`;
  const encodedId = id => JSON.stringify(id).replace(/"/g, '&quot;');

  function favoriteArea(place) {
    const [latitude, longitude] = place.center;
    let best = areaCenters[0];
    let bestDistance = Infinity;
    areaCenters.forEach(area => {
      const latitudeScale = (latitude - area[1]) * 111;
      const longitudeScale = (longitude - area[2]) * 57;
      const distance = latitudeScale ** 2 + longitudeScale ** 2;
      if (distance < bestDistance) { best = area; bestDistance = distance; }
    });
    return best[0];
  }

  function savedPlaces() {
    return [...favorites].map(id => PARKING_DATA.find(place => place.id === id)).filter(Boolean);
  }

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

  function updateProfileSummary() {
    const count = document.getElementById('favoriteCount');
    const summary = document.getElementById('favoriteSummary');
    if (count) count.textContent = String(favorites.size);
    if (summary) summary.textContent = favorites.size === 0 ? 'Ingen lagrede plasser' : favorites.size === 1 ? '1 lagret plass' : `${favorites.size} lagrede plasser`;
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

  function renderAreaFilters(places) {
    const container = document.getElementById('favoriteAreaFilters');
    if (!container) return;
    const areas = [...new Set(places.map(favoriteArea))].sort((a, b) => a.localeCompare(b, 'nb'));
    if (selectedArea && !areas.includes(selectedArea)) selectedArea = '';
    container.innerHTML = areas.map(area => `<button type="button" data-favorite-area="${escapeHtml(area)}" class="${area === selectedArea ? 'selected' : ''}" aria-pressed="${area === selectedArea}" onclick="toggleFavoriteArea(${JSON.stringify(area).replace(/"/g, '&quot;')})">${escapeHtml(area)}</button>`).join('');
    container.hidden = areas.length === 0;
  }

  function placeRow(place) {
    const id = encodedId(place.id);
    return `<div class="favorite-browse-row"><button type="button" class="favorite-browse-main" onclick="appOpenDetails(${id}, 'favorites')"><span class="favorite-place-icon">★</span><span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(place.address || 'Adresse ikke oppgitt')}</small><em>${escapeHtml(favoriteArea(place))}</em></span><b>›</b></button><button type="button" class="favorite-trash" onclick="requestFavoriteDelete(${id})" aria-label="Slett ${escapeHtml(place.name)} fra favoritter"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/></svg></button></div>`;
  }

  window.renderFavoritePage = () => {
    const list = document.getElementById('favoriteBrowseList');
    const empty = document.getElementById('favoritePageEmpty');
    const count = document.getElementById('favoritePageCount');
    const search = document.getElementById('favoriteSearch');
    const clear = document.getElementById('favoriteSearchClear');
    if (!list || !empty || !count || !search) return;
    const allPlaces = savedPlaces();
    renderAreaFilters(allPlaces);
    const query = search.value.trim().toLocaleLowerCase('nb');
    if (clear) clear.hidden = query.length === 0;
    const visible = allPlaces.filter(place => {
      const area = favoriteArea(place);
      if (selectedArea && area !== selectedArea) return false;
      return !query || `${place.name} ${place.address || ''} ${area}`.toLocaleLowerCase('nb').includes(query);
    });
    const groups = new Map();
    visible.forEach(place => {
      const area = favoriteArea(place);
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(place);
    });
    list.innerHTML = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'nb')).map(([area, places]) => `<section class="favorite-area-group"><h3>${escapeHtml(area)}<span>${places.length}</span></h3>${places.sort((a, b) => a.name.localeCompare(b.name, 'nb')).map(placeRow).join('')}</section>`).join('');
    empty.hidden = visible.length > 0;
    count.textContent = visible.length === 1 ? '1 favorittplass' : `${visible.length} favorittplasser`;
  };

  window.openFavoritesPage = () => {
    if (!userId) { go('profile'); return; }
    selectedArea = '';
    const search = document.getElementById('favoriteSearch');
    if (search) search.value = '';
    window.renderFavoritePage();
    go('favorites');
  };

  window.clearFavoriteSearch = () => {
    const search = document.getElementById('favoriteSearch');
    if (search) { search.value = ''; search.focus(); }
    window.renderFavoritePage();
  };

  window.toggleFavoriteArea = area => {
    selectedArea = selectedArea === area ? '' : area;
    window.renderFavoritePage();
  };

  window.requestFavoriteDelete = id => {
    const place = PARKING_DATA.find(item => item.id === id);
    if (!place || !favorites.has(id)) return;
    pendingDeleteId = id;
    const text = document.getElementById('favoriteDeleteText');
    if (text) text.textContent = `Vil du faktisk slette «${place.name}» fra favorittene?`;
    const dialog = document.getElementById('favoriteDeleteDialog');
    if (dialog) dialog.hidden = false;
  };

  window.cancelFavoriteDelete = () => {
    pendingDeleteId = '';
    const dialog = document.getElementById('favoriteDeleteDialog');
    if (dialog) dialog.hidden = true;
  };

  window.confirmFavoriteDelete = () => {
    if (pendingDeleteId) favorites.delete(pendingDeleteId);
    pendingDeleteId = '';
    saveFavorites();
    window.cancelFavoriteDelete();
    updateProfileSummary();
    updateButtons();
    window.renderFavoritePage();
  };

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
    updateProfileSummary();
    updateButtons();
    window.renderFavoritePage();
  };

  const previousReceive = window.ParkSmartNative.receive;
  window.ParkSmartNative.receive = packet => {
    if (packet.type === 'authState') {
      userId = packet.user?.uid || '';
      loadFavorites();
      updateProfileSummary();
      updateButtons();
      window.renderFavoritePage();
    }
    previousReceive(packet);
  };

  updateProfileSummary();
  window.renderFavoritePage();
})();
