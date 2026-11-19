/* global L, parkingMap, renderResults, appPerson, locateMe */

(() => {
  let mountedMap;
  let locationButton;
  let centerMap;
  let busy = false;
  let timeout;

  const style = document.createElement('style');

  style.textContent = `
    .parksmart-recenter.leaflet-control {
      margin-bottom: 8px;
      border: 0;
      border-radius: 9px;
      background: none;
      box-shadow: 0 2px 8px #043b5226;
    }

    .parksmart-recenter button {
      position: relative;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 1px solid #d7e2e9;
      border-radius: 9px;
      background: white;
      color: #0759d8;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .parksmart-recenter button:active {
      background: #edf4ff;
    }

    .parksmart-recenter button:focus-visible {
      outline: 3px solid #8bbafa;
      outline-offset: 2px;
    }

    .parksmart-recenter button:disabled {
      opacity: 1;
      cursor: wait;
    }

    .parksmart-recenter svg {
      display: block;
      width: 19px;
      height: 19px;
    }

    .parksmart-recenter button[aria-busy="true"] svg {
      visibility: hidden;
    }

    .parksmart-recenter button[aria-busy="true"]::after {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      box-sizing: border-box;
      border: 2px solid #dce7f5;
      border-top-color: #0759d8;
      border-radius: 50%;
      animation: parksmart-location-spin .8s linear infinite;
    }

    @keyframes parksmart-location-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .parksmart-compact-controls .parksmart-recenter button {
      width: 28px;
      height: 28px;
      border-radius: 7px;
    }

    .parksmart-compact-controls .parksmart-recenter svg {
      width: 16px;
      height: 16px;
    }

    .parksmart-compact-controls .leaflet-bottom .leaflet-control {
      margin-bottom: 4px;
    }

    .parksmart-compact-controls .leaflet-bottom .leaflet-control-attribution {
      margin-bottom: 0;
    }

    .parksmart-compact-controls .leaflet-control-zoom a {
      width: 26px;
      height: 20px;
      line-height: 20px;
      font-size: 18px;
    }
  `;

  document.head.appendChild(style);

  function setBusy(value) {
    busy = value;

    if (!locationButton) return;

    locationButton.disabled = value;
    locationButton.setAttribute('aria-busy', String(value));

    locationButton.setAttribute(
      'aria-label',
      value ? 'Henter posisjonen din' : 'Vis min posisjon'
    );

    locationButton.title = value
      ? 'Henter posisjonen din …'
      : 'Vis min posisjon';
  }

  function message(text) {
    const status = document.getElementById('addressStatus');

    if (!status) return;

    status.textContent = text;
    status.hidden = false;
  }

  function finish() {
    window.clearTimeout(timeout);
    setBusy(false);
  }

  function locate() {
    if (busy) return;

    // Sentrer raskt til siste kjente posisjon.
    if (
      typeof appPerson !== 'undefined' &&
      Array.isArray(appPerson)
    ) {
      centerMap?.(appPerson);
    }

    mountedMap?.closePopup();
    setBusy(true);

    timeout = window.setTimeout(() => {
      finish();
      message(
        'Kunne ikke hente ny posisjon. Kontroller posisjonstilgang og prøv igjen.'
      );
    }, 20000);

    // Hent en oppdatert posisjon med eksisterende telefonintegrasjon.
    try {
      locateMe();
    } catch {
      finish();
      message('Kunne ikke hente posisjonen. Prøv igjen.');
    }
  }

  function installLocationControl() {
    if (
      typeof L === 'undefined' ||
      !parkingMap ||
      mountedMap === parkingMap
    ) {
      return;
    }

    const map = parkingMap;
    mountedMap = map;

    let zooming = false;
    let pendingCenter;

    centerMap = point => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every(Number.isFinite)
      ) {
        return;
      }

      if (zooming) {
        pendingCenter = [...point];
      } else {
        map.setView(point, 16, { animate: false });
      }
    };

    map.on('zoomstart', () => {
      zooming = true;
    });

    map.on('zoomend', () => {
      zooming = false;

      const point = pendingCenter;
      pendingCenter = null;

      if (point) {
        centerMap(point);
      }
    });

    const control = L.control({
      position: 'bottomright',
    });

    control.onAdd = () => {
      const container = L.DomUtil.create(
        'div',
        'parksmart-recenter'
      );

      locationButton = document.createElement('button');
      locationButton.id = 'mapLocateButton';
      locationButton.type = 'button';

      locationButton.innerHTML = `
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="7"/>
          <circle
            cx="12"
            cy="12"
            r="2.5"
            fill="currentColor"
            stroke="none"
          />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
        </svg>
      `;

      locationButton.addEventListener('click', locate);
      container.appendChild(locationButton);

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      setBusy(busy);

      return container;
    };

    control.addTo(map);

    const resize = () => {
      map.getContainer().classList.toggle(
        'parksmart-compact-controls',
        map.getContainer().clientHeight < 140
      );
    };

    resize();
    map.on('resize', resize);

    if (window.ResizeObserver) {
      new window.ResizeObserver(resize).observe(
        map.getContainer()
      );
    }
  }

  const previousRender = renderResults;

  renderResults = function (...args) {
    const result = previousRender(...args);
    installLocationControl();
    return result;
  };

  const previousReceive = window.ParkSmartNative.receive;

  window.ParkSmartNative.receive = function (packet) {
    const wasBusy = busy;

    previousReceive.call(this, packet);

    if (packet.type === 'location') {
      finish();

      if (wasBusy) {
        centerMap?.([
          packet.latitude,
          packet.longitude,
        ]);
      }
    }

    if (packet.type === 'locationError') {
      finish();

      if (wasBusy) {
        message(
          packet.message || 'Posisjon ikke delt. Prøv igjen.'
        );
      }
    }
  };

  installLocationControl();
})();