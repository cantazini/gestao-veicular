import { browserLocalPersistence, onAuthStateChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import type { User } from "../types";
import { firebaseAuth, firebaseDb } from "./config";

export function authErrorCode(reason: unknown) {
  return typeof reason === "object" && reason && "code" in reason ? String((reason as { code: unknown }).code) : "";
}

export function observeFirebaseSession(onSession: (user: User | null) => void, onError: (reason: unknown) => void) {
  const auth = firebaseAuth();
  void setPersistence(auth, browserLocalPersistence);
  return onAuthStateChanged(auth, async (authenticated) => {
    try {
      if (!authenticated) { onSession(null); return; }
      const profile = await getDoc(doc(firebaseDb(), "users", authenticated.uid));
      const data = profile.data();
      if (!profile.exists() || data?.active !== true || !["admin", "inspector"].includes(data.role)) {
        await signOut(auth);
        throw new Error("Seu usuário não possui acesso ativo. Procure um administrador.");
      }
      onSession({ id: authenticated.uid, name: String(data.name || authenticated.displayName || "Usuário"), email: String(data.email || authenticated.email || ""), role: data.role, companyId: data.companyId || null });
    } catch (reason) { onError(reason); }
  }, onError);
}

export async function signInFirebase(email: string, password: string) {
  const auth = firebaseAuth();
  await setPersistence(auth, browserLocalPersistence);
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export const signOutFirebase = () => signOut(firebaseAuth());
export const resetFirebasePassword = (email: string) => sendPasswordResetEmail(firebaseAuth(), email.trim());
