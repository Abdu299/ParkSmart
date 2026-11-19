import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, facilityLabel, markerColor, parkingIcon, PAYMENT_LABELS } from '../domain/presentation';
import { distanceLabel, distanceMeters } from '../domain/geo';
import type { Coordinate, Parking } from '../domain/types';

export function IconButton({ name, onPress, label, active = false, disabled = false }: {
  name: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; label: string; active?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
    style={({ pressed }) => [s.iconButton, active && { backgroundColor: COLORS.teal }, { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 }]}>
    <Ionicons name={name} size={21} color={active ? 'white' : COLORS.ink} />
  </Pressable>;
}

export function Sheet({ visible, onClose, children, title, subtitle, tall = false }: {
  visible: boolean; onClose: () => void; children: ReactNode; title: string; subtitle?: string; tall?: boolean;
}) {
  const inset = useSafeAreaInsets();
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
    <View style={s.modalRoot}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk dialog" />
      <View style={[s.sheet, tall && { height: '89%' }, { paddingBottom: Math.max(inset.bottom, 16) }]} accessibilityViewIsModal>
        <View style={s.handle} />
        <View style={s.sheetHeading}>
          <View style={{ flex: 1 }}><Text style={s.sheetTitle}>{title}</Text>{subtitle && <Text style={s.subtext}>{subtitle}</Text>}</View>
          <IconButton name="close" onPress={onClose} label="Lukk" />
        </View>
        {children}
      </View>
    </View>
  </Modal>;
}

export function ParkingRow({ parking, origin, onPress }: { parking: Parking; origin: Coordinate; onPress: () => void }) {
  const color = markerColor(parking);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${parking.name}, ${PAYMENT_LABELS[parking.payment]}`}
    style={({ pressed }) => [s.parkingRow, pressed && { backgroundColor: '#F0F7F3' }]}>
    <View style={[s.parkingIcon, { backgroundColor: `${color}15` }]}><MaterialCommunityIcons name={parkingIcon(parking)} size={25} color={color} /></View>
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={s.rowTitle} numberOfLines={1}>{parking.name}</Text>
      <View style={s.inline}><View style={[s.dot, { backgroundColor: color }]} /><Text style={s.rowSub} numberOfLines={1}>{parking.payment === 'unknown' && (parking.freeSpaces ?? 0) > 0 ? 'Har avgiftsfrie plasser · sjekk vilkår' : `${PAYMENT_LABELS[parking.payment]} · ${facilityLabel(parking)}`}</Text></View>
    </View>
    <View style={{ alignItems: 'flex-end', gap: 6 }}><Text style={s.distance}>{distanceLabel(distanceMeters(origin, parking))}</Text><Ionicons name="chevron-forward" size={16} color={COLORS.muted} /></View>
  </Pressable>;
}

export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return <View style={s.detailField}><Text style={s.fieldLabel}>{label}</Text>{typeof children === 'string' ? <Text style={s.fieldValue}>{children}</Text> : children}</View>;
}

export function PrimaryButton({ title, onPress, icon, disabled = false }: {
  title: string; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>['name']; disabled?: boolean;
}) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={({ pressed }) => [s.primary, { opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}>
    {icon && <Ionicons name={icon} size={19} color="white" />}<Text style={s.primaryText}>{title}</Text>
  </Pressable>;
}

export { ScrollView };

export const s = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F4F1' },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#102C3570' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', overflow: 'hidden' },
  handle: { width: 38, height: 4, borderRadius: 4, backgroundColor: '#D6E1DC', alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  sheetHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, marginBottom: 12 },
  sheetTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: COLORS.ink },
  subtext: { fontSize: 13, lineHeight: 19, color: COLORS.muted, marginTop: 5 },
  parkingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12, borderBottomColor: COLORS.line, borderBottomWidth: 1 },
  parkingIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  rowSub: { color: COLORS.muted, fontSize: 11, flexShrink: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { height: 6, width: 6, borderRadius: 4 },
  distance: { fontSize: 13, fontWeight: '700', color: COLORS.ink },
  detailField: { paddingVertical: 14, borderBottomColor: COLORS.line, borderBottomWidth: 1, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, color: COLORS.muted, textTransform: 'uppercase' },
  fieldValue: { fontSize: 15, lineHeight: 22, color: COLORS.ink },
  primary: { minHeight: 52, backgroundColor: COLORS.teal, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 18 },
  primaryText: { color: 'white', fontSize: 15, fontWeight: '700' },
});
