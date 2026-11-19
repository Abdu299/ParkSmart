import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ParkingMap from '../components/ParkingMap';
import type { MapHandle } from '../components/ParkingMap.types';
import ParkingDetails from '../components/ParkingDetails';
import { OptionsSheet, SourcesSheet } from '../components/OptionsSheet';
import { IconButton, ParkingRow, Sheet } from '../components/ui';
import { distanceMeters, INITIAL_VIEW, OSLO_CENTER } from '../domain/geo';
import { matchesParking } from '../domain/rules';
import { COLORS } from '../domain/presentation';
import type { Coordinate, Filter, Parking } from '../domain/types';
import { searchAddresses, type AddressResult } from '../services/data';
import { useParking } from '../state/ParkingProvider';

const FILTERS: { key: Filter; title: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'free', title: 'Gratis', icon: 'leaf-outline' }, { key: 'paid', title: 'Betaling', icon: 'card-outline' },
  { key: 'garage', title: 'P-hus', icon: 'business-outline' }, { key: 'charging', title: 'Lading', icon: 'flash-outline' }, { key: 'hc', title: 'HC', icon: 'accessibility-outline' },
];

export default function MapScreen() {
  const { data, preferences, setPreferences, refresh, refreshing, progress } = useParking();
  const inset = useSafeAreaInsets();
  const map = useRef<MapHandle>(null);
  const [region, setRegion] = useState(INITIAL_VIEW);
  const [now, setNow] = useState(new Date());
  const [position, setPosition] = useState<Coordinate | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [results, setResults] = useState<AddressResult[]>([]);
  const [searchOrigin, setSearchOrigin] = useState<AddressResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showList, setShowList] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(220);
  const [nearbyHeight, setNearbyHeight] = useState(245);
  const mounted = useRef(true);
  const watch = useRef<Location.LocationSubscription | null>(null);
  const requestNumber = useRef(0);

  const locate = useCallback(async (automatic = false) => {
    const request = ++requestNumber.current;
    setLocating(true); setLocationMessage('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!mounted.current || request !== requestNumber.current) return;
      setPermissionGranted(permission.granted);
      if (!permission.granted) { setLocationMessage('Posisjon er av. Du kan søke etter en adresse.'); return; }
      const current = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      if (!mounted.current || request !== requestNumber.current) return;
      const point = { latitude: current.coords.latitude, longitude: current.coords.longitude };
      setPosition(point);
      if (point.latitude > 59.7 && point.latitude < 60.2 && point.longitude > 10.3 && point.longitude < 11.1) {
        if (!automatic || !searchOrigin) { setSearchOrigin(null); map.current?.focus(point, 0.015); }
      } else setLocationMessage('Du er utenfor Oslo. Kartet viser parkering i Oslo.');
      watch.current?.remove();
      const subscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 25, timeInterval: 10000 }, update => {
        if (mounted.current) setPosition({ latitude: update.coords.latitude, longitude: update.coords.longitude });
      });
      if (!mounted.current) subscription.remove(); else watch.current = subscription;
    } catch { if (mounted.current) setLocationMessage('Fant ikke posisjonen nå. Prøv igjen eller søk etter en adresse.'); }
    finally { if (mounted.current && request === requestNumber.current) setLocating(false); }
  }, [searchOrigin]);

  useEffect(() => {
    mounted.current = true;
    const startup = setTimeout(() => { if (Platform.OS !== 'web') void locate(true); }, 0);
    const counter = requestNumber;
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => { mounted.current = false; counter.current++; watch.current?.remove(); clearInterval(timer); clearTimeout(startup); };
    // Request once on opening. Later searches must not retrigger a permission dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void searchAddresses(query.trim(), controller.signal).then(items => {
        if (!controller.signal.aborted) { setResults(items); setSearchError(items.length ? '' : 'Ingen adresser i Oslo funnet. Prøv gatenavn og nummer.'); }
      }).catch(() => { if (!controller.signal.aborted) setSearchError('Kunne ikke søke nå. Du kan flytte kartet eller prøve igjen.'); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  const filtered = useMemo(() => data.locations.filter(p => matchesParking(p, preferences, data, now)), [data, preferences, now]);
  const origin = searchOrigin ?? position ?? region;
  const nearest = useMemo(() => {
    const distances = filtered.map(parking => ({ parking, distance: distanceMeters(origin, parking) }));
    distances.sort((a, b) => a.distance - b.distance);
    return distances.map(entry => entry.parking);
  }, [filtered, origin]);
  const selected = useMemo(() => data.locations.find(p => p.id === selectedId) ?? null, [data.locations, selectedId]);
  const selectParking = useCallback((parking: Parking) => { setShowList(false); setSelectedId(parking.id); Keyboard.dismiss(); }, []);
  const toggleFilter = (key: Filter) => setPreferences({ filters: preferences.filters.includes(key) ? preferences.filters.filter(f => f !== key) : [...preferences.filters, key] });
  function changeQuery(value: string) { setQuery(value); setResults([]); setSearchError(''); setSearching(value.trim().length >= 3); }
  function chooseAddress(address: AddressResult) { setSearchOrigin(address); changeQuery(''); Keyboard.dismiss(); map.current?.focus(address, 0.013); }
  const sourceLabel = searchOrigin ? searchOrigin.label.split(',')[0] : position ? 'din posisjon' : 'kartets midtpunkt';
  const filterCount = preferences.filters.length + Number(preferences.onlyFreeNow);

  return <View style={styles.screen}>
    <ParkingMap ref={map} locations={filtered} region={region} onRegionChange={setRegion} onSelect={selectParking} selectedId={selectedId ?? undefined} showUserLocation={permissionGranted} contentInsets={{ top: headerHeight + 4, bottom: nearbyHeight + 5 }} />
    <View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)} style={[styles.header, { paddingTop: Math.max(inset.top, 15) }]}>
      <View style={styles.brandRow}><View style={styles.brand}><View style={styles.logo}><Text style={styles.logoP}>P</Text></View><Text style={styles.wordmark}>parker<Text style={{ color: COLORS.teal }}>.</Text></Text><View style={styles.city}><Text style={styles.cityText}>OSLO</Text></View></View>
        <View style={styles.tools}><IconButton name="information-circle-outline" onPress={() => setShowSources(true)} label="Om parkeringsdataene" /><IconButton name="refresh-outline" onPress={() => void refresh()} label="Oppdater parkeringsdata" disabled={refreshing} /></View></View>
      <View style={styles.search}><Ionicons name="search-outline" size={20} color={COLORS.muted} /><TextInput accessibilityLabel="Søk etter adresse i Oslo" placeholder="Hvor vil du parkere?" placeholderTextColor="#879792" style={styles.searchInput} value={query} onChangeText={changeQuery} returnKeyType="search" autoCorrect={false} onSubmitEditing={() => { if (results[0]) chooseAddress(results[0]); }} />
        {searching ? <ActivityIndicator size="small" color={COLORS.teal} /> : query ? <Pressable onPress={() => changeQuery('')} accessibilityRole="button" accessibilityLabel="Tøm søk"><Ionicons name="close-circle" size={20} color={COLORS.muted} /></Pressable> : <Ionicons name="location-outline" size={19} color={COLORS.teal} />}
      </View>
      <View style={styles.vehicleRow}><View style={styles.vehicleSegment}>{(['car', 'mc'] as const).map(vehicle => <Pressable key={vehicle} accessibilityRole="button" accessibilityLabel={vehicle === 'car' ? 'Velg bil' : 'Velg MC'} accessibilityState={{ selected: preferences.vehicle === vehicle }} onPress={() => setPreferences({ vehicle })} style={[styles.vehicle, preferences.vehicle === vehicle && styles.activeVehicle]}>
        <MaterialCommunityIcons name={vehicle === 'car' ? 'car-side' : 'motorbike'} size={22} color={preferences.vehicle === vehicle ? 'white' : COLORS.muted} /><Text style={[styles.vehicleText, preferences.vehicle === vehicle && { color: 'white' }]}>{vehicle === 'car' ? 'Bil' : 'MC'}</Text></Pressable>)}</View>
        <Pressable onPress={() => setShowOptions(true)} accessibilityRole="button" accessibilityLabel="Tilpass filtre og kjøretøy" style={styles.options}><Ionicons name="options-outline" size={19} color={COLORS.ink} /><Text style={styles.optionsText}>{preferences.vehicle === 'car' ? preferences.fuel === 'electric' ? 'Elbil' : 'Vanlig bil' : preferences.mcDedicatedOnly ? 'MC-plasser' : 'Alle områder'}</Text>{filterCount > 0 && <View style={styles.filterCount}><Text style={styles.filterCountText}>{filterCount}</Text></View>}</Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{FILTERS.map(filter => {
        const active = preferences.filters.includes(filter.key);
        return <Pressable key={filter.key} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => toggleFilter(filter.key)} style={[styles.chip, active && styles.activeChip]}><Ionicons name={filter.icon} size={14} color={active ? COLORS.teal : COLORS.muted} /><Text style={[styles.chipText, active && { color: COLORS.teal }]}>{filter.title}</Text>{active && <Ionicons name="checkmark" size={12} color={COLORS.teal} />}</Pressable>;
      })}</ScrollView>
      {preferences.onlyFreeNow && <Pressable onPress={() => setPreferences({ onlyFreeNow: false })} style={styles.freeNow}><Text style={styles.freeNowText}>Bare avgiftsfritt nå</Text><Ionicons name="close" size={13} color={COLORS.teal} /></Pressable>}
    </View>

    {(!!results.length || !!searchError) && <View style={[styles.searchResults, { top: headerHeight - 95 }]}>{results.map(result => <Pressable key={result.label} style={styles.searchResult} onPress={() => chooseAddress(result)} accessibilityRole="button"><Ionicons name="location-outline" color={COLORS.teal} size={18} /><Text style={styles.searchResultText}>{result.label}</Text><Ionicons name="arrow-up-outline" size={16} color={COLORS.muted} /></Pressable>)}{!!searchError && <Text style={styles.searchError}>{searchError}</Text>}</View>}
    {(refreshing || !!locationMessage) && <View style={[styles.notice, { top: headerHeight + 12 }]}>{refreshing && <ActivityIndicator size="small" color={COLORS.teal} />}<Text style={styles.noticeText}>{refreshing ? progress : locationMessage}</Text>{!refreshing && <Pressable onPress={() => setLocationMessage('')} accessibilityLabel="Lukk melding"><Ionicons name="close" size={17} color={COLORS.muted} /></Pressable>}</View>}
    {!refreshing && progress.startsWith('Kunne') && <Pressable onPress={() => setShowSources(true)} style={[styles.notice, { top: headerHeight + 12 }]}><Ionicons name="cloud-offline-outline" size={17} color={COLORS.muted} /><Text style={styles.noticeText}>Oppdateringen feilet. Viser lagrede data.</Text></Pressable>}

    <View style={[styles.mapLabel, { bottom: nearbyHeight + 22 }]}><View style={styles.legendDot} /><Text style={styles.mapLabelText}>{filtered.length.toLocaleString('nb-NO')} registrerte steder</Text></View>
    <View style={[styles.positionControl, { bottom: nearbyHeight + 20 }]}>{locating ? <View style={styles.positionSpinner}><ActivityIndicator color={COLORS.teal} /></View> : <IconButton name="locate-outline" onPress={() => { setSearchOrigin(null); void locate(); }} label="Vis min posisjon" />}</View>
    {searchOrigin && <Pressable onPress={() => { setSearchOrigin(null); map.current?.focus(position ?? OSLO_CENTER, 0.018); }} style={[styles.clearSearch, { bottom: nearbyHeight + 75 }]}><Text style={styles.clearSearchText}>Fjern søkested</Text><Ionicons name="close" size={14} color={COLORS.ink} /></Pressable>}

    <View style={styles.nearby} onLayout={event => setNearbyHeight(event.nativeEvent.layout.height)}>
      <View style={styles.nearbyHeading}><View><Text style={styles.nearbyTitle}>Finn en plass i nærheten</Text><Text style={styles.nearbySubtitle} numberOfLines={1}>Fra {sourceLabel} · luftlinje</Text></View><Pressable accessibilityRole="button" onPress={() => setShowList(true)} style={styles.seeAll}><Text style={styles.seeAllText}>Se alle</Text><Ionicons name="arrow-forward" size={15} color={COLORS.teal} /></Pressable></View>
      {nearest.slice(0, 2).map(parking => <ParkingRow key={parking.id} parking={parking} origin={origin} onPress={() => selectParking(parking)} />)}
      {!nearest.length && <View style={styles.empty}><Text style={styles.emptyTitle}>Ingen registrerte treff</Text><Text style={styles.nearbySubtitle}>Prøv flere parkeringstyper eller nullstill filtrene.</Text><Pressable onPress={() => setPreferences({ filters: [], onlyFreeNow: false })} accessibilityRole="button"><Text style={styles.seeAllText}>Nullstill filtre</Text></Pressable></View>}
      <View style={styles.legend}>{[['#18845A', 'Gratis'], ['#088A96', 'Gratis · makstid'], ['#3479C8', 'Betaling'], ['#76858D', 'Ukjent']].map(([color, label]) => <View key={label} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>)}</View>
    </View>

    <Sheet visible={showList} onClose={() => setShowList(false)} title="Nærmeste parkering" subtitle={`${nearest.length} treff · fra ${sourceLabel} · luftlinje`} tall>
      <FlatList data={nearest.slice(0, 100)} keyExtractor={item => item.id} renderItem={({ item }) => <ParkingRow parking={item} origin={origin} onPress={() => selectParking(item)} />} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 25 }} ListEmptyComponent={<Text style={styles.searchError}>Ingen treff med valgte filtre.</Text>} ListFooterComponent={nearest.length > 100 ? <Text style={styles.nearbySubtitle}>Viser de 100 nærmeste treffene. Flytt kartet eller bruk adressøk for et annet utgangspunkt.</Text> : undefined} />
    </Sheet>
    <OptionsSheet visible={showOptions} onClose={() => setShowOptions(false)} />
    <SourcesSheet visible={showSources} onClose={() => setShowSources(false)} />
    {selected && <ParkingDetails key={selected.id} parking={selected} onClose={() => setSelectedId(null)} now={now} />}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#E7EDE7' }, header: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: '#FFFFFF', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, boxShadow: '0 5px 18px #183d3510', zIndex: 10 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 17 }, brand: { flexDirection: 'row', alignItems: 'center', gap: 8 }, logo: { width: 32, height: 35, borderRadius: 11, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center' }, logoP: { color: 'white', fontSize: 24, fontWeight: '800' }, wordmark: { color: COLORS.ink, fontSize: 28, letterSpacing: -1.5, fontWeight: '800' }, city: { marginLeft: 2, paddingVertical: 4, paddingHorizontal: 7, backgroundColor: '#EDF4EE', borderRadius: 6 }, cityText: { color: '#668471', fontSize: 9, fontWeight: '800', letterSpacing: 1 }, tools: { flexDirection: 'row', gap: 7 },
  search: { height: 48, borderRadius: 15, backgroundColor: '#F1F5F2', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 13 }, searchInput: { flex: 1, fontSize: 15, color: COLORS.ink, height: 46, outlineWidth: 0 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 }, vehicleSegment: { flexDirection: 'row', padding: 3, backgroundColor: '#F0F4F1', borderRadius: 13, flex: 1 }, vehicle: { flex: 1, flexDirection: 'row', gap: 7, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, activeVehicle: { backgroundColor: COLORS.teal }, vehicleText: { fontWeight: '700', fontSize: 13, color: COLORS.muted }, options: { height: 42, paddingHorizontal: 11, gap: 6, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: COLORS.line }, optionsText: { fontWeight: '600', color: COLORS.ink, fontSize: 11 }, filterCount: { backgroundColor: COLORS.teal, borderRadius: 9, minWidth: 17, height: 17, justifyContent: 'center', alignItems: 'center' }, filterCountText: { fontWeight: '800', fontSize: 10, color: 'white' },
  filters: { gap: 7, paddingRight: 8 }, chip: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F5F3', borderColor: '#F3F5F3', borderWidth: 1 }, activeChip: { backgroundColor: '#E4F3EB', borderColor: '#B6DACB' }, chipText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' }, freeNow: { flexDirection: 'row', gap: 6, marginTop: 9, alignItems: 'center', alignSelf: 'flex-start' }, freeNowText: { color: COLORS.teal, fontSize: 11, fontWeight: '700' },
  searchResults: { position: 'absolute', left: 20, right: 20, zIndex: 30, backgroundColor: 'white', padding: 8, borderRadius: 16, boxShadow: '0 10px 35px #142f3525' }, searchResult: { paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.line, flexDirection: 'row', gap: 9, alignItems: 'center' }, searchResultText: { fontSize: 13, flex: 1, color: COLORS.ink }, searchError: { padding: 16, color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  notice: { position: 'absolute', left: 20, right: 20, borderRadius: 13, padding: 12, backgroundColor: 'white', zIndex: 8, flexDirection: 'row', gap: 9, alignItems: 'center', boxShadow: '0 2px 12px #142f3515' }, noticeText: { fontSize: 12, lineHeight: 18, color: COLORS.muted, flex: 1 },
  nearby: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 22, paddingTop: 19, paddingBottom: 12, backgroundColor: 'white', borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: '0 -5px 18px #183d3510', zIndex: 5 }, nearbyHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }, nearbyTitle: { fontSize: 17, color: COLORS.ink, fontWeight: '800', letterSpacing: -0.4 }, nearbySubtitle: { fontSize: 11, color: COLORS.muted, marginTop: 5, maxWidth: 260, lineHeight: 17 }, seeAll: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8 }, seeAllText: { fontWeight: '700', color: COLORS.teal, fontSize: 12 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13, gap: 5 }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, legendDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: COLORS.teal }, legendText: { fontSize: 9, color: COLORS.muted }, mapLabel: { position: 'absolute', bottom: 267, left: 18, backgroundColor: '#FFFFFFEF', borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, zIndex: 4 }, mapLabelText: { fontSize: 10, color: COLORS.ink, fontWeight: '600' }, positionControl: { position: 'absolute', bottom: 265, right: 18, backgroundColor: 'white', borderRadius: 25, padding: 3, zIndex: 4, boxShadow: '0 2px 12px #142f3515' }, positionSpinner: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, clearSearch: { position: 'absolute', bottom: 316, left: 18, backgroundColor: 'white', borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10 }, clearSearchText: { color: COLORS.ink, fontSize: 11 },
  empty: { paddingVertical: 26, gap: 10 }, emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
});
