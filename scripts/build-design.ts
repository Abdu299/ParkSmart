import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { designData } from '../src/design/adapter';
import type { Dataset } from '../src/domain/types';
const dataset = JSON.parse(await readFile('src/data/parking-oslo.json','utf8')) as Dataset;
let html = await readFile('assets/design/reference.html','utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
const parking = scripts.find(m=>m[1].startsWith('const PARKING_DATA='));
if (!parking) throw new Error('Missing reference dataset');
html = html.replace(parking[0], '<script>const PARKING_DATA='+JSON.stringify(designData(dataset)).replace(/</g,'\\u003c')+';</script>');
html = html.replace("const DATA_DATE='03.11.2026';", "const DATA_DATE="+JSON.stringify(dataset.fetchedAt.slice(0,10))+';');
html = html.replace(/<section id="profile"[\s\S]*?<\/section>/, authPage());
html = html.replace(/<section id="ai"[\s\S]*?<\/section>/, aiPage());
// Keep one shared navigation bar as a sibling of every screen.
html = html.replace(/<div class="nav" data-nav="[^"]+"><\/div>/g, '');
const phoneEnd = /(<\/section>\s*)<\/div>(?=<script>)/;
if (!phoneEnd.test(html)) throw new Error('Missing end of app shell');
html = html.replace(phoneEnd, '$1'+appNavigation()+'</div>');
html = html.replace('<section id="welcome" class="screen active">', '<section id="welcome" class="screen">');
html = html.replace('<section id="home" class="screen">', '<section id="home" class="screen active">');
html = html.replace('<span id="homearea">Oslo sentrum</span>', '<button id="homearea" onclick="requestHomeLocation()" style="border:0;background:none;font-weight:700;color:inherit;padding:0">Gi tilgang til posisjon</button>');
html = html.replace('<span class="map-version">v36</span>','<button class="map-version" onclick="refreshAppData()" style="border:0;background:none;color:white">↻ Oppdater</button>');
html = html.replace(/<div class="parking-summary">[\s\S]*?<\/div>/, `<div class="parking-summary">
  <button id="listToggle" onclick="toggleParkingList()" aria-label="Vis parkeringsliste" aria-describedby="resultCount totalCount" aria-expanded="false" aria-controls="results">
    <svg class="list-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="3.5" cy="6" r=".8" fill="currentColor"/><circle cx="3.5" cy="12" r=".8" fill="currentColor"/><circle cx="3.5" cy="18" r=".8" fill="currentColor"/></svg>
    <span class="list-toggle-content"><strong id="listToggleLabel">Vis parkeringsliste</strong><small id="resultCount">Parkeringsplasser</small><small id="totalCount"></small></span>
    <svg class="list-toggle-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
  </button>
  <button class="fit-button" onclick="showAllParking()" aria-label="Tilpass kart til alle treff">⤢</button>
</div>`);
html = html.replace('<div class="parking-filters" role=', '<div class="parking-filters" role=');
html = html.replace('<div id="addressStatus"', '<div class="parking-controls"><label>Pris for <select id="fuelSelect" onchange="renderResults()"><option value="regular">Bensin/diesel/hybrid</option><option value="electric">Elbil</option></select></label><button class="pill" id="freeNowButton" onclick="toggleFreeNow()">Avgiftsfritt nå</button></div><div id="addressStatus"');
html = html.replace('<button class="pill" data-filter="Parkeringshus"', '<button class="pill" data-filter="Betaling" onclick="filter(this)">Betaling</button><button class="pill" data-filter="HC" onclick="filter(this)">HC</button><button class="pill" data-filter="Lading" onclick="filter(this)">Lading</button><button class="pill" data-filter="Parkeringshus"');
html = html.replace(/<details class="parking-sources">[\s\S]*?<\/details>/, '<details class="parking-sources"><summary>Kartdata og vilkår · '+dataset.fetchedAt.slice(0,10)+'</summary><p>Oslo kommune og Statens vegvesen. Kartbakgrunn: Kartverket. Markører viser steder og strekninger, ikke ledighet. HC/lading kan vise egenskaper ved hele områder. Næradresser er omtrentlige. Skiltingen på stedet gjelder.</p><p>Avgiftsfrie plasser i registeret bekrefter ikke fri tilgang. Prisavvik gir ukjent tidsstatus. <button class="pill" onclick="refreshAppData()">Oppdater data</button></p></details>');
html = html.replace(/(<button class="feature" onclick=")go\('find'\)("><span class="symbol">🔎)/, "$1go('ai')$2");
// Leaflet auto-pans when a popup is close to the edge. That movement used to
// trigger drawParking(), which cleared the marker layer and immediately closed
// the popup. Keep the current layer while a popup is open; normal map movement
// redraws again after the popup is closed.
html = html.replace(
  "parkingMap.on('moveend',drawParking);",
  "parkingMap.on('moveend',()=>{if(!parkingMap._popup)drawParking();});"
);
const css = '<style>'+await readFile('src/design/app.css','utf8')+'\n'+await readFile('src/design/ai.css','utf8')+'</style>';
html = html.replace('Bildet sendes til OpenAI for analyse. API-bruk kan koste penger.', 'Bildet blir på enheten i denne versjonen. Automatisk analyse er ikke tilkoblet.');
const bridge = await readFile('src/design/bridge.js','utf8');
const search = await readFile('src/design/search.js','utf8');
const mapControls = await readFile('src/design/map-controls.js','utf8');
const theme = await readFile('src/design/theme.js','utf8');
const auth = await readFile('src/design/auth.js','utf8');
const favorites = await readFile('src/design/favorites.js','utf8');
const ai = await readFile('src/design/ai.js','utf8');
// Keep navigation working with both the previous and updated bridge.js.
const navigationBridge = `
function syncAppNavigation() {
  const screen = document.querySelector('.screen.active')?.id || 'home';
  const tab = ['find', 'map', 'details', 'payment'].includes(screen)
    ? 'map'
    : ['scan', 'signPreview', 'signResult', 'recognized', 'guideDetail'].includes(screen)
      ? 'guide'
      : screen;
  document.querySelectorAll('#appNavigation [data-tab]').forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}
const goBeforeSharedNavigation = go;
go = function(id) {
  goBeforeSharedNavigation(id);
  syncAppNavigation();
};
function syncParkingListButton() {
  const sheet = document.getElementById('parkingSheet');
  const button = document.getElementById('listToggle');
  const label = document.getElementById('listToggleLabel');
  if (!sheet || !button || !label) return;
  const expanded = sheet.classList.contains('expanded');
  const text = expanded ? 'Skjul parkeringslisten' : 'Vis parkeringsliste';
  label.textContent = text;
  button.setAttribute('aria-label', text);
  button.setAttribute('aria-expanded', String(expanded));
}
const parkingSheetForListButton = document.getElementById('parkingSheet');
if (parkingSheetForListButton) {
  new MutationObserver(syncParkingListButton).observe(parkingSheetForListButton, {
    attributes: true,
    attributeFilter: ['class']
  });
}
syncParkingListButton();
go('home');
`;
html = html.replace('</head>',css+'</head>').replace('</body>','<script>'+bridge+'\n'+navigationBridge+'\n'+search+'\n'+mapControls+'\n'+theme+'\n'+auth+'\n'+favorites+'\n'+ai+'</script></body>');
await mkdir('src/design',{recursive:true});
await writeFile('src/design/document.json',JSON.stringify({html}));
await writeFile('assets/design/parksmart.html',html);
console.log('Built matching design:',html.length,'characters; signs preserved; parking records',dataset.locations.length);
function authPage() {
 return `<section id="profile" class="screen">
  <div class="top"><h2><button class="back" onclick="go('home')" aria-label="Tilbake til hjem">‹</button>Min profil</h2></div>
  <div class="scroll auth-page">
   <div id="authSignedOut" class="auth-card">
    <div class="auth-brand" aria-hidden="true">P</div>
    <h2>Velkommen til ParkSmart</h2>
    <p class="muted">Logg inn for å lagre favoritter og parkeringsvalg.</p>
    <div class="auth-tabs" role="tablist" aria-label="Innlogging eller registrering">
     <button id="authLoginTab" type="button" role="tab" aria-selected="true" onclick="setAuthMode('login')">Logg inn</button>
     <button id="authRegisterTab" type="button" role="tab" aria-selected="false" onclick="setAuthMode('register')">Registrer deg</button>
    </div>
    <form id="authLoginForm" class="auth-form" onsubmit="submitAuthLogin(event)">
     <label>E-post<input id="authLoginEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" maxlength="254" placeholder="navn@epost.no" required></label>
     <label>Passord<span class="auth-password"><input id="authLoginPassword" type="password" autocomplete="current-password" placeholder="Passord" required><button type="button" onclick="toggleAuthPassword('authLoginPassword',this)" aria-label="Vis passord">Vis</button></span></label>
     <button class="btn auth-submit" type="submit">Logg inn</button>
     <button class="auth-link" type="button" onclick="requestPasswordReset()">Glemt passord?</button>
    </form>
    <form id="authRegisterForm" class="auth-form" onsubmit="submitAuthRegistration(event)" hidden>
     <label>E-post<input id="authRegisterEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" maxlength="254" placeholder="navn@epost.no" required></label>
     <label>Passord<span class="auth-password"><input id="authRegisterPassword" type="password" autocomplete="new-password" minlength="6" placeholder="Minst 6 tegn" required><button type="button" onclick="toggleAuthPassword('authRegisterPassword',this)" aria-label="Vis passord">Vis</button></span></label>
     <label>Gjenta passord<span class="auth-password"><input id="authRegisterConfirm" type="password" autocomplete="new-password" minlength="6" placeholder="Skriv passordet igjen" required><button type="button" onclick="toggleAuthPassword('authRegisterConfirm',this)" aria-label="Vis passord">Vis</button></span></label>
     <small class="auth-hint">Passordet må ha minst 6 tegn.</small>
     <button class="btn auth-submit" type="submit">Opprett konto</button>
    </form>
    <p id="authStatus" class="auth-status" role="status" aria-live="polite"></p>
   </div>
   <div id="authSignedIn" class="auth-card auth-profile" hidden>
    <div class="profile-account">
     <div class="profileavatar" aria-hidden="true">${navIcon('profile')}</div>
     <div><small>INNLOGGET SOM</small><h2 id="authUserEmail"></h2></div>
    </div>
    <section class="profile-section" aria-labelledby="favoritesTitle">
     <div class="profile-section-title"><div><small>DINE STEDER</small><h3 id="favoritesTitle">Favorittplasser</h3></div><span id="favoriteCount" class="profile-coming">0 lagret</span></div>
     <div id="favoriteEmpty" class="profile-empty"><span aria-hidden="true">☆</span><div><strong>Ingen stjernemerkede plasser ennå</strong><p>Trykk på stjernen i kartet eller på detaljsiden for å lagre en plass her.</p></div></div>
     <div id="favoriteList" class="favorite-list" aria-live="polite"></div>
    </section>
    <section class="profile-section" aria-labelledby="appearanceTitle">
     <div class="profile-section-title"><div><small>INNSTILLINGER</small><h3 id="appearanceTitle">Utseende</h3></div></div>
     <p class="profile-setting-label">Fargetema</p>
     <div class="profile-segments" role="group" aria-label="Velg fargetema">
      <button type="button" data-theme-choice="system" onclick="setParkSmartTheme('system')">Automatisk</button>
      <button type="button" data-theme-choice="light" onclick="setParkSmartTheme('light')">Lys</button>
      <button type="button" data-theme-choice="dark" onclick="setParkSmartTheme('dark')">Mørk</button>
     </div>
     <p class="profile-setting-help">Automatisk følger innstillingen på telefonen.</p>
     <p class="profile-setting-label">Standard kjøretøy</p>
     <div class="profile-segments profile-vehicle-choice" role="group" aria-label="Velg standard kjøretøy">
      <button type="button" data-profile-vehicle="Bil" onclick="setProfileVehicle('Bil')">🚘 Bil</button>
      <button type="button" data-profile-vehicle="MC" onclick="setProfileVehicle('MC')">🏍 MC</button>
     </div>
    </section>
    <section class="profile-section" aria-labelledby="accountTitle">
     <div class="profile-section-title"><div><small>SIKKERHET</small><h3 id="accountTitle">Konto</h3></div></div>
     <button class="profile-action profile-action-soon" type="button" disabled><span>♙</span><span><strong>Personlige opplysninger</strong><small>Navn, kontaktinformasjon og kontodetaljer</small></span><em>Kommer snart</em></button>
     <button class="profile-action" type="button" onclick="resetSignedInPassword()"><span>✉</span><span><strong>Endre passord</strong><small>Få tilsendt en sikker lenke på e-post</small></span><b>›</b></button>
     <button class="profile-action profile-action-danger profile-action-soon" type="button" disabled><span>×</span><span><strong>Slett konto</strong><small>Slett kontoen og tilknyttede data permanent</small></span><em>Kommer snart</em></button>
     <button class="btn outline profile-logout" type="button" onclick="logoutParkSmart()">Logg ut</button>
    </section>
    <p id="authProfileStatus" class="auth-status" role="status" aria-live="polite"></p>
   </div>
  </div>
 </section>`;
}
function aiPage() {
 return `<section id="ai" class="screen">
  <div class="top"><h2><button class="back" onclick="go('home')" aria-label="Tilbake til hjem">‹</button><span>✦ ParkSmart AI</span></h2></div>
  <div class="ai-page">
   <div id="aiMessages" class="ai-messages" role="log" aria-live="polite" aria-label="Samtale med ParkSmart AI">
    <div class="ai-message ai-message-assistant"><div class="ai-avatar" aria-hidden="true">✦</div><div class="ai-bubble"><strong>Hei! Hva kan jeg hjelpe deg med?</strong><p>Spør om parkering i Oslo, finn en plass i nærheten eller ta bilde av et parkeringsskilt.</p></div></div>
   </div>
   <div id="aiSuggestions" class="ai-suggestions" aria-label="Forslag">
    <button type="button" onclick="askAiSuggestion('Hvor er nærmeste gratis parkering?')">Nærmeste gratis</button>
    <button type="button" onclick="askAiSuggestion('Finn nærmeste MC-parkering')">MC-parkering</button>
    <button type="button" onclick="askAiSuggestion('Finn parkering med lading i nærheten')">Lading</button>
    <button type="button" onclick="pickAiPhoto(true)">📷 Tolk et skilt</button>
   </div>
   <div id="aiPhoto" class="ai-photo" hidden>
    <img id="aiPhotoImage" alt="Valgt parkeringsskilt">
    <div><strong>Bilde klart</strong><small>Send et spørsmål for å analysere skiltet.</small></div>
    <button type="button" onclick="removeAiPhoto()" aria-label="Fjern bildet">×</button>
   </div>
   <form class="ai-composer" onsubmit="submitAiQuestion(event)">
    <button class="ai-camera" type="button" onclick="pickAiPhoto(true)" aria-label="Ta bilde av skilt">📷</button>
    <textarea id="aiInput" rows="1" maxlength="500" placeholder="Spør om parkering …" aria-label="Spør ParkSmart AI"></textarea>
    <button id="aiSend" class="ai-send" type="submit" aria-label="Send spørsmål">➤</button>
   </form>
   <p class="ai-disclaimer">Kontroller alltid skiltene på stedet. Midlertidig skilting kan overstyre informasjonen i appen.</p>
  </div>
 </section>`;
}
function navIcon(id: string) {
 const paths: Record<string, string> = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
  ai: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4M18 4h4"/>',
  guide: '<path d="M12 21V5M12 5C8 2 4 3 2 4v15c3-1 6-1 10 2 4-3 7-3 10-2V4c-3-1-6-2-10 1z"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 };
 return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[id]}</svg>`;
}
function appNavigation() {
 const tabs = [['home','Hjem'],['map','Kart'],['ai','AI-søk'],['guide','Skilt'],['profile','Profil']];
 return '<nav id="appNavigation" class="app-nav" aria-label="Hovedmeny">'+tabs.map(([id,label])=>`<button type="button" data-tab="${id}" onclick="go('${id}')"${id==='home'?' class="active" aria-current="page"':''}><span class="ico">${navIcon(id)}</span><span>${label}</span></button>`).join('')+'</nav>';
}
