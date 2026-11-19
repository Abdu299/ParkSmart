import type { Coordinate, Parking, Viewport } from './types';

export const OSLO_CENTER: Coordinate = { latitude: 59.9139, longitude: 10.7522 };
export const INITIAL_VIEW: Viewport = { ...OSLO_CENTER, latitudeDelta: 0.026, longitudeDelta: 0.036 };

export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const rad = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * rad;
  const lon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(lon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

export function distanceLabel(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

export function validCoordinate(p: Coordinate): boolean {
  return Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180;
}

export function inViewport(p: Coordinate, v: Viewport): boolean {
  return Math.abs(p.latitude - v.latitude) <= v.latitudeDelta * 0.65 && Math.abs(p.longitude - v.longitude) <= v.longitudeDelta * 0.65;
}

export interface MapCluster extends Coordinate { id: string; points: Parking[] }
// A screen-space grid keeps the number of native annotations bounded at city zoom.
// Every filtered point belongs to one cell; cluster counts represent records, not vacancies.
export function clusterParking(points: Parking[], region: Viewport): MapCluster[] {
  const rows = 11;
  const columns = 8;
  const latStep = Math.max(region.latitudeDelta / rows, 0.000055);
  const lonStep = Math.max(region.longitudeDelta / columns, 0.000075);
  const cells = new Map<string, Parking[]>();
  for (const point of points) {
    if (!inViewport(point, region)) continue;
    const key = `${Math.floor(point.latitude / latStep)}:${Math.floor(point.longitude / lonStep)}`;
    const group = cells.get(key) ?? [];
    group.push(point);
    cells.set(key, group);
  }
  const clusters: MapCluster[] = [];
  for (const [id, group] of cells) {
    let latitude = 0;
    let longitude = 0;
    for (const point of group) { latitude += point.latitude; longitude += point.longitude; }
    clusters.push({ id, latitude: latitude / group.length, longitude: longitude / group.length, points: group });
  }
  return clusters;
}

type Ring = number[][];
type Polygon = Ring[];
export interface Boundary { type: 'Polygon' | 'MultiPolygon'; coordinates: Polygon | Polygon[] }

function insideRing(p: Coordinate, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > p.latitude) !== (yj > p.latitude) && p.longitude < ((xj - xi) * (p.latitude - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function insideBoundary(p: Coordinate, boundary: Boundary): boolean {
  if (!validCoordinate(p) || p.latitude < 59.7 || p.latitude > 60.2 || p.longitude < 10.3 || p.longitude > 11.1) return false;
  const polygons = boundary.type === 'Polygon' ? [boundary.coordinates as Polygon] : boundary.coordinates as Polygon[];
  for (const rings of polygons) {
    if (!insideRing(p, rings[0])) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) if (insideRing(p, rings[i])) inHole = true;
    if (!inHole) return true;
  }
  return false;
}
