import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { assessParking } from '../domain/rules';
import { COLORS, facilityLabel, markerColor, PAYMENT_LABELS, sourceDate } from '../domain/presentation';
import type { Parking } from '../domain/types';
import { nearbyAddress, refreshRegistryParking } from '../services/data';
import { SOURCES } from '../services/sources';
import { useParking } from '../state/ParkingProvider';
import { DetailField, PrimaryButton, ScrollView, Sheet, s } from './ui';

export default function ParkingDetails({ parking, onClose, now }: { parking: Parking; onClose: () => void; now: Date }) {
  const { data, preferences, setPreferences, updateParking } = useParking();
  const [address, setAddress] = useState<string | null>(null);
  const [checking, setChecking] = useState(parking.source === 'register');
  const [closed, setClosed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [checkError, setCheckError] = useState('');
  const [openingParking] = useState(parking);
  useEffect(() => {
    let alive = true;
    if (openingParking.source === 'oslo') {
      void nearbyAddress(openingParking).then(value => { if (alive) setAddress(value); }).catch(() => {});
    } else {
      void refreshRegistryParking(openingParking).then(value => {
        if (!alive) return;
        if (!value) setClosed(true); else updateParking(value);
      }).catch(() => { if (alive) setCheckError('Kunne ikke kontrollere registeret nå. Viser sist hentede opplysninger.'); })
        .finally(() => { if (alive) setChecking(false); });
    }
    return () => { alive = false; };
  }, [openingParking, updateParking]);
  const tariff = data.tariffs[String(parking.tariffId)];
  const status = assessParking(parking, tariff, now);
  const displayAddress = address ?? parking.address;
  const approximate = parking.source === 'oslo' && !!displayAddress;
  const fuel = preferences.vehicle === 'mc' ? 'regular' : preferences.fuel;
  const price = fuel === 'electric' ? tariff?.electric : tariff?.regular;
  const rows = tariff?.officialRows?.filter(row => row.label.toLowerCase().startsWith(fuel === 'electric' ? 'elbil' : 'bensin') || row.label.toLowerCase().startsWith('lørdag'));
  async function copyAddress() {
    try { await Clipboard.setStringAsync(displayAddress ?? `${parking!.latitude.toFixed(6)}, ${parking!.longitude.toFixed(6)}`); setFeedback(displayAddress ? 'Adresse kopiert' : 'Koordinater kopiert'); }
    catch { setFeedback('Kunne ikke kopiere. Prøv igjen.'); }
  }
  async function navigate() {
    try {
      const query = new URLSearchParams({ api: '1', destination: `${parking!.latitude},${parking!.longitude}`, travelmode: 'driving' });
      await Linking.openURL(`https://www.google.com/maps/dir/?${query}`);
    } catch { setFeedback('Kunne ikke åpne Google Maps. Kopier adressen eller koordinatene.'); }
  }
  const openSource = async (url: string) => { try { await Linking.openURL(url); } catch { setFeedback('Kunne ikke åpne kilden.'); } };
  return <Sheet visible onClose={onClose} title={parking.name} subtitle={facilityLabel(parking)} tall>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.badges}><View style={[styles.badge, { backgroundColor: `${markerColor(parking)}13` }]}><View style={[s.dot, { backgroundColor: markerColor(parking) }]} /><Text style={[styles.badgeText, { color: markerColor(parking) }]}>{PAYMENT_LABELS[parking.payment]}</Text></View>
        <View style={[styles.badge, { backgroundColor: '#F1F4F2' }]}><Text style={styles.neutral}>Belegg ukjent</Text></View></View>
      {closed ? <View style={styles.warning}><Text style={styles.warningTitle}>Området er deaktivert i registeret</Text><Text style={styles.body}>Velg et annet parkeringssted. Kartet oppdateres når du henter nye data.</Text></View> :
        <View style={[styles.status, status.forbidden && styles.warning]}><Text style={styles.statusTitle}>{status.label}</Text><Text style={styles.statusDetail}>{status.detail}</Text></View>}

      <DetailField label={approximate ? 'Næradresse · omtrentlig' : 'Adresse'}>{displayAddress ?? 'Ingen adresse oppgitt. Bruk koordinatene for veibeskrivelse.'}</DetailField>
      <Text style={styles.caption}>{parking.latitude.toFixed(6)}, {parking.longitude.toFixed(6)} · Markøren kan vise et område eller en strekning. Innkjørsel er ikke bekreftet.</Text>

      {tariff && <>
        <View style={styles.sectionTop}><Text style={styles.sectionTitle}>Pris og tid</Text><Text style={styles.tariff}>Takst {tariff.id}</Text></View>
        {preferences.vehicle === 'car' && parking.facility !== 'mc' && <View style={styles.fuelRow}>{(['regular', 'electric'] as const).map(fuel => <Pressable key={fuel} onPress={() => setPreferences({ fuel })} accessibilityRole="button" accessibilityState={{ selected: preferences.fuel === fuel }} style={[styles.fuelButton, preferences.fuel === fuel && styles.fuelActive]}><Text style={[styles.fuelText, preferences.fuel === fuel && { color: COLORS.teal }]}>{fuel === 'regular' ? 'Bensin / diesel / hybrid' : 'Elbil'}</Text></Pressable>)}</View>}
        {tariff.quality === 'conflict' && <View style={styles.warning}><Text style={styles.warningTitle}>Kildene er ikke samstemte</Text><Text style={styles.body}>Pris eller avgiftstid varierer mellom kartdata og kommunens prisside. Kontroller skiltet eller operatørens opplysninger før parkering.</Text></View>}
        {!!rows?.length && <View style={styles.priceGrid}>{rows.map(row => <View key={row.label} style={{ width: '100%', gap: 8 }}>
          <Text style={styles.caption}>{row.label} · kommunens prisside</Text><View style={styles.priceGrid}>{row.values.map((value, index) => <View key={index} style={styles.priceCell}><Text style={styles.priceDuration}>{tariff.officialHeader?.[index + 1] ?? ''}</Text><Text style={styles.priceValue}>{value}</Text></View>)}</View>
        </View>)}</View>}
        <DetailField label="Pris i kommunens kartdata">{price || 'Pris ikke oppgitt for dette kjøretøyet.'}</DetailField>
        <DetailField label="Avgiftstid i kartdata">{tariff.hours || 'Ikke oppgitt'}</DetailField>
        <DetailField label="Maksimal parkeringstid i kartdata">{tariff.maxStay || 'Ikke oppgitt. Kontroller skiltingen.'}</DetailField>
        {tariff.quality === 'conflict' && tariff.officialHeader?.[0] && <DetailField label="Tidsopplysninger på kommunens prisside">{tariff.officialHeader[0]}</DetailField>}
        <Pressable onPress={() => void openSource(SOURCES.officialPrices)} style={styles.sourceLink} accessibilityRole="link"><Text style={styles.sourceText}>Se kommunens priser</Text><Ionicons name="open-outline" size={15} color={COLORS.teal} /></Pressable>
      </>}
      {!tariff && parking.facility !== 'mc' && <DetailField label="Pris og makstid">Detaljerte priser og tidsregler er ikke oppgitt i datakilden. Se skiltingen eller operatørens nettside.</DetailField>}
      {parking.facility === 'mc' && <DetailField label="Makstid">Ikke oppgitt i MC-laget. Kontroller skiltingen på stedet.</DetailField>}
      {parking.nightBan && <View style={styles.warning}><Text style={styles.warningTitle}>Nattparkeringsforbud</Text><Text style={styles.body}>{parking.nightBan}</Text></View>}
      {parking.notes && <DetailField label="Merknad fra kilden">{parking.notes}</DetailField>}
      {parking.capacity !== undefined && <DetailField label="Registrert kapasitet">{`${parking.capacity} plasser registrert. Dette er ikke antall ledige plasser.`}</DetailField>}
      {(parking.hcSpaces ?? 0) > 0 && <DetailField label="HC-parkering">{`${parking.hcSpaces} HC-plasser registrert i området. HC-kort og lokale vilkår må kontrolleres. Markøren angir området.`}</DetailField>}
      {(parking.chargingSpaces ?? 0) > 0 && <DetailField label="Lading">{`${parking.chargingSpaces} ladeplasser registrert i området. Ladepris og tilgjengelighet er ikke bekreftet.`}</DetailField>}
      {parking.freeSpaces !== undefined && parking.freeSpaces > 0 && <DetailField label="Avgiftsfrie plasser i registeret">{`${parking.freeSpaces} registrert. Dette bekrefter ikke fri tilgang; kunde- eller tillatelseskrav kan gjelde.`}</DetailField>}
      <DetailField label="Operatør">{parking.operator}</DetailField>
      <DetailField label="Datakilde"><View style={{ gap: 5 }}><Text style={styles.body}>{parking.source === 'oslo' ? 'Oslo kommune · Bymiljøetaten' : 'Statens vegvesen · Parkeringsregisteret'}</Text><Text style={styles.caption}>Hentet {sourceDate(parking.fetchedAt)}</Text>{parking.sourceUpdatedAt && <Text style={styles.caption}>Endret hos kilden {sourceDate(parking.sourceUpdatedAt)}</Text>}</View></DetailField>
      {checking && <View style={styles.check}><ActivityIndicator size="small" color={COLORS.teal} /><Text style={styles.caption}>Kontrollerer registeroppføringen …</Text></View>}
      {!!checkError && <Text style={styles.caption}>{checkError}</Text>}
      <Pressable onPress={() => void openSource(parking.source === 'oslo' ? SOURCES.officialMap : parking.sourceUrl)} style={styles.sourceLink} accessibilityRole="link"><Text style={styles.sourceText}>Åpne originalkilden</Text><Ionicons name="open-outline" size={15} color={COLORS.teal} /></Pressable>
      <View style={styles.signNote}><Ionicons name="information-circle-outline" size={19} color={COLORS.muted} /><Text style={styles.caption}>Skiltingen på stedet gjelder. Kartet gir veiledende informasjon.</Text></View>
    </ScrollView>
    {!!feedback && <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
    <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => void copyAddress()} style={styles.copy}><Ionicons name="copy-outline" size={19} color={COLORS.ink} /><Text style={styles.copyText}>{displayAddress ? 'Kopier adresse' : 'Kopier posisjon'}</Text></Pressable><View style={{ flex: 1 }}><PrimaryButton title="Veibeskrivelse" icon="navigate-outline" onPress={() => void navigate()} disabled={closed || status.forbidden} /></View></View>
  </Sheet>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingBottom: 20 },
  badges: { flexDirection: 'row', gap: 8, marginBottom: 15, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontWeight: '700', fontSize: 11 }, neutral: { color: COLORS.muted, fontSize: 11 },
  status: { padding: 16, borderRadius: 17, backgroundColor: '#EAF6EF', gap: 6, marginBottom: 6 },
  statusTitle: { fontWeight: '800', fontSize: 17, color: COLORS.ink }, statusDetail: { fontSize: 13, lineHeight: 20, color: '#47645A' },
  caption: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  body: { color: COLORS.ink, fontSize: 14, lineHeight: 21 },
  sectionTop: { marginTop: 26, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: COLORS.ink }, tariff: { color: COLORS.muted, fontSize: 12 },
  fuelRow: { padding: 4, borderRadius: 12, backgroundColor: '#F1F5F2', flexDirection: 'row', marginBottom: 15 },
  fuelButton: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 9, borderRadius: 9 },
  fuelActive: { backgroundColor: 'white' }, fuelText: { fontSize: 11, color: COLORS.muted, fontWeight: '700' },
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  priceCell: { borderRadius: 12, backgroundColor: '#F3F6F4', padding: 12, minWidth: '30%', flexGrow: 1 },
  priceDuration: { fontSize: 11, color: COLORS.muted, marginBottom: 5 }, priceValue: { fontWeight: '800', color: COLORS.ink, fontSize: 16 },
  warning: { backgroundColor: '#FFF2D9', padding: 15, borderRadius: 15, gap: 6, marginVertical: 10 },
  warningTitle: { fontSize: 14, fontWeight: '800', color: '#7B520C' },
  sourceLink: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 15 },
  sourceText: { fontSize: 13, color: COLORS.teal, fontWeight: '700' },
  signNote: { flexDirection: 'row', gap: 9, paddingVertical: 15, alignItems: 'center', flex: 1 },
  check: { flexDirection: 'row', gap: 8, paddingVertical: 10 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, borderTopColor: COLORS.line, borderTopWidth: 1 },
  copy: { flex: 1, gap: 7, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 15, backgroundColor: '#F0F4F1' },
  copyText: { fontSize: 12, fontWeight: '700', color: COLORS.ink }, feedback: { fontSize: 12, textAlign: 'center', color: COLORS.teal, paddingVertical: 5 },
});
