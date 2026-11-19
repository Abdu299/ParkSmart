import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Dataset, Parking, Preferences } from '../domain/types';
import { refreshDataset } from '../services/data';
import { decodeCache, encodeCache } from '../services/cacheCodec';

const snapshot = require('../data/parking-oslo.json') as Dataset;
const DEFAULTS: Preferences = { vehicle: 'car', fuel: 'regular', filters: [], onlyFreeNow: false, mcDedicatedOnly: true };
const META_KEY = '@parker/data/v1/meta';
const PREF_KEY = '@parker/preferences/v1';
const CHUNK = 250000;

async function saveData(data: Dataset) {
  const old = await AsyncStorage.getItem(META_KEY);
  const prefix = `@parker/data/v1/${Date.now()}`;
  const encoded = encodeCache(data);
  const keys: string[] = [];
  const entries: [string, string][] = [];
  for (let offset = 0; offset < encoded.length; offset += CHUNK) {
    const key = `${prefix}/${offset}`; keys.push(key);
    entries.push([key, encoded.slice(offset, offset + CHUNK)]);
  }
  try {
    await AsyncStorage.multiSet(entries);
    await AsyncStorage.setItem(META_KEY, JSON.stringify({ keys, codec: 'gzip-base64-v1' }));
  } catch (error) { await AsyncStorage.multiRemove(keys).catch(() => {}); throw error; }
  if (old) {
    try { const previous = JSON.parse(old); await AsyncStorage.multiRemove(previous.keys); } catch { /* New cache is already committed. */ }
  }
}

async function loadData(): Promise<Dataset | null> {
  const meta = await AsyncStorage.getItem(META_KEY); if (!meta) return null;
  const parsed = JSON.parse(meta);
  if (parsed.codec !== 'gzip-base64-v1' || !Array.isArray(parsed.keys) || parsed.keys.length > 48) return null;
  const values = await AsyncStorage.multiGet(parsed.keys);
  let encoded = '';
  for (const [, value] of values) {
    if (!value) return null;
    encoded += value;
  }
  return decodeCache(encoded);
}

interface State {
  data: Dataset;
  preferences: Preferences;
  setPreferences: (update: Partial<Preferences>) => void;
  refreshing: boolean;
  progress: string;
  refresh: () => Promise<void>;
  updateParking: (parking: Parking) => void;
}
const ParkingContext = createContext<State | null>(null);

export function ParkingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState(snapshot);
  const [preferences, setPrefs] = useState(DEFAULTS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState('');
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    void loadData().then(cached => {
      if (alive.current && cached && new Date(cached.fetchedAt) > new Date(snapshot.fetchedAt)) setData(cached);
    }).catch(() => {});
    void AsyncStorage.getItem(PREF_KEY).then(text => {
      if (!alive.current) return;
      if (text) {
        const p = JSON.parse(text) as Preferences;
        if (['car', 'mc'].includes(p.vehicle) && ['regular', 'electric'].includes(p.fuel) && Array.isArray(p.filters)) {
          setPrefs({ ...DEFAULTS, ...p, filters: p.filters.filter(f => ['free', 'paid', 'garage', 'charging', 'hc'].includes(f)) });
        }
      }
    }).catch(() => {}).finally(() => { if (alive.current) setPrefsReady(true); });
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { if (prefsReady) void AsyncStorage.setItem(PREF_KEY, JSON.stringify(preferences)).catch(() => {}); }, [preferences, prefsReady]);
  const setPreferences = useCallback((update: Partial<Preferences>) => setPrefs(p => ({ ...p, ...update })), []);
  const updateParking = useCallback((parking: Parking) => setData(d => ({ ...d, locations: d.locations.map(p => p.id === parking.id ? parking : p) })), []);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setRefreshing(true);
    try {
      const next = await refreshDataset(data, text => { if (alive.current) setProgress(text); });
      if (!alive.current) return;
      setData(next);
      try { await saveData(next); setProgress('Parkeringsdata er oppdatert.'); }
      catch { setProgress('Data er oppdatert i denne økten, men kunne ikke lagres på telefonen.'); }
    } catch (error) {
      if (alive.current) setProgress(`Kunne ikke oppdatere. Viser lagret uttrekk. ${error instanceof Error ? error.message : ''}`);
    } finally { busy.current = false; if (alive.current) setRefreshing(false); }
  }, [data]);
  return <ParkingContext.Provider value={{ data, preferences, setPreferences, refreshing, progress, refresh, updateParking }}>{children}</ParkingContext.Provider>;
}

export function useParking() {
  const value = useContext(ParkingContext);
  if (!value) throw new Error('ParkingProvider mangler.');
  return value;
}
