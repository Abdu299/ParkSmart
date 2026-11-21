/* global PARKING_DATA, SIGN_GUIDE, appOpenDetails, appPerson, nativeSend, requestHomeLocation, go, openGuideSign */
/* ParkSmart AI presentation layer. The native host owns networking and secrets. */
(() => {
  let imageDataUrl = null;
  let busy = false;
  let requestNumber = 0;
  let pendingLocationQuestion = null;
  let lastParkingIds = [];
  let lastParkingOrigin = null;
  const history = [];
  const requestTimers = new Map();
  const expiredRequests = new Set();
  const signRequests = new Set();
  const osloAreas = [
    ['Grønland', 59.9127, 10.7600, ['grønland']],
    ['Sentrum', 59.9139, 10.7387, ['sentrum', 'oslo sentrum', 'kvadraturen']],
    ['Bjørvika', 59.9075, 10.7564, ['bjørvika', 'barcode']],
    ['Sørenga', 59.9038, 10.7538, ['sørenga']],
    ['Tøyen', 59.9148, 10.7737, ['tøyen']],
    ['Kampen', 59.9129, 10.7817, ['kampen']],
    ['Vålerenga', 59.9088, 10.7866, ['vålerenga']],
    ['Gamle Oslo', 59.9069, 10.7788, ['gamle oslo', 'gamlebyen']],
    ['Ensjø', 59.9133, 10.7917, ['ensjø']],
    ['Helsfyr', 59.9120, 10.8061, ['helsfyr']],
    ['Etterstad', 59.9068, 10.8004, ['etterstad']],
    ['Grünerløkka', 59.9238, 10.7595, ['grünerløkka', 'løkka']],
    ['Carl Berner', 59.9256, 10.7755, ['carl berner']],
    ['Hasle', 59.9250, 10.7925, ['hasle']],
    ['Sinsen', 59.9360, 10.7800, ['sinsen']],
    ['Løren', 59.9305, 10.7980, ['løren']],
    ['Torshov', 59.9348, 10.7653, ['torshov']],
    ['Sagene', 59.9380, 10.7528, ['sagene']],
    ['St. Hanshaugen', 59.9271, 10.7398, ['st hanshaugen', 'st. hanshaugen']],
    ['Bislett', 59.9255, 10.7318, ['bislett']],
    ['Majorstuen', 59.9294, 10.7147, ['majorstuen', 'majorstua']],
    ['Frogner', 59.9227, 10.7065, ['frogner']],
    ['Vika', 59.9132, 10.7248, ['vika']],
    ['Aker brygge', 59.9107, 10.7262, ['aker brygge']],
    ['Tjuvholmen', 59.9090, 10.7207, ['tjuvholmen']],
    ['Skøyen', 59.9224, 10.6797, ['skøyen']],
    ['Ullern', 59.9250, 10.6540, ['ullern']],
    ['Røa', 59.9470, 10.6420, ['røa']],
    ['Smestad', 59.9360, 10.6820, ['smestad']],
    ['Vinderen', 59.9430, 10.7040, ['vinderen']],
    ['Blindern', 59.9405, 10.7206, ['blindern']],
    ['Ullevål', 59.9483, 10.7312, ['ullevål']],
    ['Nydalen', 59.9490, 10.7680, ['nydalen']],
    ['Bjølsen', 59.9435, 10.7565, ['bjølsen']],
    ['Sandaker', 59.9490, 10.7700, ['sandaker']],
    ['Grefsen', 59.9540, 10.7780, ['grefsen']],
    ['Kjelsås', 59.9660, 10.7830, ['kjelsås']],
    ['Bjerke', 59.9410, 10.8290, ['bjerke']],
    ['Økern', 59.9275, 10.8130, ['økern']],
    ['Bryn', 59.9085, 10.8190, ['bryn']],
    ['Alna', 59.9300, 10.8700, ['alna']],
    ['Furuset', 59.9410, 10.8900, ['furuset']],
    ['Haugerud', 59.9220, 10.8600, ['haugerud']],
    ['Grorud', 59.9610, 10.8810, ['grorud']],
    ['Stovner', 59.9620, 10.9240, ['stovner']],
    ['Manglerud', 59.8980, 10.8140, ['manglerud']],
    ['Ryen', 59.8940, 10.8040, ['ryen']],
    ['Oppsal', 59.8920, 10.8420, ['oppsal']],
    ['Bøler', 59.8840, 10.8460, ['bøler']],
    ['Nordstrand', 59.8610, 10.7990, ['nordstrand']],
    ['Lambertseter', 59.8730, 10.8130, ['lambertseter']],
    ['Holmlia', 59.8350, 10.7940, ['holmlia']],
    ['Mortensrud', 59.8480, 10.8290, ['mortensrud']]
  ];

  const messages = () => document.getElementById('aiMessages');
  const input = () => document.getElementById('aiInput');

  function resetDocumentScroll() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }

  function setKeyboardLayout(open) {
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--ai-viewport-height', Math.round(height) + 'px');
    document.documentElement.classList.toggle('ai-keyboard-open', open);
    if (open) {
      resetDocumentScroll();
      requestAnimationFrame(resetDocumentScroll);
    }
  }

  function scrollToLatest() {
    const list = messages();
    if (list) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }

  function addMessage(role, text, options = {}) {
    const list = messages();
    if (!list) return null;
    const row = document.createElement('div');
    row.className = 'ai-message ai-message-' + role;
    if (role === 'assistant') {
      const avatar = document.createElement('div');
      avatar.className = 'ai-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = '✦';
      row.appendChild(avatar);
    }
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble' + (options.loading ? ' ai-loading' : '') + (options.error ? ' ai-error' : '');
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    if (options.imageDataUrl) {
      const photo = document.createElement('img');
      photo.className = 'ai-message-photo';
      photo.src = options.imageDataUrl;
      photo.alt = 'Parkeringsskilt sendt til ParkSmart AI';
      bubble.appendChild(photo);
    }
    bubble.appendChild(paragraph);
    row.appendChild(bubble);
    list.appendChild(row);
    scrollToLatest();
    return { row, bubble, paragraph };
  }

  function distanceMeters(a, b) {
    const toRad = value => value * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function normalizeAreaText(value) {
    return String(value).toLocaleLowerCase('nb-NO').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function requestedArea(question) {
    const text = ' ' + normalizeAreaText(question) + ' ';
    const matches = osloAreas.flatMap(([name, latitude, longitude, aliases]) => aliases.map(alias => ({
      name,
      center: [latitude, longitude],
      alias: normalizeAreaText(alias)
    }))).sort((a, b) => b.alias.length - a.alias.length);
    return matches.find(area => text.includes(' ' + area.alias + ' ')) || null;
  }

  function isParkingSearchQuestion(question) {
    return /nærmest|i nærheten|i området|nær meg|rundt meg|hvor er|finn.*parkering|finnes.*parkering|parkeringsplass|parkering.*\b(?:på|i|ved)\b/.test(question.toLocaleLowerCase('nb-NO'));
  }

  function relevantParking(question, requestedOrigin = null) {
    const normalized = question.toLocaleLowerCase('nb-NO');
    const isFollowUp = /den første|det første|den andre|det andre|den tredje|det tredje|denne|den der|må jeg betale|hvor mye|hva koster|pris/.test(normalized) && lastParkingIds.length;
    const area = requestedArea(question);
    const origin = requestedOrigin || area?.center || (isFollowUp ? lastParkingOrigin : null) || appPerson;
    if (!Array.isArray(origin) || origin.length !== 2) return [];
    let candidates = isFollowUp
      ? lastParkingIds.map(id => PARKING_DATA.find(place => place.id === id)).filter(Boolean)
      : PARKING_DATA.filter(place => !place.forbidden);
    if (isFollowUp) {
      return candidates.slice(0, 8).map(place => ({
        id: place.id,
        name: place.name,
        address: place.address || 'Adresse ikke oppgitt',
        type: place.kind,
        distanceMeters: Math.round(distanceMeters(origin, place.center)),
        status: place.status,
        statusDetail: place.statusDetail,
        isFreeNow: place.isFreeNow,
        payment: place.payment,
        maxStay: place.maxStay || null,
        feeHours: place.feeHours || null,
        regular: place.regular || null,
        electric: place.electric || null,
        chargingSpaces: place.chargingSpaces || 0,
        hcSpaces: place.hcSpaces || 0,
        source: place.source,
        fetchedAt: place.fetchedAt
      }));
    }
    if (/\bmc\b|motorsykkel/.test(normalized)) candidates = candidates.filter(place => place.kind === 'mc' || place.mcFree);
    if (/lad|elbil/.test(normalized)) candidates = candidates.filter(place => place.chargingSpaces > 0);
    if (/\bhc\b|handikap|funksjonshem/.test(normalized)) candidates = candidates.filter(place => place.hcSpaces > 0);
    if (/gratis|avgiftsfri|uten å betale/.test(normalized)) candidates = candidates.filter(place => place.isFreeNow === true);
    return candidates
      .map(place => ({ place, distance: distanceMeters(origin, place.center) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8)
      .map(({ place, distance }) => ({
        id: place.id,
        name: place.name,
        address: place.address || 'Adresse ikke oppgitt',
        type: place.kind,
        distanceMeters: Math.round(distance),
        status: place.status,
        statusDetail: place.statusDetail,
        isFreeNow: place.isFreeNow,
        payment: place.payment,
        maxStay: place.maxStay || null,
        feeHours: place.feeHours || null,
        regular: place.regular || null,
        electric: place.electric || null,
        chargingSpaces: place.chargingSpaces || 0,
        hcSpaces: place.hcSpaces || 0,
        source: place.source,
        fetchedAt: place.fetchedAt
      }));
  }

  function needsLocation(question) {
    return isParkingSearchQuestion(question) && !requestedArea(question);
  }

  function setBusy(value) {
    busy = value;
    const send = document.getElementById('aiSend');
    const camera = document.querySelector('#ai .ai-camera');
    if (send) send.disabled = value;
    if (camera) camera.disabled = value;
    if (input()) input().disabled = value;
  }

  function answerParkingSearchLocally(question) {
    const normalized = question.toLocaleLowerCase('nb-NO');
    if (!isParkingSearchQuestion(question)) return false;
    const area = requestedArea(question);
    const origin = area?.center || appPerson;
    if (!Array.isArray(origin) || origin.length !== 2) return false;
    const parking = relevantParking(question, origin);
    const asksFree = /gratis|avgiftsfri|uten å betale/.test(normalized);
    const asksMc = /\bmc\b|motorsykkel/.test(normalized);
    const asksCharging = /lad|elbil/.test(normalized);
    const asksHc = /\bhc\b|handikap|funksjonshem/.test(normalized);
    const kind = asksFree ? 'gratisparkering' : asksMc ? 'MC-parkering' : asksCharging ? 'parkering med lading' : asksHc ? 'HC-parkering' : 'parkering';

    if (!parking.length) {
      const answer = 'Jeg fant ingen registrert ' + kind + (area ? ' rundt ' + area.name : ' rundt posisjonen din') + '. Prøv kartet eller fjern noen av filtrene.';
      addMessage('assistant', answer);
      history.push({ role: 'assistant', text: answer });
      return true;
    }

    const nearest = parking[0];
    const source = PARKING_DATA.find(place => place.id === nearest.id);
    const distance = source ? formatDistance(source, origin) : Math.round(nearest.distanceMeters) + ' m';
    const rule = String(nearest.statusDetail || nearest.status || '').trim().slice(0, 240);
    const answer = 'Den nærmeste registrerte ' + kind + (area ? ' til ' + area.name : '') + ' er ' + nearest.name + ', omtrent ' + distance + ' unna i luftlinje.' + (rule ? ' ' + rule : '') + ' Appen har ikke sanntidsdata om ledige plasser.';
    const result = addMessage('assistant', answer);
    lastParkingIds = parking.slice(0, 3).map(place => place.id);
    lastParkingOrigin = origin;
    if (result) addParkingCards(result.bubble, lastParkingIds, origin);
    history.push({ role: 'assistant', text: answer.slice(0, 1500) });
    if (history.length > 12) history.splice(0, history.length - 12);
    return true;
  }

  function sendQuestion(question) {
    if (answerParkingSearchLocally(question)) {
      window.removeAiPhoto();
      setBusy(false);
      return;
    }
    const signOnly = !!imageDataUrl || /\b(?:parkerings)?skilt(?:et|ene)?\b|underskilt|trafikkskilt/.test(question.toLocaleLowerCase('nb-NO'));
    const parking = signOnly ? [] : relevantParking(question);
    const requestId = 'ai-' + Date.now() + '-' + (++requestNumber);
    if (signOnly) signRequests.add(requestId);
    const waiting = addMessage('assistant', signOnly ? 'Analyserer skiltet …' : 'Sjekker parkeringsdataene …', { loading: true });
    if (waiting) waiting.row.dataset.requestId = requestId;
    requestTimers.set(requestId, setTimeout(() => {
      requestTimers.delete(requestId);
      expiredRequests.add(requestId);
      receiveAiError({ requestId, message: 'AI-tjenesten brukte for lang tid. Prøv igjen.', watchdog: true });
    }, 20000));
    setBusy(true);
    const sent = nativeSend({
      type: 'aiAsk',
      requestId,
      question,
      history: history.slice(-8),
      imageDataUrl,
      latitude: appPerson ? appPerson[0] : null,
      longitude: appPerson ? appPerson[1] : null,
      parking
    });
    if (!sent) receiveAiError({ requestId, message: 'AI krever at appen kjøres gjennom Expo. Start appen med npx expo start --clear.' });
  }

  function formatDistance(place, origin = appPerson) {
    if (!Array.isArray(origin) || !place || !Array.isArray(place.center)) return '';
    const meters = distanceMeters(origin, place.center);
    return meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(1).replace('.', ',') + ' km';
  }

  function addParkingCards(bubble, ids, origin = appPerson) {
    if (!Array.isArray(ids) || !ids.length) return;
    const valid = ids.map(id => PARKING_DATA.find(place => place.id === id)).filter(Boolean).slice(0, 3);
    if (!valid.length) return;
    const container = document.createElement('div');
    container.className = 'ai-parking-results';
    valid.forEach(place => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ai-parking-card';
      const title = document.createElement('strong');
      title.textContent = place.name;
      const detail = document.createElement('small');
      detail.textContent = [formatDistance(place, origin), place.status, place.address].filter(Boolean).join(' · ');
      const arrow = document.createElement('span');
      arrow.textContent = '›';
      button.append(title, detail, arrow);
      button.addEventListener('click', () => appOpenDetails(place.id));
      container.appendChild(button);
    });
    bubble.appendChild(container);
  }

  function findGuideSign(answer, signCode = '') {
    if (!Array.isArray(SIGN_GUIDE)) return null;
    if (signCode) {
      const structured = SIGN_GUIDE.find(sign => sign.code === signCode || sign.id === signCode);
      if (structured) return structured;
    }
    const codes = [...String(answer).matchAll(/\b(?:skilt(?:et)?|nummer)\s*(\d{3}(?:\.\d+)*)/gi)].map(match => match[1]);
    for (const code of codes) {
      const exact = SIGN_GUIDE.find(sign => sign.code === code || sign.id === code);
      if (exact) return exact;
    }
    const normalized = String(answer).toLocaleLowerCase('nb-NO');
    const descriptionCode = /rødt?\s+kryss|to\s+(?:røde?\s+)?skråstreker/.test(normalized)
      ? '370'
      : /blå\s+(?:bunn|bakgrunn).*rød\s+ring.*(?:skråstrek|diagonal)|rød\s+ring.*(?:skråstrek|diagonal)/.test(normalized)
        ? '372'
        : '';
    if (descriptionCode) {
      const described = SIGN_GUIDE.find(sign => sign.code === descriptionCode || sign.id === descriptionCode);
      if (described) return described;
    }
    const compact = normalized.replace(/[^a-zæøå0-9]/g, '');
    return SIGN_GUIDE.find(sign => {
      const title = sign.title.toLocaleLowerCase('nb-NO');
      return title.length >= 5 && (normalized.includes(title) || compact.includes(title.replace(/[^a-zæøå0-9]/g, '')));
    }) || null;
  }

  function addSignGuideCard(bubble, answer, signCode) {
    const sign = findGuideSign(answer, signCode);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ai-sign-guide-card';
    const image = document.createElement('img');
    if (sign) {
      image.src = sign.image;
      image.alt = sign.title + ', skilt ' + sign.code;
    } else {
      image.className = 'ai-sign-guide-placeholder';
      image.alt = '';
    }
    const text = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = sign ? sign.title : 'Åpne skiltguiden';
    const detail = document.createElement('small');
    detail.textContent = sign ? 'Skilt ' + sign.code + ' · Se beskrivelse og regler' : 'Finn skiltet blant alle skiltene';
    text.append(title, detail);
    const arrow = document.createElement('b');
    arrow.textContent = '›';
    button.append(image, text, arrow);
    button.addEventListener('click', () => sign ? openGuideSign(sign.id) : go('guide'));
    bubble.appendChild(button);
  }

  function receiveAiResult(packet) {
    const requestId = String(packet.requestId || '');
    if (expiredRequests.has(requestId)) { expiredRequests.delete(requestId); return; }
    clearTimeout(requestTimers.get(requestId));
    requestTimers.delete(requestId);
    const waiting = document.querySelector('[data-request-id="' + CSS.escape(requestId) + '"]');
    if (waiting) waiting.remove();
    const answer = typeof packet.answer === 'string' && packet.answer.trim() ? packet.answer.trim() : 'Jeg klarte ikke å lage et svar. Prøv å formulere spørsmålet på nytt.';
    const result = addMessage('assistant', answer);
    const signOnly = signRequests.delete(requestId);
    if (result && signOnly) addSignGuideCard(result.bubble, answer, packet.signCode);
    if (result && !signOnly) addParkingCards(result.bubble, packet.parkingIds);
    if (!signOnly && Array.isArray(packet.parkingIds) && packet.parkingIds.length) lastParkingIds = packet.parkingIds.slice(0, 3);
    history.push({ role: 'assistant', text: answer.slice(0, 1500) });
    if (history.length > 12) history.splice(0, history.length - 12);
    window.removeAiPhoto();
    setBusy(false);
  }

  function receiveAiError(packet) {
    const requestId = String(packet.requestId || '');
    if (expiredRequests.has(requestId) && !packet.watchdog) { expiredRequests.delete(requestId); return; }
    clearTimeout(requestTimers.get(requestId));
    requestTimers.delete(requestId);
    signRequests.delete(requestId);
    const waiting = document.querySelector('[data-request-id="' + CSS.escape(requestId) + '"]');
    if (waiting) waiting.remove();
    addMessage('assistant', packet.message || 'AI-tjenesten svarte ikke. Prøv igjen om litt.', { error: true });
    setBusy(false);
  }

  window.submitAiQuestion = event => {
    if (event) event.preventDefault();
    if (busy) return;
    const question = (input()?.value || '').trim();
    if (!question && !imageDataUrl) return;
    const finalQuestion = question || 'Hva betyr parkeringsskiltet på bildet?';
    const attachedImage = imageDataUrl;
    addMessage('user', finalQuestion, { imageDataUrl: attachedImage });
    history.push({ role: 'user', text: finalQuestion.slice(0, 500) });
    if (input()) {
      input().value = '';
      input().blur();
    }
    hideAiPhotoPreview();
    setKeyboardLayout(false);
    if (needsLocation(finalQuestion) && !appPerson) {
      pendingLocationQuestion = finalQuestion;
      addMessage('assistant', 'Jeg trenger posisjonen din for å finne nærmeste plass. Godkjenn posisjon, så fortsetter jeg automatisk.');
      requestHomeLocation();
      return;
    }
    sendQuestion(finalQuestion);
  };

  window.askAiSuggestion = question => {
    if (!input() || busy) return;
    input().value = question;
    window.submitAiQuestion();
  };

  window.pickAiPhoto = camera => {
    if (busy) return;
    if (!nativeSend({ type: 'photo', camera: camera !== false, target: 'ai' })) {
      addMessage('assistant', 'Kameraet krever at appen kjøres gjennom Expo.', { error: true });
    }
  };

  function hideAiPhotoPreview() {
    const preview = document.getElementById('aiPhoto');
    const image = document.getElementById('aiPhotoImage');
    if (preview) preview.hidden = true;
    if (image) image.removeAttribute('src');
  }

  window.removeAiPhoto = () => {
    imageDataUrl = null;
    hideAiPhotoPreview();
  };

  function receiveAiPhoto(packet) {
    imageDataUrl = packet.dataUrl;
    const preview = document.getElementById('aiPhoto');
    const image = document.getElementById('aiPhotoImage');
    if (image) image.src = packet.dataUrl;
    if (preview) preview.hidden = false;
    if (input() && !input().value) input().value = 'Hva betyr dette parkeringsskiltet?';
  }

  window.analyzeSignPhotoWithAi = dataUrl => {
    if (busy || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
    receiveAiPhoto({ dataUrl });
    go('ai');
    if (input()) input().value = 'Forklar dette parkeringsskiltet. Les hovedskilt, underskilt, klokkeslett og eventuelle unntak.';
    setTimeout(() => window.submitAiQuestion(), 80);
  };

  const receiveBeforeAi = window.ParkSmartNative.receive;
  window.ParkSmartNative.receive = packet => {
    if (packet.type === 'aiResult') { receiveAiResult(packet); return; }
    if (packet.type === 'aiError') { receiveAiError(packet); return; }
    if (packet.type === 'photo' && packet.target === 'ai') {
      if (window.scanAiPending) {
        window.scanAiPending = false;
        window.analyzeSignPhotoWithAi(packet.dataUrl);
      } else receiveAiPhoto(packet);
      return;
    }
    if (packet.type === 'photoError' && packet.target === 'ai') {
      if (window.scanAiPending) {
        window.scanAiPending = false;
        go('scan');
        const status = document.getElementById('cameraStatus');
        if (status) status.textContent = packet.message || 'Bildet kunne ikke åpnes.';
        return;
      }
      addMessage('assistant', packet.message || 'Bildet kunne ikke åpnes.', { error: true });
      return;
    }
    receiveBeforeAi(packet);
    if (packet.type === 'location' && pendingLocationQuestion) {
      const question = pendingLocationQuestion;
      pendingLocationQuestion = null;
      setTimeout(() => sendQuestion(question), 50);
    }
    if (packet.type === 'locationError' && pendingLocationQuestion) {
      pendingLocationQuestion = null;
      addMessage('assistant', 'Jeg fikk ikke posisjonen din. Du kan fortsatt spørre om generelle parkeringsregler.', { error: true });
    }
  };

  const field = input();
  if (field) {
    field.addEventListener('focus', () => {
      setKeyboardLayout(true);
      setTimeout(() => {
        setKeyboardLayout(true);
        scrollToLatest();
      }, 120);
    });
    field.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== field) setKeyboardLayout(false);
      }, 180);
    });
    field.addEventListener('input', () => {
      field.style.height = 'auto';
      field.style.height = Math.min(field.scrollHeight, 96) + 'px';
    });
    field.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.submitAiQuestion();
      }
    });
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (document.activeElement === field) setKeyboardLayout(true);
    });
    window.visualViewport.addEventListener('scroll', () => {
      if (document.activeElement === field) setKeyboardLayout(true);
    });
  }
})();
