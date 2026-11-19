// Theme selection shared by every page in the local app document.
(() => {
  const key = 'parksmart-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  let saved;
  try { saved = window.localStorage.getItem(key); } catch {}
  let dark = saved === 'dark' || (saved !== 'light' && system.matches);
  const buttons = [];
  const style = document.createElement('style');
  style.textContent = `
    .theme-toggle { min-height: 36px; white-space: nowrap; }
    #profile .theme-toggle { margin-top: 20px; }
    html[data-theme="dark"] { color-scheme: dark; --navy: #101f2c; --ink: #e5edf5; --blue: #8bb9ff; --pale: #192b3b; --line: #304253; --green: #6ad9a5; }
    html[data-theme="dark"] body,
    html[data-theme="dark"] .phone,
    html[data-theme="dark"] .screen { background: #101820; color: #e5edf5; }
    html[data-theme="dark"] :is(.scroll,.parking-toolbar,.guide-tools,.scan-panel,.app-nav,.parking-sheet,.parking-summary,.login-required) { background: #101820; color: #e5edf5; }
    html[data-theme="dark"] .top { background: #101f2c; }
    html[data-theme="dark"] :is(.card,.feature,.parking-result,.guide-item,.address-suggestions,.address-suggestions-option,.bubble.bot) { background: #192633; color: #e5edf5; border-color: #304253; }
    html[data-theme="dark"] :is(.search,.pill,.field,.vehicle button,.fit-button,.guide-thumb,.guide-hero,.profileavatar) { background: #223240; color: #e5edf5; border-color: #3b5062; }
    html[data-theme="dark"] :is(input,select) { color: #e5edf5; }
    html[data-theme="dark"] input::placeholder { color: #a0b2c2; opacity: 1; }
    html[data-theme="dark"] :is(.parking-controls select,.guide-categories select) { background: #223240; color: #e5edf5; border-color: #3b5062; }
    html[data-theme="dark"] :is(.btn,.pill.on) { background: #2768bd; color: white; }
    html[data-theme="dark"] .btn.outline { background: #192633; color: #a8ccff; border-color: #6095df; }
    html[data-theme="dark"] .vehicle button.on { background: #15394b; outline-color: #73bdcc; }
    html[data-theme="dark"] .app-nav button { background: #101820; color: #a4b7c8; }
    html[data-theme="dark"] .app-nav button.active { color: #a8ccff; }
    html[data-theme="dark"] .app-nav button.active .ico { background: #233c5b; }
    html[data-theme="dark"] :is(.muted,.footnote,.feature small,.parking-controls,.parking-result small,.guide-item small,.guide-intro,.guide-kicker,.guide-footnote,.guide-categories span,.parking-details-price,.scan-status,.scan-footnote,.address-suggestions-status,.address-suggestions-option small,.address-suggestions-source) { color: #abbecd; }
    html[data-theme="dark"] :is(.listrow,.guide-item,.parking-result,.guide-law,.address-suggestions-source) { border-color: #304253; }
    html[data-theme="dark"] :is(.notice,.map-hint) { background: #3c331c; color: #f3d797; }
    html[data-theme="dark"] :is(.tag,.success) { background: #153c30; color: #a2e4bf; }
    html[data-theme="dark"] :is(.feature .symbol,.guide-tip,.analysis-card) { background: #23384d !important; color: #c6ddf6; border-color: #304253; }
    html[data-theme="dark"] .guide-thumb,
    html[data-theme="dark"] .guide-hero { background: #e9eef2; }
    html[data-theme="dark"] .guide-hero span { background: #192633; color: #e5edf5; }
    html[data-theme="dark"] :is(.location-button,.parking-sources,.parking-sources a,.guide-footnote a) { background: transparent; color: #a8ccff; }
    html[data-theme="dark"] #find #listToggle { background: #20364d; border-color: #38516c; color: #b7d5ff; }
    html[data-theme="dark"] #find .parking-summary { background: #101820; }
    html[data-theme="dark"] #find #listToggle .list-toggle-content { color: #b7d5ff; }
    html[data-theme="dark"] #find #resultCount { color: #b2c5d6; }
    html[data-theme="dark"] #find #filterDescription { color: #abbecd; }
    html[data-theme="dark"] .address-suggestions-option:is(:hover,[aria-selected="true"]) { background: #263e57; }
    html[data-theme="dark"] .parking-search .search-clear { background: #344757; color: #d2e2ef; }
    html[data-theme="dark"] :is(.parksmart-recenter button,.leaflet-control-zoom a) { background: #192633; border-color: #3b5062; color: #b7d5ff; }
    html[data-theme="dark"] .leaflet-control-zoom { border-color: #3b5062; }
    html[data-theme="dark"] .leaflet-tile-pane { filter: brightness(.48) saturate(.6); }
    html[data-theme="dark"] #parkingMap { background-color: #15212a; }
    html[data-theme="dark"] :is(.leaflet-popup-content-wrapper,.leaflet-popup-tip,.map-empty,.map-legend) { background: #192633; color: #e5edf5; }
    html[data-theme="dark"] .parking-popup { color: #e5edf5; }
    html[data-theme="dark"] .leaflet-control-attribution { background: #101820e6; color: #b2c5d6; }
    html[data-theme="dark"] .leaflet-control-attribution a { color: #a8ccff; }
  `;
  document.head.appendChild(style);

  function apply() {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    buttons.forEach(button => {
      button.textContent = dark ? '☀ Lys modus' : '☾ Mørk modus';
      button.setAttribute('aria-label', dark ? 'Bytt til lys modus' : 'Bytt til mørk modus');
    });
    const packet = { type: 'theme', theme: dark ? 'dark' : 'light' };
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(packet));
    else if (window.parent !== window) window.parent.postMessage({ channel: 'parksmart:request', payload: packet }, '*');
  }

  function button() {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'pill theme-toggle';
    element.addEventListener('click', () => {
      dark = !dark;
      saved = dark ? 'dark' : 'light';
      try { window.localStorage.setItem(key, saved); } catch {}
      apply();
    });
    buttons.push(element);
    return element;
  }
  const homeHeader = document.querySelector('#home .scroll > .row.spread');
  if (homeHeader) {
    const notification = homeHeader.querySelector(':scope > button');
    if (notification) notification.replaceWith(button());
    else homeHeader.appendChild(button());
  }
  document.querySelector('#profile .login-required')?.appendChild(button());
  system.addEventListener('change', event => {
    if (saved !== 'dark' && saved !== 'light') { dark = event.matches; apply(); }
  });
  apply();
})();
