import type { Coordinate, Parking, Viewport } from '../domain/types';
export interface MapHandle { focus: (point: Coordinate, delta?: number) => void }
export interface ParkingMapProps {
  locations: Parking[]; region: Viewport; selectedId?: string; showUserLocation: boolean;
  onRegionChange: (region: Viewport) => void; onSelect: (parking: Parking) => void;
  contentInsets: { top: number; bottom: number };
}
