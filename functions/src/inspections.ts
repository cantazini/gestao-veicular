import type { DocumentData } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireActiveUser, requireAdmin } from "./auth.js";
import { auditEntry } from "./audit.js";
import { CHECKLIST_KEYS } from "./checklist.js";
import { isLinkedToCompany } from "./companyLinks.js";
import { firestore, serverTimestamp } from "./firebase.js";
import { dateOnly, firestoreId, timeOnly } from "./validation.js";
import { logOperation } from "./observability.js";
import { purgeInspection } from "./inspectionDeletion.js";
import { effectiveInspectionSequences, inspectionSequenceKey, legacyFreeze, MAX_INSPECTION_SEQUENCE, persistedSequence, planInspectionSequence } from "./inspectionSequence.js";
import { removeAppStorageFiles } from "./storage.js";

const itemSchema = z.object({
  key: z.string().min(1).max(80), categoryKey: z.string().min(1).max(80), categoryLabel: z.string().min(1).max(100), label: z.string().min(1).max(200),
  status: z.enum(["conforme", "nao_conforme", "nao_se_aplica"]), observation: z.string().trim().max(500).optional().default("")
}).superRefine((item, context) => {
  if (item.status === "nao_conforme" && !item.observation) context.addIssue({ code: "custom", path: ["observation"], message: "Descreva a não conformidade." });
});

const optionalSequence = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? undefined : value,
  z.coerce.number().int("A sequência deve ser um número inteiro.").min(1, "A sequência deve ser maior que zero.").max(MAX_INSPECTION_SEQUENCE, `A sequência deve ser no máximo ${MAX_INSPECTION_SEQUENCE}.`).optional()
);

export const inspectionInputSchema = z.object({
  companyId: firestoreId, vehicleId: firestoreId, driverId: firestoreId, projectId: firestoreId,
  inspectionDate: dateOnly, inspectionTime: timeOnly, mileage: z.coerce.number().int().nonnegative(),
  sequence: optionalSequence,
  generalObservations: z.string().trim().max(4000).optional().default(""), items: z.array(itemSchema)
}).superRefine((value, context) => {
  const keys = value.items.map((item) => item.key);
  if (keys.length !== CHECKLIST_KEYS.length || new Set(keys).size !== CHECKLIST_KEYS.length || CHECKLIST_KEYS.some((key) => !keys.includes(key))) {
    context.addIssue({ code: "custom", path: ["items"], message: "O checklist deve conter todos os 39 itens oficiais, sem duplicidade." });
  }
});

export function calculateInspection(items: z.infer<typeof itemSchema>[], threshold: number) {
  const applicable = items.filter((item) => item.status !== "nao_se_aplica");
  const compliant = items.filter((item) => item.status === "conforme").length;
  const nonCompliant = items.filter((item) => item.status === "nao_conforme").length;
  const compliancePercentage = applicable.length ? Number(((compliant / applicable.length) * 100).toFixed(1)) : 0;
  return { compliant, nonCompliant, notApplicable: items.length - applicable.length, compliancePercentage, result: compliancePercentage >= threshold ? "APROVADO" as const : "REPROVADO" as const };
}

function parseInput(input: unknown) {
  const parsed = inspectionInputSchema.safeParse(input);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Revise os dados da vistoria.", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
  return parsed.data;
}

/** Campos de criação/conclusão preservados na edição (a edição não altera a posição cronológica da vistoria). */
function preservedCreation(previous: DocumentData | undefined, stamp: unknown, actorId: string) {
  if (!previous) return { createdAt: stamp, createdBy: actorId, completedAt: stamp, completedBy: actorId };
  const preserved: Record<string, unknown> = {};
  for (const field of ["createdAt", "createdBy"]) if (previous[field] !== undefined) preserved[field] = previous[field];
  preserved.completedAt = previous.completedAt ?? stamp;
  preserved.completedBy = previous.completedBy ?? actorId;
  return preserved;
}

export async function saveInspection(input: unknown, inspectionId: string | undefined, actor: Awaited<ReturnType<typeof requireActiveUser>>) {
  const data = parseInput(input);
  const inspections = firestore.collection("inspections");
  const reference = inspectionId ? inspections.doc(inspectionId) : inspections.doc();
  return firestore.runTransaction(async (transaction) => {
    const [company, project, vehicle, driver, settings, current] = await Promise.all([
      transaction.get(firestore.collection("companies").doc(data.companyId)),
      transaction.get(firestore.collection("projects").doc(data.projectId)),
      transaction.get(firestore.collection("vehicles").doc(data.vehicleId)),
      transaction.get(firestore.collection("drivers").doc(data.driverId)),
      transaction.get(firestore.collection("systemSettings").doc("default")),
      transaction.get(reference)
    ]);
    if (inspectionId && !current.exists) throw new HttpsError("not-found", "Vistoria não encontrada.");
    if (inspectionId && current.data()?.deleted === true) throw new HttpsError("failed-precondition", "Vistoria excluída não pode ser alterada.");
    if (![company, project, vehicle, driver].every((snapshot) => snapshot.exists && snapshot.data()?.active === true)) throw new HttpsError("failed-precondition", "Empresa, projeto, veículo e motorista devem estar ativos.");
    if (!isLinkedToCompany(vehicle.data(), data.companyId) || vehicle.data()?.projectId !== data.projectId || !isLinkedToCompany(driver.data(), data.companyId)) throw new HttpsError("failed-precondition", "Os vínculos operacionais informados não são compatíveis.");
    if (!(company.data()?.projectIds || []).includes(data.projectId)) throw new HttpsError("failed-precondition", "O projeto não está autorizado para a empresa selecionada.");
    if (!Array.isArray(vehicle.data()?.driverIds) || !vehicle.data()!.driverIds.includes(data.driverId)) throw new HttpsError("failed-precondition", "O motorista não está autorizado para este veículo.");
    if (data.mileage < Number(vehicle.data()?.mileage || 0) && !inspectionId) throw new HttpsError("failed-precondition", "A quilometragem não pode ser menor que o último registro do veículo.");

    const previous = current.exists ? current.data() : undefined;
    const previousVehicleId = previous ? String(previous.vehicleId || "") : "";
    const vehicleChanged = Boolean(previous) && previousVehicleId !== data.vehicleId;
    const [client, accessProfile, approvals, vehicleInspections, previousVehicleInspections] = await Promise.all([
      transaction.get(firestore.collection("clients").doc(String(company.data()?.clientId))),
      transaction.get(firestore.collection("accessProfiles").doc(String(vehicle.data()?.accessProfileId))),
      inspectionId ? transaction.get(firestore.collection("credentialApprovals").where("inspectionId", "==", inspectionId).where("status", "==", "approved")) : Promise.resolve(null),
      transaction.get(inspections.where("vehicleId", "==", data.vehicleId)),
      vehicleChanged && previousVehicleId ? transaction.get(inspections.where("vehicleId", "==", previousVehicleId)) : Promise.resolve(null)
    ]);

    // Sequência por veículo: sugerida automaticamente (maior + 1) ou informada manualmente, sem duplicidade no mesmo veículo.
    const candidates = vehicleInspections.docs.map((item) => ({ id: item.id, ...item.data() }));
    const plan = planInspectionSequence(candidates, reference.id, data.sequence);
    const previousCandidates = (previousVehicleInspections?.docs ?? []).map((item) => ({ id: item.id, ...item.data() }));
    const previousFreeze = previousVehicleInspections ? legacyFreeze(previousCandidates, effectiveInspectionSequences(previousCandidates), reference.id) : [];
    const previousSequence = persistedSequence(previous?.sequence);
    const releaseOldKey = previousSequence !== null && previousVehicleId && (vehicleChanged || previousSequence !== plan.sequence);
    const uniqueKeys = firestore.collection("uniqueKeys");
    const targetKeyReference = uniqueKeys.doc(inspectionSequenceKey(data.vehicleId, plan.sequence));
    const oldKeyReference = releaseOldKey ? uniqueKeys.doc(inspectionSequenceKey(previousVehicleId, previousSequence!)) : null;
    const freezeItems = [
      ...plan.freeze.map((item) => ({ ...item, key: uniqueKeys.doc(inspectionSequenceKey(data.vehicleId, item.sequence)) })),
      ...previousFreeze.map((item) => ({ ...item, key: uniqueKeys.doc(inspectionSequenceKey(previousVehicleId, item.sequence)) }))
    ];
    const [targetKey, oldKey, ...freezeKeys] = await Promise.all([
      transaction.get(targetKeyReference),
      oldKeyReference ? transaction.get(oldKeyReference) : Promise.resolve(null),
      ...freezeItems.map((item) => transaction.get(item.key))
    ]);
    if (targetKey.exists && targetKey.data()?.ownerId !== reference.id) throw new HttpsError("already-exists", `Já existe a ${plan.sequence}ª vistoria para este veículo. Informe outra sequência.`);

    const threshold = Number(settings.data()?.minimumInspectionCompliance ?? 90);
    const calculation = calculateInspection(data.items, threshold);
    let code = String(previous?.code || "");
    const counterReference = firestore.collection("systemSettings").doc("inspectionSequence");
    const counter = inspectionId ? null : await transaction.get(counterReference);

    // A partir daqui somente gravações.
    const stamp = serverTimestamp();
    if (!inspectionId) {
      const globalSequence = Number(counter?.data()?.value || 0) + 1;
      code = `VST-${String(globalSequence).padStart(6, "0")}`;
      transaction.set(counterReference, { value: globalSequence, updatedAt: stamp }, { merge: true });
    }
    const snapshot = {
      client: { id: client.id, ...(client.data() || {}) }, company: { id: company.id, ...company.data() }, project: { id: project.id, ...project.data() },
      vehicle: { id: vehicle.id, ...vehicle.data() }, driver: { id: driver.id, ...driver.data() }, accessProfile: { id: accessProfile.id, ...(accessProfile.data() || {}) },
      inspector: { id: actor.id, name: actor.name, email: actor.email }
    };
    const { sequence: _requestedSequence, ...fields } = data;
    const persisted = {
      ...fields, ...calculation, code, sequence: plan.sequence, status: "completed", snapshot, inspectorId: actor.id, inspectorName: actor.name, inspectorEmail: actor.email,
      ...preservedCreation(previous, stamp, actor.id), updatedAt: stamp, updatedBy: actor.id
    };
    transaction.set(reference, persisted);
    transaction.set(targetKeyReference, { ownerCollection: "inspections", ownerId: reference.id, updatedAt: stamp });
    if (oldKeyReference && oldKey?.exists && oldKey.data()?.ownerId === reference.id) transaction.delete(oldKeyReference);
    freezeItems.forEach((item, index) => {
      transaction.set(inspections.doc(item.id), { sequence: item.sequence }, { merge: true });
      if (!freezeKeys[index]?.exists) transaction.set(item.key, { ownerCollection: "inspections", ownerId: item.id, updatedAt: stamp });
    });
    transaction.set(vehicle.ref, { mileage: Math.max(Number(vehicle.data()?.mileage || 0), data.mileage), updatedAt: stamp, updatedBy: actor.id }, { merge: true });
    approvals?.forEach((approval) => transaction.update(approval.ref, { status: "invalidated", invalidatedReason: "inspection_updated", updatedAt: stamp, updatedBy: actor.id }));
    transaction.set(firestore.collection("auditLogs").doc(), auditEntry(actor, inspectionId ? "inspection.updated" : "inspection.completed", "inspections", reference.id, { result: calculation.result, sequence: plan.sequence, ...(previousSequence !== null && previousSequence !== plan.sequence ? { previousSequence } : {}) }));
    return { id: reference.id, code, sequence: plan.sequence, inspectionDate: data.inspectionDate, inspectionTime: data.inspectionTime, mileage: data.mileage, ...calculation, status: "completed", inspectorName: actor.name, updatedAt: new Date().toISOString() };
  });
}

export const completeInspection = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireActiveUser(request); const saved = await saveInspection(request.data, undefined, actor);
  logOperation("inspection.completed", { inspectionId: saved.id, actorUid: actor.id, result: saved.result, sequence: saved.sequence }); return saved;
});

export const updateInspection = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const parsed = z.object({ id: firestoreId, input: z.unknown() }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Vistoria inválida.");
  const actor = await requireActiveUser(request); const saved = await saveInspection(parsed.data.input, parsed.data.id, actor);
  logOperation("inspection.updated", { inspectionId: saved.id, actorUid: actor.id, result: saved.result, sequence: saved.sequence }); return saved;
});

// Exclusão definitiva: basta a confirmação na interface. `reason` é aceito por compatibilidade, mas não é exigido.
const deleteInspectionInput = z.object({ id: firestoreId, reason: z.string().max(1000).optional() });

export const deleteInspection = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireAdmin(request);
  const parsed = deleteInspectionInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Vistoria inválida.");
  const purged = await purgeInspection(parsed.data.id, actor, { removeStorageFiles: removeAppStorageFiles });
  logOperation("inspection.purged", {
    inspectionId: purged.id, code: purged.code, actorUid: actor.id, removedPhotos: purged.removedPhotos,
    removedApprovals: purged.removedApprovals, removedCredentials: purged.removedCredentials, pendingStoragePaths: purged.pendingStoragePaths.length
  });
  return purged;
});
