/* Browser presentation adapter. Native capabilities are requested through a small, validated bridge. */
let appFilters = new Set(),
  appFreeNow = false,
  appPerson = null,
  appCurrentScreen = 'welcome',
  appAskedLocation = false,
  appDatasetChunks = [],
  appBikeStations = [];
function nativeSend(value) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(value));else if (window.parent !== window) window.parent.postMessage({
    channel: 'parksmart:request',
    payload: value
  }, '*');else return false;
  return true;
}
const appOriginalGo = go;
go = function (id) {
  appOriginalGo(id);
  appCurrentScreen = id === 'map' ? 'find' : id;
  const activeTab = ['find', 'details', 'payment'].includes(appCurrentScreen) ? 'map' : ['scan', 'signPreview', 'signResult', 'recognized'].includes(appCurrentScreen) ? 'scan' : ['guide', 'guideDetail'].includes(appCurrentScreen) ? 'home' : appCurrentScreen;
  document.querySelectorAll('#appNavigation [data-tab]').forEach(button => {
    const active = button.dataset.tab === activeTab;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  nativeSend({
    type: 'screen',
    screen: appCurrentScreen
  });
  if (appCurrentScreen === 'home' && !appAskedLocation) {
    appAskedLocation = true;
    requestHomeLocation();
  }
  if (appCurrentScreen === 'find' && appPerson) showPersonMarker();
};
function requestHomeLocation() {
  if (nativeSend({
    type: 'locate'
  })) return;
  navigator.geolocation?.getCurrentPosition(async p => {
    let label = p.coords.latitude.toFixed(4) + ', ' + p.coords.longitude.toFixed(4);
    try {
      const r = await fetch('https://ws.geonorge.no/adresser/v1/punktsok?lat=' + p.coords.latitude + '&lon=' + p.coords.longitude + '&radius=500&treffPerSide=1');
      const d = await r.json();
      if (d.adresser?.[0]) label = d.adresser[0].adressenavn + ', ' + d.adresser[0].kommunenavn;
    } catch {}
    window.ParkSmartNative.receive({
      type: 'location',
      latitude: p.coords.latitude,
      longitude: p.coords.longitude,
      label
    });
  }, () => window.ParkSmartNative.receive({
    type: 'locationError',
    message: 'Posisjon ikke delt'
  }), {
    timeout: 12000
  });
}
locateMe = requestHomeLocation;
let appPersonMarker = null;
function showPersonMarker() {
  if (!parkingMap || !appPerson || typeof L === 'undefined') return;
  if (!Array.isArray(appPerson) || appPerson.length !== 2 || !appPerson.every(Number.isFinite)) return;

  // Eget lag over parkeringsmarkører, men under åpne informasjonsvinduer.
  const paneName = 'parksmart-user-location';
  let pane = parkingMap.getPane(paneName);
  if (!pane) pane = parkingMap.createPane(paneName);
  pane.style.zIndex = '680';
  pane.style.pointerEvents = 'none';
  if (!document.getElementById('parksmart-user-location-style')) {
    const style = document.createElement('style');
    style.id = 'parksmart-user-location-style';
    style.textContent = `
      .parksmart-user-icon {
        background: transparent;
        border: 0;
        pointer-events: none !important;
      }
      .parksmart-user-position {
        position: relative;
        width: 72px;
        height: 72px;
        pointer-events: none;
      }
      .parksmart-user-halo {
        position: absolute;
        left: 6px;
        top: 6px;
        width: 60px;
        height: 60px;
        box-sizing: border-box;
        border-radius: 50%;
        background: rgba(230, 0, 126, 0.17);
        border: 2px solid rgba(230, 0, 126, 0.4);
      }
      .parksmart-user-dot {
        position: absolute;
        left: 22px;
        top: 22px;
        width: 28px;
        height: 28px;
        box-sizing: border-box;
        border-radius: 50%;
        background: #e6007e;
        border: 4px solid white;
        box-shadow: 0 2px 9px rgba(70, 0, 38, 0.45);
      }
      .parksmart-user-label {
        position: absolute;
        left: 50%;
        bottom: 66px;
        transform: translateX(-50%);
        white-space: nowrap;
        background: white;
        color: #a00059;
        border: 1px solid #f3bfdc;
        border-radius: 14px;
        padding: 5px 9px;
        font: 800 10px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        letter-spacing: 0.4px;
        box-shadow: 0 2px 8px rgba(40, 0, 25, 0.18);
      }
    `;
    document.head.appendChild(style);
  }
  if (appPersonMarker) {
    appPersonMarker.setLatLng(appPerson);
    appPersonMarker.setZIndexOffset(10000);
    if (!parkingMap.hasLayer(appPersonMarker)) appPersonMarker.addTo(parkingMap);
    return;
  }
  const icon = L.divIcon({
    className: 'parksmart-user-icon',
    html: '<div class="parksmart-user-position" role="img" aria-label="Din posisjon"><span class="parksmart-user-halo"></span><span class="parksmart-user-dot"></span><span class="parksmart-user-label">DU ER HER</span></div>',
    iconSize: [72, 72],
    iconAnchor: [36, 36]
  });

  // Markøren ligger direkte på kartet, utenfor laget som tegnes på nytt ved filtrering.
  appPersonMarker = L.marker(appPerson, {
    pane: paneName,
    icon,
    zIndexOffset: 10000,
    interactive: false,
    keyboard: false,
    title: 'Din posisjon'
  }).addTo(parkingMap);
}
openFilter = function (name) {
  if (name === 'Alle') appFilters.clear();else if (appFilters.has(name)) appFilters.delete(name);else appFilters.add(name);
  selectedFilter = 'Alle';
  go('find');
  renderResults(true);
};
filter = function (button) {
  openFilter(button.dataset.filter);
};
function toggleFreeNow() {
  appFreeNow = !appFreeNow;
  document.getElementById('freeNowButton').classList.toggle('on', appFreeNow);
  renderResults();
}
after20 = p => !!p.after20;
matchesParking = function (p, vehicle = selectedVehicle) {
  if (vehicle === 'Sykkel') return p.kind === 'bike';
  if (vehicle === 'Bil' && p.kind === 'mc') return false;
  if (vehicle === 'MC' && p.kind !== 'mc') return false;
  if (p.kind === 'bike') return false;
  if (appFreeNow && p.isFreeNow !== true) return false;
  if (!appFilters.size) return true;
  return [...appFilters].some(f => f === 'Gate' ? p.kind === 'street' : f === 'Gratis' || f === 'MC-plasser' ? p.free || p.freeSpaces > 0 : f === 'Betaling' ? p.payment === 'paid' : f === 'Parkeringshus' ? p.kind === 'garage' : f === 'HC' ? p.hcSpaces > 0 : f === 'Lading' ? p.chargingSpaces > 0 : f === 'Etter 20' ? p.after20 : false);
};
function requestBikeStations(force = false) {
  const status = document.getElementById('addressStatus');
  if (status && selectedVehicle === 'Sykkel') {
    status.hidden = false;
    status.textContent = 'Henter live sykkeldata …';
  }
  nativeSend({type:'bikeRefresh',force});
}
const appOriginalVehicle = vehicle;
vehicle = function (button) {
  appOriginalVehicle(button);
  if (selectedVehicle === 'Sykkel') requestBikeStations();
};
const appOriginalChangeVehicle = changeVehicle;
changeVehicle = function (value) {
  appOriginalChangeVehicle(value);
  if (selectedVehicle === 'Sykkel') requestBikeStations();
};
const appOriginalRender = renderResults;
renderResults = function (fit = false) {
  appOriginalRender(fit);
  document.querySelectorAll('#find [data-filter]').forEach(b => {
    const on = b.dataset.filter === 'Alle' ? !appFilters.size : appFilters.has(b.dataset.filter) || b.dataset.filter === 'MC-plasser' && appFilters.has('Gratis');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.getElementById('filterDescription').textContent = 'Trykk på en markør for pris og vilkår. Flere typevalg kombineres. Gratis kapasitet bekrefter ikke fri tilgang.';
  if (selectedVehicle === 'Sykkel') document.getElementById('filterDescription').textContent = 'Live Oslo Bysykkel-stasjoner. Tallene viser sykler du kan hente og ledige låser for innlevering.';
  showPersonMarker();
};
parkingColor = p => p.kind === 'bike' ? '#078f7c' : p.kind === 'mc' ? '#7652c8' : p.payment === 'unknown' ? '#76858d' : p.free ? '#07885a' : p.kind === 'garage' ? '#043b52' : '#0759d8';
const appOriginalParkingSymbol = parkingSymbol;
parkingSymbol = p => p.kind === 'bike' ? '🚲' : appOriginalParkingSymbol(p);
const appOriginalKindLabel = kindLabel;
kindLabel = p => p.kind === 'bike' ? 'Oslo Bysykkel-stasjon' : appOriginalKindLabel(p);
priceLabel = p => p.status || 'Vilkår må kontrolleres';
function appPrice(p) {
  if (p.kind === 'bike') return p.statusDetail;
  return document.getElementById('fuelSelect').value === 'electric' && selectedVehicle !== 'MC' ? p.electric : p.regular;
}
function freeNowBanner(p) {
  if (p.isFreeNow !== true) return '<span class="tag">' + escapeHtml(priceLabel(p)) + '</span>';
  const message = p.freeUntil ? 'Du kan parkere avgiftsfritt til ' + p.freeUntil + '.' : 'Ingen parkeringsavgift er registrert nå.';
  return '<div class="parking-free-now" role="status"><strong><span aria-hidden="true">✓</span> GRATIS NÅ</strong><span>' + escapeHtml(message) + '</span><small>Makstid og andre skiltvilkår gjelder fortsatt.</small></div>';
}
popupHTML = function (p) {
  if (p.kind === 'bike') return '<div class="parking-popup"><div class="parking-popup-title"><div><small>Oslo Bysykkel-stasjon</small><h3>' + escapeHtml(p.name) + '</h3></div>' + favoriteButton(p.id, 'compact') + '</div><div class="bike-availability"><span><strong>' + p.bikesAvailable + '</strong><small>SYKLER Å HENTE</small></span><span><strong>' + p.docksAvailable + '</strong><small>LEDIGE LÅSER</small></span></div><p>' + escapeHtml(p.address || 'Adresse ikke oppgitt') + '</p><p class="bike-live-note">Live data fra Oslo Bysykkel · oppdatert ' + escapeHtml(new Date(p.fetchedAt).toLocaleTimeString('nb-NO',{hour:'2-digit',minute:'2-digit'})) + '</p><div class="popup-links"><button class="pill" onclick="appOpenDetails(' + JSON.stringify(p.id).replace(/"/g, '&quot;') + ')">Alle detaljer</button><button class="btn" onclick="appNavigate(' + JSON.stringify(p.id).replace(/"/g, '&quot;') + ')">Naviger ↗</button></div></div>';
  return '<div class="parking-popup"><div class="parking-popup-title"><div><small>' + escapeHtml(kindLabel(p)) + '</small><h3>' + escapeHtml(p.name) + '</h3></div>' + favoriteButton(p.id, 'compact') + '</div><strong>' + escapeHtml(priceLabel(p)) + '</strong><p>' + escapeHtml(appPrice(p) || 'Detaljert pris ikke oppgitt') + '</p>' + (p.maxStay ? '<p>Makstid: ' + escapeHtml(p.maxStay) + '</p>' : '') + '<p>' + escapeHtml(p.address || 'Adresse ikke oppgitt') + '</p><p class="muted">' + escapeHtml(p.source) + ' · ' + escapeHtml(p.fetchedAt.slice(0, 10)) + '<br>Skilting gjelder. Belegg er ukjent.</p><div class="popup-links"><button class="pill" onclick="appOpenDetails(' + JSON.stringify(p.id).replace(/"/g, '&quot;') + ')">Alle detaljer</button><button class="btn" onclick="appNavigate(' + JSON.stringify(p.id).replace(/"/g, '&quot;') + ')">Naviger ↗</button></div></div>';
};
function appDistance(p) {
  const origin = appPerson || pos;
  const a = (p.center[0] - origin[0]) * Math.PI / 180,
    b = (p.center[1] - origin[1]) * Math.PI / 180;
  const h = Math.sin(a / 2) ** 2 + Math.cos(origin[0] * Math.PI / 180) * Math.cos(p.center[0] * Math.PI / 180) * Math.sin(b / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
renderParkingList = function () {
  const sorted = [...filteredParking].sort((a, b) => appDistance(a) - appDistance(b));
  document.getElementById('results').innerHTML = sorted.slice(0, 60).map(p => '<button class="parking-result" onclick="appOpenDetails(' + JSON.stringify(p.id).replace(/"/g, '&quot;') + ')"><span class="result-symbol" style="background:' + parkingColor(p) + '">' + parkingSymbol(p) + '</span><span><strong>' + escapeHtml(p.name) + '</strong><small>' + escapeHtml(priceLabel(p)) + ' · ' + (appDistance(p) < 1000 ? Math.round(appDistance(p)) + ' m' : (appDistance(p) / 1000).toFixed(1) + ' km') + ' luftlinje</small></span><span class="result-arrow">›</span></button>').join('') || '<p class="muted">Ingen registrerte treff. Endre filtrene.</p>';
};
function appOpenDetails(id, returnScreen = 'find') {
  const p = PARKING_DATA.find(x => x.id === id);
  if (!p) return;
  const back = document.querySelector('#details .top .back');
  if (back) back.onclick = () => go(returnScreen === 'favorites' ? 'favorites' : 'find');
  go('details');
  const scroll = document.querySelector('#details .scroll');
  if (p.kind === 'bike') {
    scroll.innerHTML = '<div class="parking-detail-heading"><div><p class="muted">Oslo Bysykkel-stasjon</p><h2>' + escapeHtml(p.name) + '</h2><p class="muted">' + escapeHtml(p.address || p.center.join(', ')) + '</p></div>' + favoriteButton(p.id, 'detail') + '</div><div class="bike-availability"><span><strong>' + p.bikesAvailable + '</strong><small>SYKLER Å HENTE</small></span><span><strong>' + p.docksAvailable + '</strong><small>LEDIGE LÅSER FOR LEVERING</small></span></div><div class="listrow">Hente sykkel<strong>' + (p.isRenting ? 'Tilgjengelig' : 'Stengt') + '</strong></div><div class="listrow">Levere sykkel<strong>' + (p.isReturning ? 'Tilgjengelig' : 'Stengt') + '</strong></div><div class="listrow">Kapasitet<strong>' + escapeHtml(p.capacity ?? 'Ukjent') + '</strong></div><p>' + escapeHtml(p.notes || '') + '</p><p class="footnote">Live data fra Oslo Bysykkel · oppdatert ' + escapeHtml(new Date(p.fetchedAt).toLocaleString('nb-NO',{hour:'2-digit',minute:'2-digit'})) + '</p><div class="row"><button class="btn outline" onclick="appCopy(' + JSON.stringify(id).replace(/"/g, '&quot;') + ')">Kopier adresse</button><button class="btn" onclick="appNavigate(' + JSON.stringify(id).replace(/"/g, '&quot;') + ')">Naviger hit</button></div><p id="copyStatus" class="muted" role="status"></p><button class="pill" onclick="go(\'find\');focusParking(' + JSON.stringify(id).replace(/"/g, '&quot;') + ')">Vis på kart</button><p class="footnote">Tilgjengeligheten kan endre seg før du kommer frem.</p><a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">Se Oslo Bysykkel ↗</a>';
    return;
  }
  scroll.innerHTML = '<div class="photo" style="width:100%;height:195px"></div><p class="footnote">Illustrasjonsbilde</p><div class="parking-detail-heading"><div><h2>' + escapeHtml(p.name) + '</h2><p class="muted">' + escapeHtml(p.address || p.center.join(', ')) + (p.approximate ? ' · omtrentlig' : '') + '</p></div>' + favoriteButton(p.id, 'detail') + '</div>' + freeNowBanner(p) + '<div class="listrow">Pris<strong>' + escapeHtml(appPrice(p) || 'Ikke oppgitt') + '</strong></div><div class="listrow">Makstid<strong>' + escapeHtml(p.maxStay || 'Se skilt') + '</strong></div><div class="listrow">Avgiftstid<strong>' + escapeHtml(p.feeHours || 'Ikke oppgitt') + '</strong></div><div class="listrow">Type<strong>' + escapeHtml(kindLabel(p)) + '</strong></div><p class="parking-details-price">' + escapeHtml(p.statusDetail || '') + '</p>' + (p.quality === 'conflict' ? '<div class="notice">Ulike opplysninger i kommunens kilder. Kontroller prissiden og skiltet.</div>' : '') + (p.notes ? '<p>' + escapeHtml(p.notes) + '</p>' : '') + '<p class="footnote">' + escapeHtml(p.operator) + '<br>' + escapeHtml(p.source) + ' · hentet ' + escapeHtml(p.fetchedAt.slice(0, 10)) + '<br>Kapasitet: ' + escapeHtml(p.capacity ?? 'ukjent') + '. Belegg ukjent.</p>' + (p.hcSpaces ? '<p>Registrert HC-kapasitet: ' + p.hcSpaces + '. Markøren angir området.</p>' : '') + (p.chargingSpaces ? '<p>Registrert ladekapasitet: ' + p.chargingSpaces + '.</p>' : '') + '<div class="row"><button class="btn outline" onclick="appCopy(' + JSON.stringify(id).replace(/"/g, '&quot;') + ')">Kopier adresse</button><button class="btn" onclick="appNavigate(' + JSON.stringify(id).replace(/"/g, '&quot;') + ')">Naviger hit</button></div><p id="copyStatus" class="muted" role="status"></p><button class="pill" onclick="go(\'find\');focusParking(' + JSON.stringify(id).replace(/"/g, '&quot;') + ')">Vis på kart</button><p class="footnote">Skiltingen på stedet gjelder. Innkjørsel og ledighet er ikke bekreftet.</p><a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">Se datakilde ↗</a>';
}
function appCopy(id) {
  const p = PARKING_DATA.find(x => x.id === id);
  if (nativeSend({
    type: 'copy',
    id,
    address: p?.address,
    latitude: p?.center?.[0],
    longitude: p?.center?.[1]
  })) return;
  navigator.clipboard?.writeText(p.address || p.center.join(', ')).then(() => window.ParkSmartNative.receive({
    type: 'copyDone',
    message: 'Adresse kopiert'
  })).catch(() => window.ParkSmartNative.receive({
    type: 'copyDone',
    message: 'Kunne ikke kopiere'
  }));
}
function appNavigate(id) {
  const p = PARKING_DATA.find(x => x.id === id);
  if (!p) return;
  if (p.forbidden) {
    alert(p.statusDetail);
    return;
  }
  if (!nativeSend({
    type: 'navigate',
    id,
    latitude: p.center[0],
    longitude: p.center[1],
    travelMode: p.kind === 'bike' ? 'bicycling' : 'driving'
  })) window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.center.join(',')) + '&travelmode=driving', '_blank');
}
findPlace = async function () {
  const q = document.getElementById('findq').value.trim();
  if (!q) return;
  const status = document.getElementById('addressStatus');
  status.hidden = false;
  status.textContent = 'Søker …';
  if (nativeSend({
    type: 'search',
    query: q
  })) return;
  try {
    const r = await fetch('https://ws.geonorge.no/adresser/v1/sok?kommunenummer=0301&treffPerSide=1&sok=' + encodeURIComponent(q));
    const d = await r.json();
    const a = d.adresser?.[0];
    if (!a) throw Error();
    window.ParkSmartNative.receive({
      type: 'searchResult',
      latitude: a.representasjonspunkt.lat,
      longitude: a.representasjonspunkt.lon,
      label: a.adressetekst
    });
  } catch {
    window.ParkSmartNative.receive({
      type: 'searchError',
      message: 'Fant ikke adressen. Prøv igjen.'
    });
  }
};
function refreshAppData() {
  const status = document.getElementById('addressStatus');
  status.hidden = false;
  status.textContent = 'Henter oppdaterte data …';
  if (!nativeSend({
    type: 'refresh'
  })) status.textContent = 'Oppdater uttrekket med npm run data:quick og npm run design:build.';
}
const appOriginalCamera = openSignCamera,
  appOriginalChoose = chooseSignPhoto;
window.openScanTab = function () {
  go('scan');
  setTimeout(() => openSignCamera(), 50);
};
openSignCamera = function () {
  window.scanAiPending = true;
  if (!nativeSend({
    type: 'photo',
    camera: true,
    target: 'ai'
  })) {
    window.scanAiPending = false;
    appOriginalCamera();
  }
};
chooseSignPhoto = function () {
  window.scanAiPending = true;
  if (!nativeSend({
    type: 'photo',
    camera: false,
    target: 'ai'
  })) {
    window.scanAiPending = false;
    appOriginalChoose();
  }
};
useSignPhoto = function () {
  if (!signPhotoURL) return;
  if (typeof window.analyzeSignPhotoWithAi === 'function') {
    window.analyzeSignPhotoWithAi(signPhotoURL);
    return;
  }
  cameraStatus('AI-analysen er ikke klar ennå. Prøv igjen.');
};
const appOriginalRetakeSignPhoto = retakeSignPhoto;
retakeSignPhoto = function () {
  appOriginalRetakeSignPhoto();
  setTimeout(() => openSignCamera(), 50);
};
window.ParkSmartNative = {
  receive: function (packet) {
    if (packet.type === 'location') {
      appPerson = [packet.latitude, packet.longitude];
      pos = appPerson;
      document.getElementById('homearea').textContent = packet.label;
      document.getElementById('addressStatus').hidden = true;
      if (parkingMap) {
        parkingMap.setView(pos, 16);
        showPersonMarker();
      }
    }
    if (packet.type === 'locationError') {
      document.getElementById('homearea').textContent = packet.message;
      cameraStatus(packet.message);
    }
    if (packet.type === 'searchResult') {
      pos = [packet.latitude, packet.longitude];
      if (parkingMap) parkingMap.setView(pos, 16);
      document.getElementById('addressStatus').hidden = false;
      document.getElementById('addressStatus').textContent = 'Viser ' + packet.label;
    }
    if (packet.type === 'searchError' || packet.type === 'progress') {
      document.getElementById('addressStatus').hidden = false;
      document.getElementById('addressStatus').textContent = packet.message;
    }
    if (packet.type === 'copyDone') {
      const el = document.getElementById('copyStatus');
      if (el) el.textContent = packet.message;
    }
    if (packet.type === 'photo') {
      signPhotoURL = packet.dataUrl;
      document.getElementById('signPreviewImage').src = packet.dataUrl;
      go('signPreview');
    }
    if (packet.type === 'photoError') cameraStatus(packet.message);
    if (packet.type === 'dataBegin') appDatasetChunks = [];
    if (packet.type === 'dataChunk') appDatasetChunks.push(...packet.items);
    if (packet.type === 'dataEnd') {
      PARKING_DATA.splice(0, PARKING_DATA.length, ...appDatasetChunks, ...appBikeStations);
      appDatasetChunks = [];
      if (appCurrentScreen === 'find') renderResults();
      document.getElementById('addressStatus').hidden = false;
      document.getElementById('addressStatus').textContent = 'Parkeringsdata oppdatert.';
    }
    if (packet.type === 'bikeData') {
      appBikeStations = Array.isArray(packet.items) ? packet.items : [];
      const parkingOnly = PARKING_DATA.filter(item => item.kind !== 'bike');
      PARKING_DATA.splice(0, PARKING_DATA.length, ...parkingOnly, ...appBikeStations);
      if (selectedVehicle === 'Sykkel') renderResults(true);
      const status = document.getElementById('addressStatus');
      if (status && selectedVehicle === 'Sykkel') {
        status.hidden = false;
        status.textContent = appBikeStations.length + ' Oslo Bysykkel-stasjoner oppdatert.';
      }
    }
    if (packet.type === 'bikeError' && selectedVehicle === 'Sykkel') {
      const status = document.getElementById('addressStatus');
      if (status) { status.hidden = false; status.textContent = packet.message; }
    }
    if (packet.type === 'back') go('home');
  }
};
window.addEventListener('message', e => {
  if (e.source === window.parent && e.data?.channel === 'parksmart:host') window.ParkSmartNative.receive(e.data.payload);
});
document.addEventListener('click', e => {
  const link = e.target.closest('a[href]');
  if (link && /^https:\/\//.test(link.href) && nativeSend({
    type: 'external',
    url: link.href
  })) e.preventDefault();
});
nativeSend({
  type: 'ready'
});

// Åpne Hjem direkte, uten velkomstsiden.
go('home');
