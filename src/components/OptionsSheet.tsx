import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { COLORS, sourceDate } from '../domain/presentation';
import { useParking } from '../state/ParkingProvider';
import { SOURCES } from '../services/sources';
import { PrimaryButton, ScrollView, Sheet } from './ui';

export function OptionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { preferences: p, setPreferences } = useParking();
  return <Sheet visible={visible} onClose={onClose} title="Tilpass søket" subtitle="Finn parkering som passer turen din.">
    <ScrollView contentContainerStyle={styles.content}>
      {p.vehicle === 'car' && <><Text style={styles.label}>KJØRETØY</Text><View style={styles.segment}>{(['regular', 'electric'] as const).map(fuel => <Pressable accessibilityRole="button" accessibilityState={{ selected: p.fuel === fuel }} key={fuel} onPress={() => setPreferences({ fuel })} style={[styles.fuel, p.fuel === fuel && { backgroundColor: COLORS.teal }]}><Text style={[styles.fuelText, p.fuel === fuel && { color: 'white' }]}>{fuel === 'regular' ? 'Bensin / diesel / hybrid' : 'Elbil'}</Text></Pressable>)}</View></>}
      <View style={styles.option}><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Bare avgiftsfritt nå</Text><Text style={styles.body}>Vis steder der oppdaterte opplysninger støtter at det ikke er parkeringsavgift nå. Makstid og vilkår gjelder fortsatt.</Text></View><Switch accessibilityLabel="Bare avgiftsfritt nå" value={p.onlyFreeNow} onValueChange={value => setPreferences({ onlyFreeNow: value })} trackColor={{ true: COLORS.teal }} /></View>
      {p.vehicle === 'mc' && <View style={styles.option}><View style={{ flex: 1 }}><Text style={styles.optionTitle}>Bare dedikerte MC-plasser</Text><Text style={styles.body}>Slår du av dette, vises også ordinære områder. Der må MC-tilgang og betaling kontrolleres.</Text></View><Switch accessibilityLabel="Bare dedikerte MC-plasser" value={p.mcDedicatedOnly} onValueChange={value => setPreferences({ mcDedicatedOnly: value })} trackColor={{ true: COLORS.teal }} /></View>}
      <Text style={styles.body}>Flere typeknapper viser treff som passer minst én valgt type. Kjøretøyvalget og «avgiftsfritt nå» gjelder i tillegg.</Text>
      <Text style={styles.body}>«Gratis» inkluderer områder med registrerte avgiftsfrie plasser. Tilgangsvilkår kan være ukjente; slike områder har grå markører.</Text>
      <Pressable onPress={() => setPreferences({ filters: [], onlyFreeNow: false, mcDedicatedOnly: true })} accessibilityRole="button" style={styles.reset}><Text style={{ color: COLORS.teal, fontWeight: '700' }}>Nullstill filtre</Text></Pressable>
      <PrimaryButton title="Vis parkering" onPress={onClose} />
    </ScrollView>
  </Sheet>;
}

export function SourcesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, refresh, refreshing, progress } = useParking();
  return <Sheet visible={visible} onClose={onClose} title="Om parkeringsdataene" subtitle={`Hentet ${sourceDate(data.fetchedAt)}`} tall>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.dataCard}><Text style={styles.dataNumber}>{data.locations.length.toLocaleString('nb-NO')}</Text><Text style={styles.body}>registrerte steder og strekninger</Text><View style={styles.dataCounts}><Text style={styles.body}>{data.locations.filter(p => p.facility === 'mc').length} MC-steder</Text><Text style={styles.body}>{data.locations.filter(p => p.facility === 'garage').length} parkeringshus</Text></View></View>
      <Text style={styles.optionTitle}>Kilder</Text>
      {[['Oslo kommune · parkeringskart', SOURCES.officialMap], ['Oslo kommune · priser', SOURCES.officialPrices], ['Statens vegvesen · Parkeringsregisteret', 'https://www.vegvesen.no/fag/teknologi/apne-data/et-utvalg-apne-data/parkeringsregisteret-api/'], ['Kartverket · adresser og kommunegrense', 'https://ws.geonorge.no/adresser/v1/']].map(([label, url]) => <Pressable accessibilityRole="link" key={label} style={styles.source} onPress={() => void Linking.openURL(url).catch(() => {})}><Text style={styles.sourceLabel}>{label}</Text><Ionicons name="open-outline" size={16} color={COLORS.teal} /></Pressable>)}
      <Text style={[styles.optionTitle, { marginTop: 18 }]}>Hva kartet forteller</Text>
      <Text style={styles.body}>Kartet viser registrerte parkeringsområder. Fargene beskriver betalingstype. Tall på samlemarkører teller oppføringer, og sier ingenting om hvor mange plasser som er ledige.</Text>
      {data.warnings.map(warning => <View key={warning} style={styles.note}><Ionicons name="information-circle-outline" size={18} color={COLORS.muted} /><Text style={[styles.body, { flex: 1 }]}>{warning}</Text></View>)}
      <Text style={styles.body}>Næradresser for kommunale punkter er omtrentlige. Veibeskrivelse bruker koordinatene. Pris og tidsregler må alltid kontrolleres mot skiltingen på stedet.</Text>
      <Text style={[styles.optionTitle, { marginTop: 18 }]}>Posisjonen din</Text><Text style={styles.body}>Appen ber bare om posisjon mens den brukes. Den lagrer ingen posisjonshistorikk. Kartleverandøren, Kartverket og en kartapp du åpner kan behandle forespørsler som inneholder koordinater.</Text>
      {!!progress && <Text style={styles.body} accessibilityLiveRegion="polite">{progress}</Text>}
      <View style={{ marginTop: 18 }}><PrimaryButton title={refreshing ? 'Henter nye data …' : 'Oppdater parkeringsdata'} icon="refresh" disabled={refreshing} onPress={() => void refresh()} /></View>
    </ScrollView>
  </Sheet>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingBottom: 24, gap: 12 }, label: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1, marginTop: 10 },
  segment: { flexDirection: 'row', gap: 5, padding: 4, backgroundColor: '#F1F5F2', borderRadius: 14 }, fuel: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 11 }, fuelText: { fontSize: 11, color: COLORS.ink, fontWeight: '700' },
  option: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: COLORS.line }, optionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 5 }, body: { fontSize: 13, color: COLORS.muted, lineHeight: 20 },
  reset: { alignItems: 'center', padding: 14 }, dataCard: { backgroundColor: '#EAF6EF', padding: 21, borderRadius: 20, marginBottom: 10 }, dataNumber: { fontSize: 36, color: COLORS.ink, fontWeight: '800', letterSpacing: -1.5 }, dataCounts: { flexDirection: 'row', gap: 20, marginTop: 14 },
  source: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: COLORS.line, gap: 8 }, sourceLabel: { color: COLORS.teal, fontWeight: '600', fontSize: 13, flex: 1 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 },
});
