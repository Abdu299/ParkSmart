export type Vehicle = 'car' | 'mc';
export type Fuel = 'regular' | 'electric';
export type Payment = 'free' | 'free_limited' | 'paid' | 'unknown';
export type Facility = 'street' | 'lot' | 'garage' | 'mc' | 'unknown';
export type Filter = 'free' | 'paid' | 'garage' | 'charging' | 'hc';
export interface Coordinate { latitude: number; longitude: number }
export interface Viewport extends Coordinate { latitudeDelta: number; longitudeDelta: number }
export interface Parking extends Coordinate {
  id: string;
  source: 'oslo' | 'register';
  sourceId: number;
  sourceUrl: string;
  fetchedAt: string;
  sourceUpdatedAt?: string;
  version?: number;
  name: string;
  address?: string;
  addressApproximate?: boolean;
  facility: Facility;
  payment: Payment;
  tariffId?: number;
  operator: string;
  capacity?: number;
  freeSpaces?: number;
  paidSpaces?: number;
  chargingSpaces?: number;
  hcSpaces?: number;
  notes?: string;
  nightBan?: string;
  maxStayMinutes?: number;
  registryDetailsCurrent?: boolean;
}
export interface PriceRow { label: string; values: string[] }
export interface Tariff {
  id: number;
  maxStay: string;
  maxStayMinutes?: number;
  hours: string;
  regular: string;
  electric: string;
  officialHeader?: string[];
  officialRows?: PriceRow[];
  quality: 'consistent' | 'conflict' | 'partial';
  issues: string[];
  fetchedAt: string;
}
export interface Dataset {
  schemaVersion: 1;
  fetchedAt: string;
  locations: Parking[];
  tariffs: Record<string, Tariff>;
  sources: { name: string; url: string; fetchedAt: string; count: number }[];
  warnings: string[];
}
export interface Preferences {
  vehicle: Vehicle;
  fuel: Fuel;
  filters: Filter[];
  onlyFreeNow: boolean;
  mcDedicatedOnly: boolean;
}
export interface ParkingStatus {
  label: string;
  detail: string;
  isFreeNow: boolean | null;
  forbidden: boolean;
  nextFeeAt?: Date;
}
