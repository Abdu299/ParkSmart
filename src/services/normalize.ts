import { distanceMeters, insideBoundary, validCoordinate, type Boundary } from '../domain/geo';
import type { Dataset, Parking, Tariff, PriceRow } from '../domain/types';
import { numberValue, SOURCES, stringValue, type Feature, type RegistryRecord } from './sources';

export function parseMinutes(text: string): number | undefined {
  const match = text.toLowerCase().match(/(\d+)\s*(minutt|time|døgn|dag|uke)/);
  if (!match) return undefined;
  const multiplier = match[2] === 'minutt' ? 1 : match[2] === 'time' ? 60 : match[2] === 'uke' ? 10080 : 1440;
  return Number(match[1]) * multiplier;
}

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&ndash;|&#8211;/g, '–').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function parseOfficialTables(html: string): Record<string, { header: string[]; rows: PriceRow[] }> {
  const tables: Record<string, { header: string[]; rows: PriceRow[] }> = {};
  for (const match of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const body = match[1];
    const id = body.match(/<caption[^>]*>\s*Takstgruppe\s+(\d+)/i)?.[1];
    if (!id) continue;
    const header = [...(body.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)?.[1] ?? '').matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m => plain(m[1]));
    const rows: PriceRow[] = [];
    const tbody = body.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? '';
    for (const row of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plain(m[1]));
      if (cells.length > 1) rows.push({ label: cells[0], values: cells.slice(1) });
    }
    if (header.length && rows.length) tables[id] = { header, rows };
  }
  return tables;
}

function priceNumbers(text: string): number[] {
  const result: number[] = [];
  for (const m of text.matchAll(/(?:\d{1,3}(?:\s\d{3})+|\d+)(?:[,.]\d+)?\s*kr\b/gi)) {
    result.push(Number(m[0].replace(/kr|\s/gi, '').replace(',', '.')));
  }
  return result;
}

export function buildTariffs(features: Feature[], html: string, fetchedAt: string): Record<string, Tariff> {
  const official = parseOfficialTables(html);
  const tariffs: Record<string, Tariff> = {};
  for (const feature of features) {
    const a = feature.attributes;
    const id = numberValue(a.takst);
    if (id === undefined || id === 0) continue;
    const regular = stringValue(a.pris_bensin_diesel_hybrid);
    const electric = stringValue(a.pris_elbil);
    const maxStay = stringValue(a.pris_maks_tid) || stringValue(a.elbil_maks_p_tid_gjelder_inne);
    const hours = stringValue(a['pris_tidspunkt_du_må_betale']);
    const table = official[String(id)];
    const issues: string[] = [];
    if (table) {
      for (const [kind, prices] of [['Bensin', regular], ['Elbil', electric]]) {
        const row = table.rows.find(r => r.label.toLowerCase().startsWith(kind.toLowerCase()));
        if (!row || !prices) continue;
        const api = priceNumbers(prices);
        // Compare explicit prices only. Do not invent hourly prices from package rates.
        for (let i = 0; i < Math.min(api.length, row.values.length); i++) {
          const value = row.values[i].match(/^\s*(\d+(?:[,.]\d+)?)(?:\s*kr)?/);
          if (value && api[i] !== Number(value[1].replace(',', '.'))) {
            issues.push(`${kind}: ulik pris i kartdata og prissiden (${api[i]} / ${value[1]} kr).`);
          }
        }
      }
      if (table.header[0]?.toLowerCase().includes('avgiftstid ubegrenset') && /09:00.*20:00/.test(hours)) {
        issues.push('Ulik avgiftstid i kartdata og prissiden.');
      }
    }
    tariffs[String(id)] = {
      id, maxStay, maxStayMinutes: parseMinutes(maxStay), hours, regular, electric,
      officialHeader: table?.header, officialRows: table?.rows,
      quality: issues.length ? 'conflict' : table && regular && hours ? 'consistent' : 'partial',
      issues, fetchedAt,
    };
  }
  return tariffs;
}

function humanName(name: string): string {
  if (name.length > 5 && name === name.toLocaleUpperCase('nb-NO')) {
    const lower = name.toLocaleLowerCase('nb-NO');
    return lower[0].toLocaleUpperCase('nb-NO') + lower.slice(1);
  }
  return name;
}

export function normalizeRegistry(record: RegistryRecord, fetchedAt: string, previous?: Parking): Parking | null {
  if (record.deaktivert || !validCoordinate({ latitude: record.breddegrad, longitude: record.lengdegrad })) return null;
  const version = record.aktivVersjon;
  const sameVersion = previous?.version === record.versjonsnummer;
  const base: Parking = {
    id: `svv:${record.id}`, source: 'register', sourceId: record.id, sourceUrl: `${SOURCES.register}/${record.id}`,
    latitude: record.breddegrad, longitude: record.lengdegrad,
    name: humanName(version?.navn ?? record.navn ?? 'Parkeringsområde'),
    address: version?.adresse ?? record.adresse, operator: record.parkeringstilbyderNavn,
    facility: 'unknown', payment: 'unknown', fetchedAt, version: version?.versjonsnummer ?? record.versjonsnummer,
    registryDetailsCurrent: !!version,
  };
  if (!version && previous && sameVersion) {
    return { ...previous, ...base, facility: previous.facility, payment: previous.payment,
      capacity: previous.capacity, hcSpaces: previous.hcSpaces, chargingSpaces: previous.chargingSpaces,
      freeSpaces: previous.freeSpaces, paidSpaces: previous.paidSpaces, sourceUpdatedAt: previous.sourceUpdatedAt,
      registryDetailsCurrent: previous.registryDetailsCurrent };
  }
  if (!version) return base;
  const types = { PARKERINGSHUS: 'garage', LANGS_KJOREBANE: 'street', AVGRENSET_OMRADE: 'lot' } as const;
  base.facility = types[version.typeParkeringsomrade as keyof typeof types] ?? 'unknown';
  base.paidSpaces = numberValue(version.antallAvgiftsbelagtePlasser);
  base.freeSpaces = numberValue(version.antallAvgiftsfriePlasser);
  base.hcSpaces = numberValue(version.antallForflytningshemmede);
  base.chargingSpaces = numberValue(version.antallLadeplasser);
  if (base.paidSpaces !== undefined && base.freeSpaces !== undefined) base.capacity = base.paidSpaces + base.freeSpaces;
  // A free capacity count does not prove unrestricted public access.
  if ((base.paidSpaces ?? 0) > 0 && base.freeSpaces === 0) base.payment = 'paid';
  base.sourceUpdatedAt = version.sistEndret;
  if (version.innfartsparkering === 'JA') base.notes = 'Registrert som innfartsparkering.';
  return base;
}

export function buildDataset(input: {
  street: Feature[]; details: Feature[]; mc: Feature[]; register: RegistryRecord[];
  prices: Feature[]; officialHtml: string; boundary: Boundary; fetchedAt: string; previous?: Dataset;
}): Dataset {
  const tariffs = buildTariffs(input.prices, input.officialHtml, input.fetchedAt);
  const details = new Map(input.details.map(f => [numberValue(f.attributes.objectid), f.attributes]));
  const previous = new Map(input.previous?.locations.map(p => [p.id, p]) ?? []);
  const registry = input.register.filter(r => !r.deaktivert && insideBoundary({ latitude: r.breddegrad, longitude: r.lengdegrad }, input.boundary));
  // Nearby municipal register names are display hints only. They never supply tariffs or merge IDs.
  const nameGrid = new Map<string, RegistryRecord[]>();
  for (const r of registry) {
    if (!r.parkeringstilbyderNavn.includes('BYMILJ')) continue;
    const key = `${Math.floor(r.breddegrad * 1000)}:${Math.floor(r.lengdegrad * 1000)}`;
    const group = nameGrid.get(key) ?? []; group.push(r); nameGrid.set(key, group);
  }
  function nearbyName(latitude: number, longitude: number): string | undefined {
    const y = Math.floor(latitude * 1000); const x = Math.floor(longitude * 1000);
    let best = 65; let name: string | undefined;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) {
      for (const r of nameGrid.get(`${y + dy}:${x + dx}`) ?? []) {
        const d = distanceMeters({ latitude, longitude }, { latitude: r.breddegrad, longitude: r.lengdegrad });
        if (d < best) { best = d; name = humanName(r.adresse ?? r.navn ?? ''); }
      }
    }
    return name;
  }
  const locations: Parking[] = [];
  const seen = new Set<string>();
  for (const [features, isMc] of [[input.street, false], [input.mc, true]] as const) {
    for (const feature of features) {
      if (!feature.geometry) continue;
      const coordinate = { latitude: feature.geometry.y, longitude: feature.geometry.x };
      if (!insideBoundary(coordinate, input.boundary)) continue;
      const a = feature.attributes; const sourceId = numberValue(a.objectid);
      if (sourceId === undefined) continue;
      if (!isMc && numberValue(a.ptype_code) !== 1) continue;
      const detail = details.get(sourceId);
      const tariffId = numberValue(a.takstgruppe1_code ?? detail?.takstgruppe1);
      const tariff = tariffId ? tariffs[String(tariffId)] : undefined;
      const price = priceNumbers(tariff?.regular ?? '');
      const free = price.length > 0 && price.every(n => n === 0);
      const id = `oslo:${isMc ? 'mc' : 'street'}:${detail?.globalid ?? sourceId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const address = nearbyName(coordinate.latitude, coordinate.longitude);
      const note = stringValue(detail?.fritekst ?? a.fritekst);
      const nightBan = stringValue(detail?.nattparkeringsforbud_nb) || (detail?.nattparkeringsforbud === 'Ja' ? 'Området har nattparkeringsforbud. Kontroller tidene på skiltet.' : '');
      const edited = numberValue(detail?.last_edited_date);
      locations.push({
        id, ...coordinate, source: 'oslo', sourceId, sourceUrl: `${isMc ? SOURCES.mc : SOURCES.street}/query?f=json&where=objectid%3D${sourceId}&outFields=*`,
        fetchedAt: input.fetchedAt, sourceUpdatedAt: edited ? new Date(edited).toISOString() : undefined,
        name: isMc ? 'MC-parkering' : address ? humanName(address.split(/\s+mellom\s+/i)[0]) : `Parkering${tariffId ? ` · takst ${tariffId}` : ''}`,
        address: address ? `Ved ${address}` : undefined, addressApproximate: !!address,
        operator: 'Oslo kommune · Bymiljøetaten', facility: isMc ? 'mc' : 'street',
        payment: isMc ? 'free' : free ? tariff?.maxStayMinutes ? 'free_limited' : 'free' : price.length ? 'paid' : 'unknown',
        tariffId: tariffId || undefined, maxStayMinutes: tariff?.maxStayMinutes,
        capacity: numberValue(a.befart_antall ?? detail?.befart_antall), notes: note || undefined, nightBan: nightBan || undefined,
      });
    }
  }
  for (const record of registry) {
    // Municipal street records describe overlapping stretches. Their map points above are primary.
    // Keep municipal records only when a separate garage/HC/charging facility is explicitly identified.
    const p = normalizeRegistry(record, input.fetchedAt, previous.get(`svv:${record.id}`));
    if (!p) continue;
    if (record.parkeringstilbyderNavn.includes('BYMILJ') && p.facility !== 'garage') continue;
    locations.push(p);
  }
  if (locations.length < 50 || input.mc.length === 0 || input.street.length < 50) throw new Error('Ufullstendig datasett. Beholder forrige uttrekk.');
  const conflicts = Object.values(tariffs).filter(t => t.quality === 'conflict');
  return {
    schemaVersion: 1, fetchedAt: input.fetchedAt, locations, tariffs,
    sources: [
      { name: 'Oslo kommune · parkering', url: SOURCES.street, fetchedAt: input.fetchedAt, count: input.street.length },
      { name: 'Oslo kommune · MC', url: SOURCES.mc, fetchedAt: input.fetchedAt, count: input.mc.length },
      { name: 'Statens vegvesen · Parkeringsregisteret', url: SOURCES.register, fetchedAt: input.fetchedAt, count: locations.filter(p => p.source === 'register').length },
      { name: 'Oslo kommune · priser', url: SOURCES.officialPrices, fetchedAt: input.fetchedAt, count: Object.keys(tariffs).length },
    ],
    warnings: [
      'Uttrekket dekker registrerte områder i Oslo. Fullstendig dekning og ledige plasser er ikke bekreftet.',
      'HC- og ladefiltrene viser registrerte egenskaper ved områder. Eksakt plassering av hver enkelt HC- eller ladeplass er ikke alltid kjent.',
      ...conflicts.map(t => `Takst ${t.id}: motstridende pris- eller tidsopplysninger. Automatisk tidsberegning er slått av.`),
      ...(!input.officialHtml ? ['Kommunens prisside kunne ikke kontrolleres. Automatisk avgiftstidsberegning er slått av.'] : []),
    ],
  };
}
