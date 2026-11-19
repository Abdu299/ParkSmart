import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import type { Dataset } from '../domain/types';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeCache(data: Dataset): string {
  const bytes = gzipSync(strToU8(JSON.stringify(data)), { level: 6 });
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const value = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    parts.push(BASE64[(value >>> 18) & 63] + BASE64[(value >>> 12) & 63] + (i + 1 < bytes.length ? BASE64[(value >>> 6) & 63] : '=') + (i + 2 < bytes.length ? BASE64[value & 63] : '='));
  }
  return parts.join('');
}

export function decodeCache(encoded: string): Dataset {
  if (!encoded.length || encoded.length > 12000000 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('Ugyldig lagret datasett.');
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(encoded.length / 4 * 3 - padding);
  let offset = 0;
  for (let i = 0; i < encoded.length; i += 4) {
    const a = BASE64.indexOf(encoded[i]); const b = BASE64.indexOf(encoded[i + 1]);
    const c = BASE64.indexOf(encoded[i + 2]); const d = BASE64.indexOf(encoded[i + 3]);
    const value = (a << 18) | (b << 12) | (Math.max(0, c) << 6) | Math.max(0, d);
    if (offset < bytes.length) bytes[offset++] = (value >>> 16) & 255;
    if (offset < bytes.length) bytes[offset++] = (value >>> 8) & 255;
    if (offset < bytes.length) bytes[offset++] = value & 255;
  }
  const data = JSON.parse(strFromU8(gunzipSync(bytes))) as Dataset;
  if (data.schemaVersion !== 1 || !Array.isArray(data.locations) || data.locations.length < 50 || !data.tariffs || !data.fetchedAt) throw new Error('Ufullstendig lagret datasett.');
  return data;
}
