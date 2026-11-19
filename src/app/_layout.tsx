import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { COLORS } from '../domain/presentation';
import { ParkingProvider } from '../state/ParkingProvider';

export default function RootLayout() {
  const [loaded, error] = useFonts({ ...Ionicons.font, ...MaterialCommunityIcons.font });
  if (!loaded && !error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}><ActivityIndicator color={COLORS.teal} /></View>;
  return <SafeAreaProvider><ParkingProvider><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'white' } }} /></ParkingProvider></SafeAreaProvider>;
}
