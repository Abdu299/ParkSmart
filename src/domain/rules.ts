import type { Dataset, Parking, ParkingStatus, Preferences, Tariff } from './types';

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function osloTime(date: Date) {
  const parts = formatter.formatToParts(date);
  const get = (name: string) => Number(parts.find(p => p.type === name)?.value ?? 0);
  const year = get('year'); const month = get('month'); const day = get('day');
  return { year, month, day, minute: get('hour') * 60 + get('minute'), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

export function easterSunday(year: number): Date {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

export function isHoliday(year: number, month: number, day: number): boolean {
  if (['1-1', '5-1', '5-17', '12-25', '12-26'].includes(`${month}-${day}`)) return true;
  const date = Date.UTC(year, month - 1, day);
  const easter = easterSunday(year).getTime();
  return [-3, -2, 0, 1, 39, 49, 50].some(offset => date === easter + offset * 86400000);
}

type Schedule = { start: number; end: number; allDays: boolean };
function parseSchedule(t: Tariff): Schedule | null {
  if (t.quality !== 'consistent') return null;
  const text = t.hours.toLowerCase().replace(/[–—]/g, '-');
  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/);
  if (!match || text.includes('man-fre') || text.includes(' og ')) return null;
  const allDays = text.includes('man-søn');
  if (!allDays && !text.includes('man-lør')) return null;
  const start = Number(match[1]) * 60 + Number(match[2] ?? 0);
  const end = Number(match[3]) * 60 + Number(match[4] ?? 0);
  if (start >= end || end > 1440) return null;
  return { start, end, allDays };
}

function hasFeeAt(date: Date, schedule: Schedule): boolean {
  const time = osloTime(date);
  // Norwegian holidays use the Sunday schedule. All-day recreation tariffs also charge Sundays.
  if (!schedule.allDays && (time.weekday === 0 || isHoliday(time.year, time.month, time.day))) return false;
  return time.minute >= schedule.start && time.minute < schedule.end;
}

const nextFeeCache = new Map<string, Date | null>();
function nextFeeTime(now: Date, schedule: Schedule): Date | null {
  const minute = Math.floor(now.getTime() / 60000);
  const key = `${minute}:${schedule.start}:${schedule.end}:${schedule.allDays}`;
  if (nextFeeCache.has(key)) return nextFeeCache.get(key) ?? null;
  let result: Date | null = null;
  for (let offset = 1; offset <= 8 * 24 * 60; offset++) {
    const candidate = new Date((minute + offset) * 60000);
    if (hasFeeAt(candidate, schedule)) { result = candidate; break; }
  }
  if (nextFeeCache.size > 100) nextFeeCache.clear();
  nextFeeCache.set(key, result);
  return result;
}

export function assessParking(p: Parking, tariff: Tariff | undefined, now = new Date()): ParkingStatus {
  const unknown = (detail: string): ParkingStatus => ({ label: 'Sjekk vilkårene', detail, isFreeNow: null, forbidden: false });
  const age = now.getTime() - new Date(p.fetchedAt).getTime();
  if (!Number.isFinite(age) || age > 24 * 3600000 || age < -60000) {
    return unknown('Lagret informasjon. Oppdater data før du vurderer pris og tidsregler.');
  }
  if (p.nightBan) {
    const time = osloTime(now);
    // These two tariff groups have an explicitly published 20–09 prohibition.
    if ([2025, 2210].includes(p.tariffId ?? 0) && (time.minute >= 1200 || time.minute < 540)) {
      return { label: 'Nattparkering forbudt', detail: p.nightBan, isFreeNow: false, forbidden: true };
    }
    return unknown(p.nightBan);
  }
  if (p.notes && /reservert|tillatelse|varebil|forbud|stengt|kun |vinter|sommer|må befares/i.test(p.notes)) return unknown(p.notes);
  if (p.facility === 'mc' && p.source === 'oslo') {
    return { label: 'Gratis MC-parkering', detail: 'Kommunal, dedikert MC-plass. Makstid og øvrige vilkår må leses på skiltet.', isFreeNow: true, forbidden: false };
  }
  if (p.source === 'register') return unknown('Registeret oppgir kapasitet, men gir ikke fullstendige priser eller tilgangsvilkår.');
  if (!tariff) return unknown('Detaljerte priser og tidsregler er ikke oppgitt.');
  if (tariff.quality === 'conflict') return unknown('Kommunens kartdata og prisside er ikke samstemte. Se prisinformasjonen og kontroller skiltet.');
  if (p.payment === 'free' || p.payment === 'free_limited') {
    return { label: tariff.maxStay ? `Gratis · maks ${tariff.maxStay.toLowerCase()}` : 'Gratis ifølge kartdata', detail: 'Kontroller krav om urskive eller registrering på skiltet.', isFreeNow: true, forbidden: false };
  }
  const schedule = parseSchedule(tariff);
  if (!schedule) return unknown(`Avgiftstid: ${tariff.hours || 'ikke oppgitt'}. Automatisk tidsberegning er ikke tilgjengelig for disse vilkårene.`);
  if (hasFeeAt(now, schedule)) return { label: 'Betaling nå', detail: `Avgiftstid: ${tariff.hours}`, isFreeNow: false, forbidden: false };
  // Step along the real UTC timeline so daylight-saving transitions remain correct.
  const candidate = nextFeeTime(now, schedule);
  if (candidate) {
      const label = new Intl.DateTimeFormat('nb-NO', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(candidate);
      return { label: `Avgiftsfritt til ${label}`, detail: 'Gjelder parkeringsavgiften. Makstid og andre skiltvilkår gjelder fortsatt.', isFreeNow: true, forbidden: false, nextFeeAt: candidate };
  }
  return unknown('Neste avgiftsperiode kunne ikke beregnes.');
}

export function matchesParking(p: Parking, preferences: Preferences, data: Dataset, now: Date): boolean {
  if (preferences.vehicle === 'car' && p.facility === 'mc') return false;
  if (preferences.vehicle === 'mc' && preferences.mcDedicatedOnly && p.facility !== 'mc') return false;
  if (preferences.filters.length) {
    let match = false;
    for (const filter of preferences.filters) {
      if (filter === 'free' && (p.payment === 'free' || p.payment === 'free_limited' || (p.freeSpaces ?? 0) > 0)) match = true;
      if (filter === 'paid' && p.payment === 'paid') match = true;
      if (filter === 'garage' && p.facility === 'garage') match = true;
      if (filter === 'charging' && (p.chargingSpaces ?? 0) > 0) match = true;
      if (filter === 'hc' && (p.hcSpaces ?? 0) > 0) match = true;
    }
    if (!match) return false;
  }
  if (preferences.onlyFreeNow && assessParking(p, data.tariffs[String(p.tariffId)], now).isFreeNow !== true) return false;
  return true;
}
