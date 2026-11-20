import type { Dataset } from '../domain/types';
import { assessParking } from '../domain/rules';

export function designData(dataset: Dataset, now = new Date()) {
  return dataset.locations.map(p => {
    const t = dataset.tariffs[String(p.tariffId)];
    const status = assessParking(p, t, now);
    return {
      id: p.id, name: p.name, center: [p.latitude, p.longitude], kind: p.facility === 'lot' || p.facility === 'unknown' ? 'area' : p.facility,
      capacity: p.capacity, free: p.payment === 'free' || p.payment === 'free_limited', mcFree: p.facility === 'mc',
      freeSpaces: p.freeSpaces, hcSpaces: p.hcSpaces, chargingSpaces: p.chargingSpaces, payment: p.payment,
      rate: p.tariffId, feeHours: t?.hours, maxStay: t?.maxStay, regular: t?.regular, electric: t?.electric,
      quality: t?.quality, night: !!p.nightBan, nightText: p.nightBan, notes: p.notes,
      address: p.address, approximate: p.addressApproximate, fetchedAt: p.fetchedAt, operator: p.operator,
      source: p.source === 'oslo' ? 'Oslo kommune' : 'Statens vegvesen', url: p.sourceUrl,
      status: status.label, statusDetail: status.detail, isFreeNow: status.isFreeNow, forbidden: status.forbidden,
      freeUntil: status.nextFeeAt ? new Intl.DateTimeFormat('nb-NO', {
        weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo',
      }).format(status.nextFeeAt) : undefined,
      after20: (p.facility === 'mc' && status.isFreeNow === true) || (p.source === 'oslo' && t?.quality === 'consistent' && [2020,2200,2240,2260,2300,2310,2600,2650,2700,2850,2880,2960].includes(t.id) && !p.nightBan && !p.notes && /20:00/.test(t.hours) && p.facility === 'street'),
    };
  });
}
