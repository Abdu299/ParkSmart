import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type * as Leaflet from 'leaflet';
import { markerColor, PAYMENT_LABELS } from '../domain/presentation';
import { clusterParking, INITIAL_VIEW } from '../domain/geo';
import type { MapHandle, ParkingMapProps } from './ParkingMap.types';
import '../styles/leaflet.web.css';

const ParkingMap = forwardRef<MapHandle, ParkingMapProps>(function ParkingMap(props, ref) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const latest = useRef(props); latest.current = props;
  const { locations, region, onSelect } = props;
  useImperativeHandle(ref, () => ({ focus: (point, delta = 0.007) => {
    map.current?.fitBounds([[point.latitude - delta / 2, point.longitude - delta * 0.675], [point.latitude + delta / 2, point.longitude + delta * 0.675]], { animate: true });
  } }), []);
  useEffect(() => {
    let disposed = false;
    void import('leaflet').then(L => {
      if (disposed || !element.current) return;
      leaflet.current = L;
      const m = L.map(element.current, { zoomControl: false }).setView([INITIAL_VIEW.latitude, INITIAL_VIEW.longitude], 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      layer.current = L.layerGroup().addTo(m); map.current = m;
      const notify = () => {
        const center = m.getCenter(); const bounds = m.getBounds();
        latest.current.onRegionChange({ latitude: center.lat, longitude: center.lng, latitudeDelta: bounds.getNorth() - bounds.getSouth(), longitudeDelta: bounds.getEast() - bounds.getWest() });
      };
      m.on('moveend', notify); notify();
      const observer = new ResizeObserver(() => m.invalidateSize()); observer.observe(element.current);
      m.once('unload', () => observer.disconnect());
    });
    return () => { disposed = true; map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const L = leaflet.current; if (!L || !map.current || !layer.current) return;
    layer.current.clearLayers();
    for (const c of clusterParking(locations, region)) {
      const p = c.points[0]; const count = c.points.length;
      const color = count > 1 ? '#142F35' : markerColor(p);
      const label = count > 1 ? String(count) : p.facility === 'mc' ? 'MC' : p.facility === 'garage' ? 'P⌂' : 'P';
      const icon = L.divIcon({ className: '', iconSize: [40, 46], iconAnchor: [20, 42],
        html: `<div style="background:${color};color:white;border:3px solid white;box-shadow:0 2px 8px #142f3526;border-radius:14px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font:bold 14px system-ui">${label}</div>` });
      const marker = L.marker([c.latitude, c.longitude], { icon, title: count > 1 ? `${count} registreringer` : `${p.name} · ${PAYMENT_LABELS[p.payment]}` });
      marker.on('click', () => { if (count === 1) onSelect(p); else map.current?.setView([c.latitude, c.longitude], Math.min(20, (map.current?.getZoom() ?? 14) + 2)); });
      layer.current.addLayer(marker);
    }
  }, [locations, region, onSelect]);
  return <div ref={element} aria-label="Kart over parkering i Oslo" style={{ position: 'absolute', inset: 0, background: '#E4ECE7', zIndex: 0 }} />;
});
export default ParkingMap;
