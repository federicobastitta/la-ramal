import type { FirebaseOptions } from "firebase/app";

/** Lee la configuración de Firebase de las variables VITE_FIREBASE_*. Sin ellas: modo demo. */
export function configFirebaseDelEntorno(): FirebaseOptions | null {
  const e = import.meta.env;
  if (!e.VITE_FIREBASE_API_KEY || !e.VITE_FIREBASE_PROJECT_ID) return null;
  return {
    apiKey: e.VITE_FIREBASE_API_KEY,
    authDomain: e.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: e.VITE_FIREBASE_PROJECT_ID,
    storageBucket: e.VITE_FIREBASE_STORAGE_BUCKET,
    appId: e.VITE_FIREBASE_APP_ID,
    messagingSenderId: e.VITE_FIREBASE_MESSAGING_SENDER_ID,
  };
}
