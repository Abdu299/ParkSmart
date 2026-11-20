import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApp, getApps, initializeApp } from 'firebase/app';
// Firebase 13 exposes this from its React Native entrypoint. Its generic
// TypeScript entrypoint does not list it, while Metro correctly selects the
// React Native implementation at runtime.
// @ts-expect-error React Native-only Firebase Auth export.
import { getReactNativePersistence } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim(),
};

export const firebaseConfigured = Object.values(config).every(Boolean);

let authInstance: Auth | null = null;
if (firebaseConfigured) {
  const app = getApps().length ? getApp() : initializeApp(config);
  if (Platform.OS === 'web') {
    authInstance = getAuth(app);
  } else {
    try {
      authInstance = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // Fast Refresh can initialize Auth before this module is evaluated again.
      authInstance = getAuth(app);
    }
  }
}

function requireAuth(): Auth {
  if (!authInstance) throw new Error('Firebase er ikke konfigurert ennå.');
  return authInstance;
}

export function observeAuth(callback: (user: User | null) => void) {
  if (!authInstance) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(authInstance, callback);
}

export async function loginWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(requireAuth(), email, password);
}

export async function registerWithEmail(email: string, password: string) {
  return createUserWithEmailAndPassword(requireAuth(), email, password);
}

export async function logoutUser() {
  return signOut(requireAuth());
}

export async function resetPassword(email: string) {
  return sendPasswordResetEmail(requireAuth(), email);
}

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-email': 'Skriv inn en gyldig e-postadresse.',
    'auth/invalid-credential': 'Feil e-post eller passord.',
    'auth/user-disabled': 'Denne kontoen er deaktivert.',
    'auth/email-already-in-use': 'Det finnes allerede en konto med denne e-posten.',
    'auth/weak-password': 'Passordet oppfyller ikke sikkerhetskravene.',
    'auth/too-many-requests': 'For mange forsøk. Vent litt og prøv igjen.',
    'auth/network-request-failed': 'Kunne ikke koble til. Kontroller internettforbindelsen.',
    'auth/operation-not-allowed': 'E-postinnlogging er ikke aktivert i Firebase ennå.',
  };
  return messages[code] || (error instanceof Error ? error.message : 'Noe gikk galt. Prøv igjen.');
}
