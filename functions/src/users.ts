import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireAdmin } from "./auth.js";
import { auditEntry } from "./audit.js";
import { adminAuth, firestore, serverTimestamp } from "./firebase.js";
import { optionalFirestoreId } from "./validation.js";

const userInput = z.object({ email: z.email(), name: z.string().trim().min(2).max(160), role: z.enum(["admin", "inspector"]), companyId: optionalFirestoreId, active: z.boolean().default(true) });
const requestSchema = z.object({ id: optionalFirestoreId, input: userInput.partial() });

export const manageUser = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireAdmin(request);
  const parsed = requestSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Revise os dados do usuário.", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
  if (parsed.data.id) {
    const reference = firestore.collection("users").doc(parsed.data.id);
    const current = await reference.get();
    if (!current.exists) throw new HttpsError("not-found", "Usuário não encontrado.");
    const full = userInput.safeParse({ ...current.data(), ...parsed.data.input });
    if (!full.success) throw new HttpsError("invalid-argument", "Revise os dados do usuário.", { fieldErrors: z.flattenError(full.error).fieldErrors });
    if (parsed.data.id === actor.id && !full.data.active) throw new HttpsError("failed-precondition", "Você não pode desativar o próprio acesso.");
    await adminAuth.updateUser(parsed.data.id, { email: full.data.email, displayName: full.data.name, disabled: !full.data.active });
    await reference.set({ ...full.data, updatedAt: serverTimestamp(), updatedBy: actor.id }, { merge: true });
    await firestore.collection("auditLogs").add(auditEntry(actor, "user.updated", "users", parsed.data.id));
    return { id: parsed.data.id, ...full.data };
  }
  const full = userInput.safeParse(parsed.data.input);
  if (!full.success) throw new HttpsError("invalid-argument", "Revise os dados do usuário.", { fieldErrors: z.flattenError(full.error).fieldErrors });
  const authUser = await adminAuth.createUser({ email: full.data.email, displayName: full.data.name, disabled: !full.data.active });
  try {
    await firestore.collection("users").doc(authUser.uid).set({ ...full.data, createdAt: serverTimestamp(), createdBy: actor.id, updatedAt: serverTimestamp(), updatedBy: actor.id });
  } catch (error) {
    await adminAuth.deleteUser(authUser.uid).catch(() => undefined);
    throw error;
  }
  await firestore.collection("auditLogs").add(auditEntry(actor, "user.created", "users", authUser.uid));
  return { id: authUser.uid, ...full.data };
});
