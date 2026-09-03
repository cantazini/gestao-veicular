import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireActiveUser } from "./auth.js";
import { auditEntry } from "./audit.js";
import { CHECKLIST_KEYS } from "./checklist.js";
import { firestore, serverTimestamp } from "./firebase.js";
import { dateOnly, firestoreId, timeOnly } from "./validation.js";
import { logOperation } from "./observability.js";

const itemSchema = z.object({
  key: z.string().min(1).max(80), categoryKey: z.string().min(1).max(80), categoryLabel: z.string().min(1).max(100), label: z.string().min(1).max(200),
  status: z.enum(["conforme", "nao_conforme", "nao_se_aplica"]), observation: z.string().trim().max(500).optional().default("")
}).superRefine((item, context) => {
  if (item.status === "nao_conforme" && !item.observation) context.addIssue({ code: "custom", path: ["observation"], message: "Descreva a não conformidade." });
});

export const inspectionInputSchema = z.object({
  companyId: firestoreId, vehicleId: firestoreId, driverId: firestoreId, projectId: firestoreId,
  inspectionDate: dateOnly, inspectionTime: timeOnly, mileage: z.coerce.number().int().nonnegative(),
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

async function saveInspection(input: unknown, inspectionId: string | undefined, actor: Awaited<ReturnType<typeof requireActiveUser>>) {
  const data = parseInput(input);
  const reference = inspectionId ? firestore.collection("inspections").doc(inspectionId) : firestore.collection("inspections").doc();
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
    if (![company, project, vehicle, driver].every((snapshot) => snapshot.exists && snapshot.data()?.active === true)) throw new HttpsError("failed-precondition", "Empresa, projeto, veículo e motorista devem estar ativos.");
    if (vehicle.data()?.companyId !== data.companyId || vehicle.data()?.projectId !== data.projectId || driver.data()?.companyId !== data.companyId) throw new HttpsError("failed-precondition", "Os vínculos operacionais informados não são compatíveis.");
    if (!Array.isArray(vehicle.data()?.driverIds) || !vehicle.data()!.driverIds.includes(data.driverId)) throw new HttpsError("failed-precondition", "O motorista não está autorizado para este veículo.");
    if (data.mileage < Number(vehicle.data()?.mileage || 0) && !inspectionId) throw new HttpsError("failed-precondition", "A quilometragem não pode ser menor que o último registro do veículo.");
    const client = await transaction.get(firestore.collection("clients").doc(String(company.data()?.clientId)));
    const accessProfile = await transaction.get(firestore.collection("accessProfiles").doc(String(vehicle.data()?.accessProfileId)));
    const approvals = inspectionId
      ? await transaction.get(firestore.collection("credentialApprovals").where("inspectionId", "==", inspectionId).where("status", "==", "approved"))
      : null;
    const threshold = Number(settings.data()?.minimumInspectionCompliance ?? 90);
    const calculation = calculateInspection(data.items, threshold);
    let code = String(current.data()?.code || "");
    if (!inspectionId) {
      const counterReference = firestore.collection("systemSettings").doc("inspectionSequence");
      const counter = await transaction.get(counterReference);
      const sequence = Number(counter.data()?.value || 0) + 1;
      code = `VST-${String(sequence).padStart(6, "0")}`;
      transaction.set(counterReference, { value: sequence, updatedAt: serverTimestamp() }, { merge: true });
    }
    const stamp = serverTimestamp();
    const snapshot = {
      client: { id: client.id, ...(client.data() || {}) }, company: { id: company.id, ...company.data() }, project: { id: project.id, ...project.data() },
      vehicle: { id: vehicle.id, ...vehicle.data() }, driver: { id: driver.id, ...driver.data() }, accessProfile: { id: accessProfile.id, ...(accessProfile.data() || {}) },
      inspector: { id: actor.id, name: actor.name, email: actor.email }
    };
    const persisted = { ...data, ...calculation, code, status: "completed", snapshot, inspectorId: actor.id, inspectorName: actor.name, inspectorEmail: actor.email, completedAt: stamp, completedBy: actor.id, ...(current.exists ? {} : { createdAt: stamp, createdBy: actor.id }), updatedAt: stamp, updatedBy: actor.id };
    transaction.set(reference, persisted);
    transaction.set(vehicle.ref, { mileage: Math.max(Number(vehicle.data()?.mileage || 0), data.mileage), updatedAt: stamp, updatedBy: actor.id }, { merge: true });
    approvals?.forEach((approval) => transaction.update(approval.ref, { status: "invalidated", invalidatedReason: "inspection_updated", updatedAt: stamp, updatedBy: actor.id }));
    transaction.set(firestore.collection("auditLogs").doc(), auditEntry(actor, inspectionId ? "inspection.updated" : "inspection.completed", "inspections", reference.id, { result: calculation.result }));
    return { id: reference.id, code, inspectionDate: data.inspectionDate, inspectionTime: data.inspectionTime, mileage: data.mileage, ...calculation, status: "completed", inspectorName: actor.name, updatedAt: new Date().toISOString() };
  });
}

export const completeInspection = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireActiveUser(request); const saved = await saveInspection(request.data, undefined, actor);
  logOperation("inspection.completed", { inspectionId: saved.id, actorUid: actor.id, result: saved.result }); return saved;
});

export const updateInspection = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const parsed = z.object({ id: firestoreId, input: z.unknown() }).safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Vistoria inválida.");
  const actor = await requireActiveUser(request); const saved = await saveInspection(parsed.data.input, parsed.data.id, actor);
  logOperation("inspection.updated", { inspectionId: saved.id, actorUid: actor.id, result: saved.result }); return saved;
});
