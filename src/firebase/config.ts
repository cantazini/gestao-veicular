import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const configuration = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let appCheckInitialized = false;

function validateConfiguration() {
  const missing = Object.entries(configuration).filter(([, value]) => !value || String(value).startsWith("COLE_")).map(([key]) => key);
  if (missing.length) throw new Error(`Configuração Firebase incompleta: ${missing.join(", ")}. Consulte o README.`);
  if (configuration.projectId !== "gestaoveicular-47777") throw new Error("O VITE_FIREBASE_PROJECT_ID não corresponde ao projeto autorizado.");
}

export function firebaseApp(): FirebaseApp {
  validateConfiguration();
  const app = getApps().length ? getApp() : initializeApp(configuration);
  const siteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
  if (import.meta.env.PROD && siteKey && !appCheckInitialized) {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
    appCheckInitialized = true;
  }
  return app;
}

export const firebaseAuth = () => getAuth(firebaseApp());
export const firebaseDb = () => getFirestore(firebaseApp());
export const firebaseFunctions = () => getFunctions(firebaseApp(), "southamerica-east1");
export const firebaseStorage = () => {
  const bucket = String(configuration.storageBucket).replace(/^gs:\/\//, "");
  return getStorage(firebaseApp(), `gs://${bucket}`);
};
