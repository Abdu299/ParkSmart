import type { Dataset, Parking } from '../domain/types';
import { insideBoundary, type Boundary } from '../domain/geo';
import { buildDataset, normalizeRegistry } from './normalize';
import { fetchFeatures, fetchJson, fetchText, SOURCES, type RegistryRecord } from './sources';

export async function refreshDataset(previous: Dataset | undefined, onProgress: (text: string) => void, detailed = false): Promise<Dataset> {
  onProgress('Henter parkeringsdata fra Oslo kommune …');
  const [street, details, mc, prices, register, border, officialHtml] = await Promise.all([
    fetchFeatures(SOURCES.street),
    fetchFeatures(SOURCES.streetDetails, { returnGeometry: 'false', outFields: 'objectid,globalid,takstgruppe1,befart_antall,fritekst,last_edited_date,nattparkeringsforbud,nattparkeringsforbud_nb' }),
    fetchFeatures(SOURCES.mc),
    fetchFeatures(SOURCES.prices, { returnGeometry: 'false' }),
    fetchJson<RegistryRecord[]>(`${SOURCES.register}?datafelter=kart`),
    fetchJson<{ omrade: Boundary }>(SOURCES.boundary),
    fetchText(SOURCES.officialPrices).catch(() => ''),
  ]);
  if (!Array.isArray(register) || !border.omrade) throw new Error('Kilden returnerte et uventet dataformat.');
  const active = register.filter(r => !r.deaktivert && insideBoundary({ latitude: r.breddegrad, longitude: r.lengdegrad }, border.omrade));
  if (detailed) {
    // Fetch active versions only. The national `datafelter=alle` response contains very large histories.
    const candidates = active.filter(r => !r.parkeringstilbyderNavn.includes('BYMILJ'));
    let cursor = 0; let complete = 0; let failed = 0;
    const workers = Array.from({ length: 5 }, async () => {
      while (cursor < candidates.length) {
        const index = cursor++; const record = candidates[index];
        try {
          const detail = await fetchJson<RegistryRecord>(`${SOURCES.register}/${record.id}/versjon/${record.versjonsnummer}`);
          if (!detail.deaktivert) Object.assign(record, detail);
          else record.deaktivert = detail.deaktivert;
        } catch { failed++; }
        complete++;
        if (complete % 50 === 0) onProgress(`Kontrollerer private anlegg: ${complete}/${candidates.length} (${failed} uten detaljer)`);
      }
    });
    await Promise.all(workers);
  }
  onProgress('Kontrollerer takster og geografisk dekning …');
  return buildDataset({ street, details, mc, prices, register: active, boundary: border.omrade, officialHtml, fetchedAt: new Date().toISOString(), previous });
}

export async function refreshRegistryParking(p: Parking): Promise<Parking | null> {
  const record = await fetchJson<RegistryRecord>(`${SOURCES.register}/${p.sourceId}`);
  return normalizeRegistry(record, new Date().toISOString());
}

export interface AddressResult { label: string; latitude: number; longitude: number }
export async function searchAddresses(query: string, signal?: AbortSignal): Promise<AddressResult[]> {
  const params = new URLSearchParams({ sok: query, kommunenummer: '0301', treffPerSide: '5', fuzzy: 'true' });
  const response = await fetch(`${SOURCES.addresses}/sok?${params}`, { signal });
  if (!response.ok) throw new Error('Adressesøket er midlertidig utilgjengelig.');
  const json = await response.json();
  return (json.adresser ?? []).map((a: { adressetekst: string; poststed: string; representasjonspunkt: { lat: number; lon: number } }) => ({
    label: `${a.adressetekst}, ${a.poststed}`, latitude: a.representasjonspunkt.lat, longitude: a.representasjonspunkt.lon,
  }));
}

const addressCache = new Map<string, string>();
export async function nearbyAddress(p: Parking): Promise<string | null> {
  const cached = addressCache.get(p.id); if (cached) return cached;
  const params = new URLSearchParams({ lat: String(p.latitude), lon: String(p.longitude), radius: '100', treffPerSide: '10' });
  const json = await fetchJson<{ adresser?: { adressetekst: string; representasjonspunkt: { lat: number; lon: number } }[] }>(`${SOURCES.addresses}/punktsok?${params}`);
  const addresses = json.adresser ?? [];
  const { distanceMeters } = await import('../domain/geo');
  addresses.sort((a, b) => distanceMeters(p, { latitude: a.representasjonspunkt.lat, longitude: a.representasjonspunkt.lon }) - distanceMeters(p, { latitude: b.representasjonspunkt.lat, longitude: b.representasjonspunkt.lon }));
  if (!addresses[0]) return null;
  const label = `Ved ${addresses[0].adressetekst}, Oslo`;
  addressCache.set(p.id, label); return label;
}
