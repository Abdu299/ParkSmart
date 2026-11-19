import type { Parking, Payment } from './types';

export const COLORS = {
  ink: '#142F35', muted: '#697C80', teal: '#087F72', mint: '#D7F4E8', surface: '#FFFFFF',
  background: '#F4F7F5', line: '#E4ECE8', free: '#18845A', free_limited: '#088A96', paid: '#3479C8', unknown: '#76858D',
};

export const PAYMENT_LABELS: Record<Payment, string> = {
  free: 'Gratis', free_limited: 'Gratis med makstid', paid: 'Betaling', unknown: 'Vilkår må sjekkes',
};

export function markerColor(p: Parking): string { return COLORS[p.payment]; }

export function parkingIcon(p: Parking): 'motorbike' | 'parking' | 'home-city-outline' | 'wheelchair-accessibility' | 'ev-station' {
  if (p.facility === 'mc') return 'motorbike';
  if (p.facility === 'garage') return 'home-city-outline';
  if (p.hcSpaces && p.hcSpaces > 0) return 'wheelchair-accessibility';
  if (p.chargingSpaces && p.chargingSpaces > 0) return 'ev-station';
  return 'parking';
}

export function facilityLabel(p: Parking): string {
  const labels = { street: 'Gateparkering', lot: 'Parkeringsområde', garage: 'Parkeringshus', mc: 'MC-parkering', unknown: 'Parkeringsområde' };
  return labels[p.facility];
}

export function sourceDate(value: string): string {
  return new Intl.DateTimeFormat('nb-NO', { year: 'numeric', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).format(new Date(value));
}
