/* global PARKING_DATA, appOpenDetails, appPerson, nativeSend, requestHomeLocation, go */
/* ParkSmart AI presentation layer. The native host owns networking and secrets. */
(() => {
  let imageDataUrl = null;
  let busy = false;
  let requestNumber = 0;
  let pendingLocationQuestion = null;
  let lastParkingIds = [];
  const history = [];
  const requestTimers = new Map();
  const expiredRequests = new Set();

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

  function relevantParking(question) {
    if (!Array.isArray(appPerson) || appPerson.length !== 2) return [];
    const normalized = question.toLocaleLowerCase('nb-NO');
    const isFollowUp = /den første|det første|den andre|det andre|den tredje|det tredje|denne|den der|må jeg betale|hvor mye|hva koster|pris/.test(normalized) && lastParkingIds.length;
    let candidates = isFollowUp
      ? lastParkingIds.map(id => PARKING_DATA.find(place => place.id === id)).filter(Boolean)
      : PARKING_DATA.filter(place => !place.forbidden);
    if (isFollowUp) {
      return candidates.slice(0, 8).map(place => ({
        id: place.id,
        name: place.name,
        address: place.address || 'Adresse ikke oppgitt',
        type: place.kind,
        distanceMeters: Math.round(distanceMeters(appPerson, place.center)),
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
      .map(place => ({ place, distance: distanceMeters(appPerson, place.center) }))
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
    return /nærmest|i nærheten|i området|nær meg|rundt meg|hvor er|finn.*parkering|finnes.*parkering/.test(question.toLocaleLowerCase('nb-NO'));
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
    if (!/nærmest|i nærheten|i området|nær meg|rundt meg|hvor er|finn.*parkering|finnes.*parkering/.test(normalized) || !appPerson) return false;
    const parking = relevantParking(question);
    const asksFree = /gratis|avgiftsfri|uten å betale/.test(normalized);
    const asksMc = /\bmc\b|motorsykkel/.test(normalized);
    const asksCharging = /lad|elbil/.test(normalized);
    const asksHc = /\bhc\b|handikap|funksjonshem/.test(normalized);
    const kind = asksFree ? 'gratisparkering' : asksMc ? 'MC-parkering' : asksCharging ? 'parkering med lading' : asksHc ? 'HC-parkering' : 'parkering';

    if (!parking.length) {
      const answer = 'Jeg fant ingen registrert ' + kind + ' i parkeringsdataene rundt posisjonen din. Prøv kartet eller fjern noen av filtrene.';
      addMessage('assistant', answer);
      history.push({ role: 'assistant', text: answer });
      return true;
    }

    const nearest = parking[0];
    const source = PARKING_DATA.find(place => place.id === nearest.id);
    const distance = source ? formatDistance(source) : Math.round(nearest.distanceMeters) + ' m';
    const rule = String(nearest.statusDetail || nearest.status || '').trim().slice(0, 240);
    const answer = 'Den nærmeste registrerte ' + kind + ' er ' + nearest.name + ', omtrent ' + distance + ' unna i luftlinje.' + (rule ? ' ' + rule : '') + ' Appen har ikke sanntidsdata om ledige plasser.';
    const result = addMessage('assistant', answer);
    lastParkingIds = parking.slice(0, 3).map(place => place.id);
    if (result) addParkingCards(result.bubble, lastParkingIds);
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
    const parking = relevantParking(question);
    const requestId = 'ai-' + Date.now() + '-' + (++requestNumber);
    const waiting = addMessage('assistant', imageDataUrl ? 'Analyserer bildet og parkeringsdataene …' : 'Sjekker parkeringsdataene …', { loading: true });
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

  function formatDistance(place) {
    if (!appPerson || !place || !Array.isArray(place.center)) return '';
    const meters = distanceMeters(appPerson, place.center);
    return meters < 1000 ? Math.round(meters) + ' m' : (meters / 1000).toFixed(1).replace('.', ',') + ' km';
  }

  function addParkingCards(bubble, ids) {
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
      detail.textContent = [formatDistance(place), place.status, place.address].filter(Boolean).join(' · ');
      const arrow = document.createElement('span');
      arrow.textContent = '›';
      button.append(title, detail, arrow);
      button.addEventListener('click', () => appOpenDetails(place.id));
      container.appendChild(button);
    });
    bubble.appendChild(container);
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
    if (result) addParkingCards(result.bubble, packet.parkingIds);
    if (Array.isArray(packet.parkingIds) && packet.parkingIds.length) lastParkingIds = packet.parkingIds.slice(0, 3);
    history.push({ role: 'assistant', text: answer.slice(0, 1500) });
    if (history.length > 12) history.splice(0, history.length - 12);
    window.removeAiPhoto();
    setBusy(false);
    input()?.focus({ preventScroll: true });
  }

  function receiveAiError(packet) {
    const requestId = String(packet.requestId || '');
    if (expiredRequests.has(requestId) && !packet.watchdog) { expiredRequests.delete(requestId); return; }
    clearTimeout(requestTimers.get(requestId));
    requestTimers.delete(requestId);
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
    addMessage('user', finalQuestion + (imageDataUrl ? '\n📷 Bilde vedlagt' : ''));
    history.push({ role: 'user', text: finalQuestion.slice(0, 500) });
    if (input()) input().value = '';
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

  window.removeAiPhoto = () => {
    imageDataUrl = null;
    const preview = document.getElementById('aiPhoto');
    const image = document.getElementById('aiPhotoImage');
    if (preview) preview.hidden = true;
    if (image) image.removeAttribute('src');
  };

  function receiveAiPhoto(packet) {
    imageDataUrl = packet.dataUrl;
    const preview = document.getElementById('aiPhoto');
    const image = document.getElementById('aiPhotoImage');
    if (image) image.src = packet.dataUrl;
    if (preview) preview.hidden = false;
    if (input() && !input().value) input().value = 'Hva betyr dette parkeringsskiltet?';
    input()?.focus({ preventScroll: true });
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
