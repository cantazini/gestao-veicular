import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { firestore } from "./firebase.js";

export type AppRole = "admin" | "inspector";
export interface AppUser { id: string; name: string; email: string; role: AppRole; active: boolean }

export async function requireActiveUser(request: CallableRequest<unknown>): Promise<AppUser> {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Faça login para continuar.");
  const snapshot = await firestore.collection("users").doc(request.auth.uid).get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "Usuário sem perfil de acesso.");
  const data = snapshot.data()!;
  if (data.active !== true || !["admin", "inspector"].includes(data.role)) {
    throw new HttpsError("permission-denied", "Usuário inativo ou sem permissão.");
  }
  return { id: snapshot.id, name: String(data.name || request.auth.token.name || "Usuário"), email: String(data.email || request.auth.token.email || ""), role: data.role as AppRole, active: true };
}

export async function requireAdmin(request: CallableRequest<unknown>): Promise<AppUser> {
  const user = await requireActiveUser(request);
  if (user.role !== "admin") throw new HttpsError("permission-denied", "Esta operação exige perfil Administrador.");
  return user;
}
