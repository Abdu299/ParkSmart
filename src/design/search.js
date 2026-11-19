/* global parkingMap */

(() => {
  const input = document.getElementById('findq');
  const screen = document.getElementById('find');
  const form = input?.closest('form');

  if (!input || !screen || !form || input.dataset.suggestionsReady) return;
  input.dataset.suggestionsReady = 'true';

  const style = document.createElement('style');

  style.textContent = `
    #find { position: relative; }

    .parking-search .search-clear {
      display: grid;
      place-items: center;
      flex: 0 0 30px;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: #e5ebf0;
      color: #647f92;
      -webkit-tap-highlight-color: transparent;
    }

    .parking-search .search-clear[hidden] {
      display: none;
    }

    .parking-search .search-clear:active {
      background: #d8e2eb;
    }

    .parking-search .search-clear:focus-visible {
      outline: 2px solid #8bbafa;
      outline-offset: 2px;
    }

    .parking-search .search-clear svg {
      display: block;
      width: 13px;
      height: 13px;
    }

    .address-suggestions {
      position: absolute;
      z-index: 1150;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #dce6ee;
      border-radius: 14px;
      background: white;
      box-shadow: 0 8px 24px #043b5226;
    }

    .address-suggestions[hidden] {
      display: none;
    }

    .address-suggestions-status {
      flex-shrink: 0;
      margin: 0;
      padding: 10px 12px 6px;
      font-size: 11px;
      line-height: 1.5;
      color: #647f92;
    }

    .address-suggestions-options {
      flex: 1;
      min-height: 0;
      max-height: 250px;
      overflow-y: auto;
      list-style: none;
      margin: 0;
      padding: 0 5px;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .address-suggestions-option {
      display: flex;
      width: 100%;
      min-height: 48px;
      align-items: center;
      gap: 10px;
      padding: 10px 9px;
      border: 0;
      border-radius: 9px;
      background: white;
      text-align: left;
      color: #0c2940;
    }

    .address-suggestions-option:hover,
    .address-suggestions-option[aria-selected="true"] {
      background: #edf4ff;
    }

    .address-suggestions-option svg {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      color: #0759d8;
    }

    .address-suggestions-option span {
      min-width: 0;
    }

    .address-suggestions-option strong {
      display: block;
      font-size: 13px;
      line-height: 1.4;
    }

    .address-suggestions-option small {
      display: block;
      margin-top: 2px;
      font-size: 10px;
      color: #647f92;
    }

    .address-suggestions-source {
      flex-shrink: 0;
      margin: 0;
      padding: 7px 12px;
      border-top: 1px solid #edf1f5;
      font-size: 9px;
      color: #718894;
    }
  `;

  document.head.appendChild(style);

  // ×-knapp mellom tekstfeltet og Søk-knappen.
  const clearButton = document.createElement('button');
  clearButton.id = 'clearSearchButton';
  clearButton.type = 'button';
  clearButton.className = 'search-clear';
  clearButton.setAttribute('aria-label', 'Tøm søket');
  clearButton.title = 'Tøm søket';

  clearButton.innerHTML = `
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="m4 4 8 8M12 4l-8 8"/>
    </svg>
  `;

  input.insertAdjacentElement('afterend', clearButton);

  function syncClearButton() {
    clearButton.hidden = input.value.length === 0;
  }

  clearButton.addEventListener('mousedown', event => {
    event.preventDefault();
  });

  clearButton.addEventListener('click', () => {
    close();
    input.value = '';
    syncClearButton();

    const searchStatus = document.getElementById('addressStatus');

    if (searchStatus) {
      searchStatus.textContent = '';
      searchStatus.hidden = true;
    }

    input.focus({ preventScroll: true });
  });

  syncClearButton();

  const panel = document.createElement('div');
  panel.className = 'address-suggestions';
  panel.hidden = true;

  panel.innerHTML = `
    <p
      class="address-suggestions-status"
      role="status"
      aria-live="polite"
    ></p>
    <ul
      id="addressSuggestionOptions"
      class="address-suggestions-options"
      role="listbox"
      aria-label="Adresseforslag i Oslo"
    ></ul>
    <p class="address-suggestions-source">
      Adresser fra Kartverket · Oslo
    </p>
  `;

  screen.appendChild(panel);

  const status = panel.querySelector('.address-suggestions-status');
  const list = panel.querySelector('ul');

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('enterkeyhint', 'search');
  input.setAttribute('spellcheck', 'false');

  let timer;
  let controller;
  let version = 0;
  let items = [];
  let activeIndex = -1;
  let mapState;

  const cache = new Map();

  const queryText = () => input.value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\*/g, '')
    .slice(0, 160);

  function bindMap() {
    if (typeof parkingMap === 'undefined' || !parkingMap) return null;
    if (mapState?.map === parkingMap) return mapState;

    const state = {
      map: parkingMap,
      zooming: false,
      pending: null,
    };

    state.map.on('zoomstart', () => {
      state.zooming = true;
    });

    state.map.on('zoomend', () => {
      state.zooming = false;

      const target = state.pending;
      state.pending = null;

      if (target) {
        state.map.setView(target, 16, { animate: false });
      }
    });

    mapState = state;
    return state;
  }

  function cancel() {
    window.clearTimeout(timer);
    controller?.abort();
    controller = null;
    version++;
  }

  function close() {
    cancel();
    panel.hidden = true;
    items = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function position() {
    if (panel.hidden) return;

    const field = form.getBoundingClientRect();
    const page = screen.getBoundingClientRect();
    const viewport = window.visualViewport;

    const visibleBottom = viewport
      ? viewport.height + viewport.offsetTop
      : window.innerHeight;

    const available =
      Math.min(page.bottom, visibleBottom) - field.bottom - 12;

    if (available < 48) {
      close();
      return;
    }

    panel.style.left = (field.left - page.left) + 'px';
    panel.style.top = (field.bottom - page.top + 5) + 'px';
    panel.style.width = field.width + 'px';
    panel.style.maxHeight = Math.min(320, available) + 'px';
  }

  function choose(item) {
    if (!item) return;

    const state = bindMap();

    close();
    input.value = item.label;
    syncClearButton();
    input.blur();

    window.ParkSmartNative.receive({
      type: 'searchResult',
      latitude: item.latitude,
      longitude: item.longitude,
      label: item.label,
    });

    const target = [item.latitude, item.longitude];

    if (state?.zooming) {
      state.pending = target;
    } else {
      state?.map.setView(target, 16, { animate: false });
    }
  }

  function render(results, message) {
    items = results;
    activeIndex = -1;
    list.replaceChildren();
    input.removeAttribute('aria-activedescendant');

    status.textContent =
      message || results.length + ' adresseforslag';

    results.forEach((item, index) => {
      const row = document.createElement('li');
      row.setAttribute('role', 'presentation');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'address-suggestions-option';
      button.id = 'addressSuggestion-' + index;
      button.tabIndex = -1;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');

      button.innerHTML = `
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          aria-hidden="true"
        >
          <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/>
          <circle cx="12" cy="10" r="2.5"/>
        </svg>
        <span>
          <strong></strong>
          <small></small>
        </span>
      `;

      button.querySelector('strong').textContent = item.title;
      button.querySelector('small').textContent = item.subtitle;

      button.addEventListener('mousedown', event => {
        event.preventDefault();
      });

      button.addEventListener('click', () => choose(item));

      row.appendChild(button);
      list.appendChild(row);
    });

    list.scrollTop = 0;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    position();
  }

  async function fetchAddresses(query, fuzzy, signal) {
    const params = new window.URLSearchParams({
      sok: fuzzy ? query : query + '*',
      kommunenummer: '0301',
      treffPerSide: '6',
      utkoordsys: '4326',
    });

    if (fuzzy) {
      params.set('fuzzy', 'true');
    }

    const response = await window.fetch(
      'https://ws.geonorge.no/adresser/v1/sok?' + params,
      { signal }
    );

    if (!response.ok) {
      throw new Error('Adressesøket er utilgjengelig');
    }

    const data = await response.json();
    const seen = new Set();

    const addresses = Array.isArray(data.adresser)
      ? data.adresser
      : [];

    return addresses.flatMap(address => {
      const latitude = address.representasjonspunkt?.lat;
      const longitude = address.representasjonspunkt?.lon;

      if (
        address.kommunenummer !== '0301' ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180 ||
        typeof address.adressetekst !== 'string'
      ) {
        return [];
      }

      const title = address.adressetekst.trim();

      const subtitle = [
        address.postnummer,
        address.poststed || 'Oslo',
      ].filter(Boolean).join(' ');

      const label = title + ', ' + subtitle;

      if (!title || seen.has(label)) return [];

      seen.add(label);

      return [{
        title,
        subtitle,
        label,
        latitude,
        longitude,
      }];
    }).slice(0, 6);
  }

  async function load(query, requestVersion) {
    const request = new window.AbortController();
    controller = request;

    const timeout = window.setTimeout(
      () => request.abort(),
      8000
    );

    const current = () =>
      requestVersion === version &&
      query === queryText() &&
      screen.classList.contains('active') &&
      document.activeElement === input;

    try {
      let results = await fetchAddresses(
        query,
        false,
        request.signal
      );

      if (!results.length) {
        results = await fetchAddresses(
          query,
          true,
          request.signal
        );
      }

      if (!current()) return;

      cache.set(query.toLowerCase(), {
        at: Date.now(),
        results,
      });

      if (cache.size > 30) {
        cache.delete(cache.keys().next().value);
      }

      render(
        results,
        results.length
          ? ''
          : 'Ingen adresseforslag i Oslo. Prøv gatenavn og nummer.'
      );
    } catch {
      if (current()) {
        render(
          [],
          'Kunne ikke hente forslag. Prøv Søk-knappen.'
        );
      }
    } finally {
      window.clearTimeout(timeout);

      if (controller === request) {
        controller = null;
      }
    }
  }

  function suggest() {
    bindMap();
    cancel();

    const query = queryText();

    if (
      query.length < 2 ||
      !screen.classList.contains('active')
    ) {
      close();
      return;
    }

    const cached = cache.get(query.toLowerCase());

    if (cached && Date.now() - cached.at < 300000) {
      render(
        cached.results,
        cached.results.length
          ? ''
          : 'Ingen adresseforslag i Oslo. Prøv gatenavn og nummer.'
      );
      return;
    }

    render([], 'Søker etter adresser …');

    const requestVersion = version;

    timer = window.setTimeout(
      () => load(query, requestVersion),
      250
    );
  }

  input.addEventListener('input', () => {
    syncClearButton();
    suggest();
  });

  input.addEventListener('focus', () => {
    syncClearButton();
    suggest();
  });

  input.addEventListener('keydown', event => {
    if (event.isComposing) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (panel.hidden || !items.length) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      choose(items[Math.max(0, activeIndex)]);
      return;
    }

    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;

    event.preventDefault();

    if (activeIndex < 0) {
      activeIndex = event.key === 'ArrowDown'
        ? 0
        : items.length - 1;
    } else {
      activeIndex = (
        activeIndex +
        (event.key === 'ArrowDown' ? 1 : -1) +
        items.length
      ) % items.length;
    }

    [...list.querySelectorAll('[role="option"]')].forEach(
      (button, index) => {
        button.setAttribute(
          'aria-selected',
          String(index === activeIndex)
        );
      }
    );

    const option = document.getElementById(
      'addressSuggestion-' + activeIndex
    );

    input.setAttribute('aria-activedescendant', option.id);
    option.scrollIntoView({ block: 'nearest' });
  });

  form.addEventListener('submit', event => {
    if (!panel.hidden && items.length) {
      event.preventDefault();
      event.stopImmediatePropagation();
      choose(items[Math.max(0, activeIndex)]);
    } else {
      close();
    }
  }, true);

  document.addEventListener('pointerdown', event => {
    if (
      !form.contains(event.target) &&
      !panel.contains(event.target)
    ) {
      close();
    }
  });

  document.addEventListener('focusin', event => {
    if (
      !form.contains(event.target) &&
      !panel.contains(event.target)
    ) {
      close();
    }
  });

  new window.MutationObserver(() => {
    if (!screen.classList.contains('active')) {
      close();
    } else {
      bindMap();
    }
  }).observe(screen, {
    attributes: true,
    attributeFilter: ['class'],
  });

  screen.addEventListener('scroll', position, true);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', position);
})();