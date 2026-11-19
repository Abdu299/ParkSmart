import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assessParking, easterSunday, isHoliday, matchesParking, osloTime } from '../src/domain/rules';
import { clusterParking, distanceMeters, INITIAL_VIEW, insideBoundary, inViewport } from '../src/domain/geo';
import { buildTariffs, normalizeRegistry, parseOfficialTables } from '../src/services/normalize';
import { decodeCache, encodeCache } from '../src/services/cacheCodec';
import { fetchFeatures, numberValue } from '../src/services/sources';
import type { Dataset, Parking, Preferences, Tariff } from '../src/domain/types';

const snapshot = JSON.parse(readFileSync(new URL('../src/data/parking-oslo.json', import.meta.url), 'utf8')) as Dataset;
const sunday = new Date('2026-11-08T10:00:00Z');
const spot: Parking = { id: 'test', source: 'oslo', sourceId: 1, sourceUrl: 'https://example.invalid', fetchedAt: sunday.toISOString(),
  latitude: 59.9139, longitude: 10.7522, name: 'Test', facility: 'street', payment: 'paid', operator: 'Oslo kommune', tariffId: 2200 };
const tariff: Tariff = { id: 2200, maxStay: '2 timer', maxStayMinutes: 120, hours: 'Kl. 09:00-20:00 (man-lør)', regular: '1 time 71 kr, 2 timer 141 kr', electric: '1 time 36 kr, 2 timer 70 kr', quality: 'consistent', issues: [], fetchedAt: sunday.toISOString() };
const prefs: Preferences = { vehicle: 'car', fuel: 'regular', filters: [], onlyFreeNow: false, mcDedicatedOnly: true };

test('Sunday parking becomes chargeable at 09:00 Oslo time on Monday', () => {
  const status = assessParking(spot, tariff, sunday);
  assert.equal(status.isFreeNow, true);
  assert.equal(status.nextFeeAt?.toISOString(), '2026-11-09T08:00:00.000Z');
});

test('Summer time and the October clock change use Europe/Oslo', () => {
  assert.equal(osloTime(new Date('2026-07-06T07:00:00Z')).minute, 540);
  assert.equal(osloTime(new Date('2026-11-09T08:00:00Z')).minute, 540);
  const beforeChange = new Date('2026-10-25T00:30:00Z');
  const result = assessParking({ ...spot, fetchedAt: beforeChange.toISOString() }, tariff, beforeChange);
  assert.equal(result.nextFeeAt?.toISOString(), '2026-10-26T08:00:00.000Z');
});

test('Norwegian holidays follow Sunday; Christmas Eve is not a public holiday', () => {
  assert.equal(easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(isHoliday(2026, 4, 2), true);
  assert.equal(isHoliday(2026, 5, 14), true);
  assert.equal(isHoliday(2026, 5, 25), true);
  assert.equal(isHoliday(2026, 12, 24), false);
  const day = new Date('2026-05-14T10:00:00Z');
  assert.equal(assessParking({ ...spot, fetchedAt: day.toISOString() }, tariff, day).isFreeNow, true);
});

test('All-week recreation tariffs charge on Sundays too', () => {
  const result = assessParking(spot, { ...tariff, hours: 'Kl. 09:00-20:00 (man-søn)' }, sunday);
  assert.equal(result.isFreeNow, false);
});

test('Conflicting data, stale data and unparsed schedules never become free now', () => {
  assert.equal(assessParking(spot, { ...tariff, quality: 'conflict' }, sunday).isFreeNow, null);
  assert.equal(assessParking(spot, { ...tariff, hours: 'Se skilt' }, sunday).isFreeNow, null);
  assert.equal(assessParking({ ...spot, fetchedAt: '2026-11-06T10:00:00Z' }, tariff, sunday).isFreeNow, null);
  assert.equal(assessParking(spot, undefined, sunday).isFreeNow, null);
});

test('Night prohibition overrides an apparently free period', () => {
  const night = new Date('2026-11-08T21:00:00Z');
  const result = assessParking({ ...spot, tariffId: 2025, fetchedAt: night.toISOString(), nightBan: 'Parkering forbudt 20–09 alle dager.' }, tariff, night);
  assert.equal(result.forbidden, true); assert.equal(result.isFreeNow, false);
});

test('A count of free places does not prove free public access', () => {
  const p = { ...spot, source: 'register' as const, payment: 'unknown' as const, freeSpaces: 3, paidSpaces: 7 };
  assert.equal(assessParking(p, undefined, sunday).isFreeNow, null);
  assert.equal(matchesParking(p, { ...prefs, filters: ['free'] }, snapshot, sunday), true);
  assert.equal(matchesParking(p, { ...prefs, filters: ['free'], onlyFreeNow: true }, snapshot, sunday), false);
});

test('A conditional MC spot is not presented as free now outside its documented access hours', () => {
  const conditional = snapshot.locations.find(p => p.facility === 'mc' && p.notes?.includes('forbud'));
  assert.ok(conditional);
  assert.equal(assessParking(conditional, undefined, new Date(snapshot.fetchedAt)).isFreeNow, null);
});

test('Multiple type filters are OR; vehicle and free-now constraints are AND', () => {
  const mc = { ...spot, facility: 'mc' as const, payment: 'free' as const };
  assert.equal(matchesParking(mc, { ...prefs, filters: ['free', 'garage'] }, snapshot, sunday), false);
  assert.equal(matchesParking(mc, { ...prefs, vehicle: 'mc', filters: ['free', 'garage'] }, snapshot, sunday), true);
  assert.equal(matchesParking(spot, { ...prefs, vehicle: 'mc' }, snapshot, sunday), false);
});

test('Deactivated records and changed versions cannot retain old capacities', () => {
  const record = { id: 1, breddegrad: spot.latitude, lengdegrad: spot.longitude, parkeringstilbyderNavn: 'Operatør', navn: 'Test', versjonsnummer: 2 };
  const old = { ...spot, source: 'register' as const, id: 'svv:1', version: 1, hcSpaces: 12 };
  assert.equal(normalizeRegistry({ ...record, deaktivert: { deaktivertTidspunkt: sunday.toISOString() } }, sunday.toISOString()), null);
  assert.equal(normalizeRegistry(record, sunday.toISOString(), old)?.hcSpaces, undefined);
  assert.equal(normalizeRegistry({ ...record, versjonsnummer: 1 }, sunday.toISOString(), old)?.hcSpaces, 12);
});

test('Missing values are not silently converted to zero kroner or zero places', () => {
  assert.equal(numberValue(null), undefined); assert.equal(numberValue(''), undefined);
  assert.equal(numberValue(-999), undefined); assert.equal(numberValue(false), undefined); assert.equal(numberValue('0'), 0);
});

test('Municipal HTML tables preserve non-linear prices and detect a disagreement', () => {
  const html = '<table><caption>Takstgruppe 2520 (Test)</caption><thead><tr><th>Maks 4 uker, avgiftstid 09:00–20:00</th><th>1 time</th><th>1 uke</th><th>4 uker</th></tr></thead><tbody><tr><td>Bensin, diesel, hybrid</td><td>71 kr</td><td>395 kr</td><td>1450 kr</td></tr></tbody></table>';
  assert.equal(parseOfficialTables(html)['2520'].rows[0].values[2], '1450 kr');
  const tariffs = buildTariffs([{ attributes: { takst: 2520, pris_maks_tid: '28 dager', 'pris_tidspunkt_du_må_betale': 'Kl. 09:00-20:00 (man-lør)', pris_bensin_diesel_hybrid: '1 time 71 kr, 1 uke 395 kr, 4 uker 1415 kr', pris_elbil: '' } }], html, sunday.toISOString());
  assert.equal(tariffs['2520'].quality, 'conflict');
});

test('Cluster counts preserve all visible source records', () => {
  const clusters = clusterParking(snapshot.locations, INITIAL_VIEW);
  const expected = snapshot.locations.filter(p => inViewport(p, INITIAL_VIEW));
  assert.equal(clusters.reduce((sum, c) => sum + c.points.length, 0), expected.length);
  assert.equal(new Set(clusters.flatMap(c => c.points.map(p => p.id))).size, expected.length);
  assert.ok(clusters.length < 200);
  assert.equal(distanceMeters(spot, spot), 0);
});

test('Municipality polygons support holes, not just a rectangular Oslo bounding box', () => {
  const boundary = { type: 'Polygon' as const, coordinates: [[[10.5, 59.8], [10.9, 59.8], [10.9, 60.1], [10.5, 60.1], [10.5, 59.8]], [[10.7, 59.9], [10.8, 59.9], [10.8, 60], [10.7, 60], [10.7, 59.9]]] };
  assert.equal(insideBoundary({ latitude: 59.85, longitude: 10.6 }, boundary), true);
  assert.equal(insideBoundary({ latitude: 59.95, longitude: 10.75 }, boundary), false);
  assert.equal(insideBoundary({ latitude: 60.15, longitude: 10.75 }, boundary), false);
});

test('The real snapshot has unique IDs, traceable sources and no rental-only point types', () => {
  assert.ok(snapshot.locations.length > 1000);
  assert.equal(new Set(snapshot.locations.map(p => p.id)).size, snapshot.locations.length);
  assert.equal(snapshot.locations.filter(p => p.facility === 'mc').length, 64);
  assert.ok(snapshot.locations.filter(p => p.facility === 'garage').length > 100);
  for (const p of snapshot.locations) {
    assert.ok(p.sourceUrl.startsWith('https://')); assert.ok(p.sourceId > 0);
    assert.ok(p.latitude > 59.7 && p.latitude < 60.2 && p.longitude > 10.3 && p.longitude < 11.1);
    assert.ok(![316170, 316171].includes(p.sourceId) || p.source !== 'oslo');
  }
  assert.equal(snapshot.tariffs['2250'].quality, 'conflict'); assert.equal(snapshot.tariffs['2520'].quality, 'conflict');
});

test('Compressed phone cache round-trips Norwegian text and fits Android storage limits', () => {
  const encoded = encodeCache(snapshot);
  assert.ok(encoded.length < 1500000);
  assert.deepEqual(decodeCache(encoded), snapshot);
  assert.throws(() => decodeCache('bad!'));
  assert.throws(() => decodeCache(encoded.slice(0, -12)));
});

test('ArcGIS pagination follows truncated pages rather than assuming one complete response', async () => {
  const original = globalThis.fetch; const offsets: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); offsets.push(url.searchParams.get('resultOffset') ?? '');
    return new Response(JSON.stringify({ features: [{ attributes: { objectid: offsets.length } }], exceededTransferLimit: offsets.length === 1 }));
  };
  try { const result = await fetchFeatures('https://example.invalid/layer'); assert.equal(result.length, 2); assert.deepEqual(offsets, ['0', '1']); }
  finally { globalThis.fetch = original; }
});
