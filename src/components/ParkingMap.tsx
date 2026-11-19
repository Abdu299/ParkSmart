import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { clusterParking, INITIAL_VIEW } from '../domain/geo';
import { COLORS, markerColor, parkingIcon } from '../domain/presentation';
import type { Parking } from '../domain/types';
import type { MapHandle, ParkingMapProps } from './ParkingMap.types';

const Pin = memo(function Pin({ parking, selected }: { parking: Parking; selected: boolean }) {
  const color = selected ? COLORS.ink : markerColor(parking);
  return <View style={styles.markerCanvas}><View style={[styles.pin, { backgroundColor: color }, selected && styles.selected]}>
    <MaterialCommunityIcons name={parkingIcon(parking)} size={22} color="white" />
  </View><View style={[styles.tip, { borderTopColor: color }]} /></View>;
});

function SingleMarker({ parking, selected, onPress }: { parking: Parking; selected: boolean; onPress: () => void }) {
  const [tracking, setTracking] = useState(true);
  useEffect(() => { const timer = setTimeout(() => setTracking(false), 700); return () => clearTimeout(timer); }, []);
  return <Marker coordinate={parking} onPress={onPress} tracksViewChanges={tracking} anchor={{ x: 0.5, y: 1 }} zIndex={selected ? 100 : 10}
    accessibilityLabel={parking.name}><Pin parking={parking} selected={selected} /></Marker>;
}

const ParkingMap = forwardRef<MapHandle, ParkingMapProps>(function ParkingMap(props, ref) {
  const map = useRef<MapView>(null);
  const clusters = useMemo(() => clusterParking(props.locations, props.region), [props.locations, props.region]);
  useImperativeHandle(ref, () => ({ focus: (point, delta = 0.007) => map.current?.animateToRegion({ ...point, latitudeDelta: delta, longitudeDelta: delta * 1.35 }, 450) }), []);
  return <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={INITIAL_VIEW} showsUserLocation={props.showUserLocation}
    showsMyLocationButton={false} showsCompass={false} showsPointsOfInterests={false} rotateEnabled={false}
    mapPadding={{ top: props.contentInsets.top, bottom: props.contentInsets.bottom, left: 0, right: 0 }}
    legalLabelInsets={{ top: 0, bottom: props.contentInsets.bottom + 4, left: 12, right: 12 }}
    onRegionChangeComplete={props.onRegionChange} accessibilityLabel="Kart over parkeringsområder i Oslo">
    {clusters.map(cluster => cluster.points.length === 1 ? <SingleMarker key={`${cluster.points[0].id}:${props.selectedId === cluster.points[0].id}`} parking={cluster.points[0]}
      selected={props.selectedId === cluster.points[0].id} onPress={() => props.onSelect(cluster.points[0])} /> :
      <Marker key={`cluster:${cluster.id}`} coordinate={cluster} tracksViewChanges={false}
        onPress={() => map.current?.animateToRegion({ latitude: cluster.latitude, longitude: cluster.longitude, latitudeDelta: Math.max(props.region.latitudeDelta / 2.7, 0.0002), longitudeDelta: Math.max(props.region.longitudeDelta / 2.7, 0.0003) }, 400)}
        accessibilityLabel={`${cluster.points.length} parkeringsoppføringer. Trykk for å zoome inn.`}>
        <View style={styles.cluster}><Text style={styles.clusterText}>{cluster.points.length}</Text></View>
      </Marker>)}
  </MapView>;
});

const styles = StyleSheet.create({
  markerCanvas: { width: 52, height: 60, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  pin: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: 'white' },
  selected: { width: 44, height: 44, borderWidth: 3 },
  tip: { width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 7, borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -1 },
  cluster: { backgroundColor: COLORS.ink, borderRadius: 22, minWidth: 42, height: 42, paddingHorizontal: 10, borderWidth: 3, borderColor: 'white', alignItems: 'center', justifyContent: 'center' },
  clusterText: { color: 'white', fontWeight: '800', fontSize: 14 },
});
export default ParkingMap;
