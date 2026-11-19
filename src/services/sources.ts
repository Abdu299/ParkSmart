export const SOURCES = {
  mc: 'https://geodata.bymoslo.no/arcgis/rest/services/geodata/Parkering/MapServer/0',
  street: 'https://geodata.bymoslo.no/arcgis/rest/services/geodata/Gateparkering/MapServer/4',
  streetDetails: 'https://geodata.bymoslo.no/arcgis/rest/services/geodata/Gateparkering/MapServer/5',
  prices: 'https://geodata.bymoslo.no/arcgis/rest/services/geodata/Gateparkering/MapServer/6',
  register: 'https://parkreg-open.atlas.vegvesen.no/ws/no/vegvesen/veg/parkeringsomraade/parkeringsregisteret/v1/parkeringsomraade',
  officialPrices: 'https://www.oslo.kommune.no/gate-transport-og-parkering/parkering/priser-og-betaling-for-parkering/',
  officialMap: 'https://www.oslo.kommune.no/gate-transport-og-parkering/parkering/kart-over-parkeringsplasser-i-oslo/',
  boundary: 'https://ws.geonorge.no/kommuneinfo/v1/kommuner/0301/omrade',
  addresses: 'https://ws.geonorge.no/adresser/v1',
};

export type Attributes = Record<string, unknown>;
export interface Feature { attributes: Attributes; geometry?: { x: number; y: number } }
export interface RegistryRecord {
  id: number; breddegrad: number; lengdegrad: number; parkeringstilbyderNavn: string;
  navn?: string; adresse?: string; versjonsnummer?: number;
  deaktivert?: { deaktivertTidspunkt: string } | null;
  aktivVersjon?: {
    navn?: string; adresse?: string; versjonsnummer?: number; sistEndret?: string;
    antallAvgiftsbelagtePlasser?: number; antallAvgiftsfriePlasser?: number;
    antallLadeplasser?: number; antallForflytningshemmede?: number;
    typeParkeringsomrade?: string; innfartsparkering?: string;
  };
}

export async function fetchText(url: string, timeout = 25000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Kilden svarte HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

export async function fetchJson<T>(url: string, timeout?: number): Promise<T> {
  const value = JSON.parse(await fetchText(url, timeout));
  if (value && typeof value === 'object' && 'error' in value) throw new Error(`Karttjenesten: ${value.error.message ?? 'ugyldig svar'}`);
  return value as T;
}

export async function fetchFeatures(url: string, options: Record<string, string> = {}): Promise<Feature[]> {
  const all: Feature[] = [];
  let offset = 0;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ where: '1=1', outFields: '*', outSR: '4326', f: 'json',
      resultRecordCount: '500', resultOffset: String(offset), orderByFields: 'objectid', ...options });
    const response = await fetchJson<{ features: Feature[]; exceededTransferLimit?: boolean }>(`${url}/query?${query}`);
    if (!Array.isArray(response.features)) throw new Error('Karttjenesten returnerte ikke et gyldig punktlag.');
    all.push(...response.features);
    if (!response.exceededTransferLimit) return all;
    if (!response.features.length) throw new Error('Ufullstendig side fra karttjenesten.');
    offset += response.features.length;
  }
  throw new Error('Karttjenesten returnerte flere sider enn forventet.');
}

export function numberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
