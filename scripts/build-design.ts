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
html = html.replace(/<section id="profile"[\s\S]*?<\/section>/, loginPage('profile','Min profil','Logg inn for å se profilen din','Dine parkeringer, kjøretøy og favoritter samles her.'));
html = html.replace(/<section id="ai"[\s\S]*?<\/section>/,loginPage('ai','✦ ParkSmart AI','Logg inn for AI-søk','Din parkeringsassistent kommer her.'));
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
const css = '<style>'+await readFile('src/design/app.css','utf8')+'</style>';
html = html.replace('Bildet sendes til OpenAI for analyse. API-bruk kan koste penger.', 'Bildet blir på enheten i denne versjonen. Automatisk analyse er ikke tilkoblet.');
const bridge = await readFile('src/design/bridge.js','utf8');
const search = await readFile('src/design/search.js','utf8');
const mapControls = await readFile('src/design/map-controls.js','utf8');
const theme = await readFile('src/design/theme.js','utf8');
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
html = html.replace('</head>',css+'</head>').replace('</body>','<script>'+bridge+'\n'+navigationBridge+'\n'+search+'\n'+mapControls+'\n'+theme+'</script></body>');
await mkdir('src/design',{recursive:true});
await writeFile('src/design/document.json',JSON.stringify({html}));
await writeFile('assets/design/parksmart.html',html);
console.log('Built matching design:',html.length,'characters; signs preserved; parking records',dataset.locations.length);
function loginPage(id:string,title:string,heading:string,description:string) {
 return `<section id="${id}" class="screen"><div class="top"><h2><button class="back" onclick="go('home')" aria-label="Tilbake til hjem">‹</button>${title}</h2></div><div class="scroll login-required"><div class="profileavatar" aria-hidden="true">${navIcon(id)}</div><h2>${heading}</h2><p class="muted">${description}</p><button class="btn" style="margin-top:28px" onclick="alert('Innlogging kommer i en senere versjon.')">Logg inn</button><button class="pill" style="margin-top:12px" onclick="go('find')">Fortsett uten innlogging</button></div></section>`;
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
