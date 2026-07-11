// Firebase bootstrap for the online duel mode.
//
// Loaded lazily (dynamic import) so the Firebase SDK never weighs down the
// solo/duo experience and the PWA still works fully offline outside of the
// online mode.
//
// The web config below is public by design (Firebase web API keys are
// identifiers, not secrets — access control lives in the database rules).
// Values can be overridden at build time via VITE_FIREBASE_* env vars, which
// is also how the end-to-end tests point the app at the local emulators.

import { FirebaseApp, initializeApp } from "firebase/app";
import {
  Auth,
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
} from "firebase/auth";
import {
  connectDatabaseEmulator,
  Database,
  getDatabase,
} from "firebase/database";

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "AIzaSyB0UDvuzToNSPuAXphq6YANPm8jd5chw_A",
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN ?? "four-columns-duels.firebaseapp.com",
  databaseURL:
    env.VITE_FIREBASE_DATABASE_URL ??
    "https://four-columns-duels-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "four-columns-duels",
  appId: env.VITE_FIREBASE_APP_ID ?? "1:884735371063:web:79b608acdb95b0fbd91cb2",
};

const emulatorsEnabled = (): boolean => env.VITE_FIREBASE_EMULATORS === "1";

/** True while the config still holds placeholders — online mode unusable. */
export const isFirebaseConfigured = (): boolean =>
  emulatorsEnabled() ||
  (!firebaseConfig.apiKey.startsWith("REMPLACER") &&
    !firebaseConfig.appId.startsWith("REMPLACER"));

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Database | null = null;

const init = (): { auth: Auth; db: Database } => {
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    if (emulatorsEnabled()) {
      const host = location.hostname || "localhost";
      connectAuthEmulator(auth, `http://${host}:9099`, {
        disableWarnings: true,
      });
      connectDatabaseEmulator(db, host, 9000);
    }
    if (env.DEV) {
      // Dev-only handle for the end-to-end security probes (they attempt
      // direct SDK reads/writes with a *real* player's credentials to prove
      // the database rules hold). Stripped from production builds.
      import("firebase/database").then((m) => {
        (window as unknown as { __4cfb?: unknown }).__4cfb = {
          db,
          ref: m.ref,
          get: m.get,
          set: m.set,
        };
      });
    }
  }
  return { auth: auth!, db: db! };
};

/**
 * Signs in anonymously (idempotent: Firebase persists the anonymous user in
 * IndexedDB, so the same uid survives reloads and app restarts — which is what
 * makes seamless reconnection possible without any account).
 */
export const ensureSignedIn = async (): Promise<{
  uid: string;
  db: Database;
}> => {
  const { auth, db } = init();
  if (auth.currentUser) return { uid: auth.currentUser.uid, db };
  const cred = await signInAnonymously(auth);
  return { uid: cred.user.uid, db };
};

export const getDb = (): Database => init().db;
