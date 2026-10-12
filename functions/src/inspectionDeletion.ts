import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";
import type { AppUser } from "./auth.js";
import { auditEntry } from "./audit.js";
import { firestore, serverTimestamp } from "./firebase.js";
import { effectiveInspectionSequences, inspectionSequenceKey, legacyFreeze, persistedSequence } from "./inspectionSequence.js";

type InspectionDeletionCandidate = Record<string, unknown>;

/**
 * A exclusão de vistoria é definitiva. Somente Administrador ativo pode executá-la.
 * Credenciais, aprovações ou fotos vinculadas NÃO bloqueiam: são removidas junto com a vistoria.
 */
export function assertInspectionCanBeDeleted(actor: AppUser, inspection: InspectionDeletionCandidate | null) {
  if (actor.active !== true || actor.role !== "admin") {
    throw new HttpsError("permission-denied", "Você não possui permissão para excluir vistorias.");
  }
  if (!inspection) throw new HttpsError("not-found", "Vistoria não encontrada.");
}

export interface PurgeDependencies {
  /** Remove do Storage todos os objetos com o prefixo informado. */
  removeStorageFiles: (prefix: string) => Promise<void>;
}

export interface PurgeResult {
  id: string;
  code: string;
  purged: true;
  removedPhotos: number;
  removedApprovals: number;
  removedCredentials: number;
  /** Arquivos que o servidor não conseguiu remover; o cliente tenta removê-los com a sessão do usuário. */
  pendingStoragePaths: string[];
}

const text = (value: unknown) => typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);

export function inspectionStoragePrefix(inspectionId: string) {
  return `inspections/${inspectionId}/`;
}

export async function purgeInspection(inspectionId: string, actor: AppUser, dependencies: PurgeDependencies): Promise<PurgeResult> {
  const inspections = firestore.collection("inspections");
  const reference = inspections.doc(inspectionId);
  const outcome = await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    assertInspectionCanBeDeleted(actor, current.exists ? current.data() ?? {} : null);
    const data = current.data() ?? {};
    const vehicleId = text(data.vehicleId);
    const [photos, approvals, credentials, vehicleInspections] = await Promise.all([
      transaction.get(reference.collection("photos")),
      transaction.get(firestore.collection("credentialApprovals").where("inspectionId", "==", inspectionId)),
      transaction.get(firestore.collection("credentials").where("inspectionId", "==", inspectionId)),
      vehicleId ? transaction.get(inspections.where("vehicleId", "==", vehicleId)) : Promise.resolve(null)
    ]);

    // As demais vistorias legadas do veículo têm a sequência congelada antes da remoção,
    // para que a exclusão não renumere o histórico.
    const candidates = (vehicleInspections?.docs ?? []).map((item) => ({ id: item.id, ...item.data() }));
    const effective = effectiveInspectionSequences(candidates);
    const freeze = vehicleId ? legacyFreeze(candidates, effective, inspectionId) : [];
    const ownSequence = persistedSequence(data.sequence);
    const ownKeyReference = vehicleId && ownSequence !== null ? firestore.collection("uniqueKeys").doc(inspectionSequenceKey(vehicleId, ownSequence)) : null;
    const freezeKeyReferences = freeze.map((item) => firestore.collection("uniqueKeys").doc(inspectionSequenceKey(vehicleId, item.sequence)));
    const keySnapshots = await Promise.all([ownKeyReference, ...freezeKeyReferences].map((key) => key ? transaction.get(key) : Promise.resolve(null)));
    const [ownKey, ...freezeKeys] = keySnapshots;

    const credentialCodes = credentials.docs.map((item) => text(item.data().code)).filter(Boolean);
    const photoPaths = photos.docs.map((item) => text(item.data().storagePath)).filter(Boolean);
    const snapshot = (data.snapshot ?? {}) as Record<string, Record<string, unknown> | undefined>;

    photos.docs.forEach((item) => transaction.delete(item.ref));
    approvals.docs.forEach((item) => transaction.delete(item.ref));
    credentials.docs.forEach((item) => transaction.delete(item.ref));
    if (ownKeyReference && ownKey?.exists && ownKey.data()?.ownerId === inspectionId) transaction.delete(ownKeyReference);
    freeze.forEach((item, index) => {
      transaction.set(inspections.doc(item.id), { sequence: item.sequence }, { merge: true });
      const key = freezeKeys[index];
      if (!key?.exists) transaction.set(freezeKeyReferences[index], { ownerCollection: "inspections", ownerId: item.id, updatedAt: serverTimestamp() });
    });
    transaction.delete(reference);
    // Registro mínimo da operação destrutiva: identificação anterior à exclusão.
    transaction.set(firestore.collection("auditLogs").doc(), auditEntry(actor, "inspection.purged", "inspections", inspectionId, {
      inspectionId,
      code: text(data.code),
      vehicleId,
      plate: text(snapshot.vehicle?.plate),
      companyId: text(data.companyId),
      companyName: text(snapshot.company?.tradeName || snapshot.company?.legalName),
      projectId: text(data.projectId),
      driverId: text(data.driverId),
      inspectionDate: text(data.inspectionDate),
      result: text(data.result),
      sequence: ownSequence ?? effective.get(inspectionId) ?? null,
      previouslySoftDeleted: data.deleted === true,
      removedPhotos: photos.size,
      removedApprovals: approvals.size,
      removedCredentials: credentials.size,
      removedCredentialCodes: credentialCodes
    }));
    return { code: text(data.code), photoPaths, removedPhotos: photos.size, removedApprovals: approvals.size, removedCredentials: credentials.size };
  });

  let pendingStoragePaths: string[] = [];
  try {
    await dependencies.removeStorageFiles(inspectionStoragePrefix(inspectionId));
  } catch (error) {
    // A vistoria já foi removida. A falha de limpeza do Storage não desfaz a exclusão.
    pendingStoragePaths = outcome.photoPaths;
    logger.warn("inspection.purge.storage_cleanup_failed", { inspectionId, pending: pendingStoragePaths.length, error: error instanceof Error ? error.message : String(error) });
  }
  return {
    id: inspectionId, code: outcome.code, purged: true,
    removedPhotos: outcome.removedPhotos, removedApprovals: outcome.removedApprovals, removedCredentials: outcome.removedCredentials,
    pendingStoragePaths
  };
}
