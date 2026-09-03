import { FieldValue, type DocumentData, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z, type ZodType } from "zod";
import { requireActiveUser, requireAdmin, type AppUser } from "./auth.js";
import { auditEntry } from "./audit.js";
import { firestore, serverTimestamp } from "./firebase.js";
import { active, cnpj, dateOnly, optionalDateOnly, optionalFirestoreId, firestoreId, normalizeCode, normalizePlate } from "./validation.js";
import { logOperation } from "./observability.js";

const entityNames = ["clients", "projects", "companies", "drivers", "vehicles", "accessProfiles"] as const;
type EntityName = typeof entityNames[number];

const schemas: Record<EntityName, ZodType> = {
  clients: z.object({ name: z.string().trim().min(2).max(140), legalName: z.string().trim().min(2).max(180), document: cnpj, active }),
  projects: z.object({ clientId: firestoreId, name: z.string().trim().min(2).max(140), code: z.string().trim().min(1).max(40).transform(normalizeCode), active }),
  companies: z.object({
    clientId: firestoreId, parentCompanyId: optionalFirestoreId, legalName: z.string().trim().min(2).max(180), tradeName: z.string().trim().max(160).optional().default(""),
    document: cnpj, unit: z.string().trim().max(120).optional().default(""), managerName: z.string().trim().max(140).optional().default(""), phone: z.string().trim().max(30).optional().default(""),
    email: z.union([z.email(), z.literal("")]).optional().default(""), contractNumber: z.string().trim().max(80).optional().default(""), contractType: z.enum(["direct", "subcontractor"]),
    contractStart: optionalDateOnly, contractEnd: optionalDateOnly, projectIds: z.array(firestoreId).default([]), active
  }).superRefine((value, context) => {
    if (value.contractType === "subcontractor" && !value.parentCompanyId) context.addIssue({ code: "custom", path: ["parentCompanyId"], message: "Informe a empresa contratante." });
    if (value.contractStart && value.contractEnd && value.contractEnd < value.contractStart) context.addIssue({ code: "custom", path: ["contractEnd"], message: "A data final deve ser posterior à inicial." });
  }),
  drivers: z.object({ companyId: firestoreId, name: z.string().trim().min(2).max(160), registration: z.string().trim().min(1).max(60), jobTitle: z.string().trim().max(100).optional().default(""), licenseCategory: z.string().trim().min(1).max(10), licenseNumber: z.string().trim().max(40).optional().default(""), licenseExpiry: dateOnly, provisionalLicense: z.boolean().default(false), active }),
  vehicles: z.object({ companyId: firestoreId, projectId: firestoreId, accessProfileId: firestoreId, plate: z.string().transform(normalizePlate).pipe(z.string().min(7).max(8)), brand: z.string().trim().min(1).max(80), model: z.string().trim().min(1).max(100), year: z.coerce.number().int().min(1950).max(2200), type: z.string().trim().min(1).max(60), color: z.string().trim().max(50).optional().default(""), fuel: z.string().trim().max(50).optional().default(""), mileage: z.coerce.number().int().nonnegative(), ownership: z.enum(["owned", "rented"]), rentalCompany: z.string().trim().max(160).optional().default(""), driverIds: z.array(firestoreId).default([]), active }),
  accessProfiles: z.object({ clientId: optionalFirestoreId, name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).optional().default(""), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), gates: z.array(z.string().trim().min(1).max(100)).default([]), areas: z.array(z.string().trim().min(1).max(100)).default([]), active })
};

const requestSchema = z.object({ entity: z.enum(entityNames), id: optionalFirestoreId, input: z.record(z.string(), z.unknown()) });

function validationError(error: z.ZodError): never {
  throw new HttpsError("invalid-argument", "Revise os campos informados.", { fieldErrors: z.flattenError(error).fieldErrors });
}

function parseEntity(entity: EntityName, input: unknown, _current?: DocumentData): Record<string, unknown> {
  const result = schemas[entity].safeParse(input);
  if (!result.success) validationError(result.error);
  return result.data as Record<string, unknown>;
}

function writeData(entity: EntityName, data: Record<string, unknown>, updating: boolean) {
  const output: Record<string, unknown> = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  if (!updating) return output;
  const optionalFields: Partial<Record<EntityName, string[]>> = { companies: ["parentCompanyId", "contractStart", "contractEnd"], accessProfiles: ["clientId"] };
  for (const field of optionalFields[entity] || []) if (data[field] === undefined) output[field] = FieldValue.delete();
  return output;
}

function uniqueKeys(entity: EntityName, data: Record<string, unknown>): string[] {
  if (entity === "clients" || entity === "companies") return [`cnpj:${data.document}`];
  if (entity === "projects") return [`project-code:${data.clientId}:${normalizeCode(data.code)}`];
  if (entity === "vehicles") return [`plate:${normalizePlate(data.plate)}`];
  if (entity === "drivers") return [`driver-registration:${data.companyId}:${normalizeCode(data.registration)}`];
  return [];
}

async function validateRelationships(transaction: Transaction, entity: EntityName, id: string, data: Record<string, unknown>) {
  const read = (collectionName: string, referenceId: unknown) => transaction.get(firestore.collection(collectionName).doc(String(referenceId)));
  if (entity === "projects" || entity === "companies" || (entity === "accessProfiles" && data.clientId)) {
    const client = await read("clients", data.clientId);
    if (!client.exists || client.data()?.active !== true) throw new HttpsError("failed-precondition", "O cliente informado não existe ou está inativo.");
  }
  if (entity === "companies") {
    if (data.parentCompanyId) {
      if (data.parentCompanyId === id) throw new HttpsError("failed-precondition", "Uma empresa não pode contratar a si própria.");
      const parent = await read("companies", data.parentCompanyId);
      if (!parent.exists || parent.data()?.active !== true || parent.data()?.clientId !== data.clientId) throw new HttpsError("failed-precondition", "A empresa contratante deve estar ativa e pertencer ao mesmo cliente.");
    }
    const projects = await Promise.all((data.projectIds as string[]).map((projectId) => read("projects", projectId)));
    if (projects.some((project) => !project.exists || project.data()?.active !== true || project.data()?.clientId !== data.clientId)) throw new HttpsError("failed-precondition", "Todos os projetos devem estar ativos e pertencer ao cliente da empresa.");
  }
  if (entity === "drivers") {
    const company = await read("companies", data.companyId);
    if (!company.exists || company.data()?.active !== true) throw new HttpsError("failed-precondition", "A empresa informada não existe ou está inativa.");
  }
  if (entity === "vehicles") {
    const [company, project, profile, ...drivers] = await Promise.all([
      read("companies", data.companyId), read("projects", data.projectId), read("accessProfiles", data.accessProfileId),
      ...(data.driverIds as string[]).map((driverId) => read("drivers", driverId))
    ]);
    if (!company.exists || company.data()?.active !== true) throw new HttpsError("failed-precondition", "A empresa informada não existe ou está inativa.");
    if (!project.exists || project.data()?.active !== true || !(company.data()?.projectIds || []).includes(project.id)) throw new HttpsError("failed-precondition", "O projeto não está autorizado para esta empresa.");
    if (!profile.exists || profile.data()?.active !== true || (profile.data()?.clientId && profile.data()?.clientId !== company.data()?.clientId)) throw new HttpsError("failed-precondition", "O perfil de acesso não é compatível com o cliente da empresa.");
    if (drivers.some((driver) => !driver.exists || driver.data()?.active !== true || driver.data()?.companyId !== company.id)) throw new HttpsError("failed-precondition", "Todos os motoristas devem estar ativos e pertencer à empresa do veículo.");
  }
}

interface ExistingAssignments { companyProjects: FirebaseFirestore.QueryDocumentSnapshot[]; vehicleProjects: FirebaseFirestore.QueryDocumentSnapshot[]; vehicleDrivers: FirebaseFirestore.QueryDocumentSnapshot[] }

async function loadAssignments(transaction: Transaction, entity: EntityName, id: string): Promise<ExistingAssignments> {
  const empty: ExistingAssignments = { companyProjects: [], vehicleProjects: [], vehicleDrivers: [] };
  if (entity === "companies") return { ...empty, companyProjects: (await transaction.get(firestore.collection("companyProjectAssignments").where("companyId", "==", id))).docs };
  if (entity === "vehicles") {
    const [projects, drivers] = await Promise.all([
      transaction.get(firestore.collection("vehicleProjectAssignments").where("vehicleId", "==", id)),
      transaction.get(firestore.collection("vehicleDriverAssignments").where("vehicleId", "==", id))
    ]);
    return { ...empty, vehicleProjects: projects.docs, vehicleDrivers: drivers.docs };
  }
  return empty;
}

function syncAssignments(transaction: Transaction, entity: EntityName, id: string, data: Record<string, unknown>, user: AppUser, existing: ExistingAssignments) {
  const stamp = serverTimestamp();
  if (entity === "companies") {
    const selected = data.projectIds as string[];
    for (const assignment of existing.companyProjects.filter((item) => !selected.includes(String(item.data().projectId)))) transaction.set(assignment.ref, { active: false, endedAt: stamp, updatedAt: stamp, updatedBy: user.id }, { merge: true });
    for (const projectId of selected) {
      transaction.set(firestore.collection("companyProjectAssignments").doc(`${id}_${projectId}`), { companyId: id, projectId, active: true, updatedAt: stamp, updatedBy: user.id }, { merge: true });
    }
  }
  if (entity === "vehicles") {
    const projectId = String(data.projectId);
    for (const assignment of existing.vehicleProjects.filter((item) => item.data().projectId !== projectId)) transaction.set(assignment.ref, { active: false, endedAt: stamp, updatedAt: stamp, updatedBy: user.id }, { merge: true });
    transaction.set(firestore.collection("vehicleProjectAssignments").doc(`${id}_${projectId}`), { vehicleId: id, projectId, active: true, updatedAt: stamp, updatedBy: user.id }, { merge: true });
    const selected = data.driverIds as string[];
    for (const assignment of existing.vehicleDrivers.filter((item) => !selected.includes(String(item.data().driverId)))) transaction.set(assignment.ref, { active: false, endedAt: stamp, updatedAt: stamp, updatedBy: user.id }, { merge: true });
    for (const driverId of selected) {
      transaction.set(firestore.collection("vehicleDriverAssignments").doc(`${id}_${driverId}`), { vehicleId: id, driverId, active: true, updatedAt: stamp, updatedBy: user.id }, { merge: true });
    }
  }
}

export async function persistEntity(entity: EntityName, id: string | undefined, rawInput: Record<string, unknown>, user: AppUser) {
  const reference = id ? firestore.collection(entity).doc(id) : firestore.collection(entity).doc();
  return firestore.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(reference);
    if (id && !currentSnapshot.exists) throw new HttpsError("not-found", "Registro não encontrado.");
    const current = currentSnapshot.data();
    const data = parseEntity(entity, rawInput, current);
    await validateRelationships(transaction, entity, reference.id, data);
    const assignments = await loadAssignments(transaction, entity, reference.id);
    const oldKeys = current ? uniqueKeys(entity, current) : [];
    const newKeys = uniqueKeys(entity, data);
    const keySnapshots = await Promise.all(newKeys.map((key) => transaction.get(firestore.collection("uniqueKeys").doc(key))));
    keySnapshots.forEach((snapshot) => {
      if (snapshot.exists && snapshot.data()?.ownerId !== reference.id) throw new HttpsError("already-exists", "Já existe um registro com este identificador.");
    });
    const stamp = serverTimestamp();
    const persistedData = writeData(entity, data, Boolean(current));
    transaction.set(reference, { ...persistedData, ...(current ? {} : { createdAt: stamp, createdBy: user.id }), updatedAt: stamp, updatedBy: user.id }, { merge: true });
    for (const key of newKeys) transaction.set(firestore.collection("uniqueKeys").doc(key), { ownerCollection: entity, ownerId: reference.id, updatedAt: stamp });
    for (const key of oldKeys.filter((key) => !newKeys.includes(key))) transaction.delete(firestore.collection("uniqueKeys").doc(key));
    syncAssignments(transaction, entity, reference.id, data, user, assignments);
    transaction.set(firestore.collection("auditLogs").doc(), auditEntry(user, current ? "entity.updated" : "entity.created", entity, reference.id));
    return { id: reference.id, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
  });
}

export const manageEntity = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const user = await requireActiveUser(request);
  const parsed = requestSchema.safeParse(request.data);
  if (!parsed.success) validationError(parsed.error);
  if (["clients", "projects", "accessProfiles"].includes(parsed.data.entity)) await requireAdmin(request);
  const saved = await persistEntity(parsed.data.entity, parsed.data.id, parsed.data.input, user);
  logOperation("entity.persisted", { entity: parsed.data.entity, entityId: saved.id, actorUid: user.id });
  return saved;
});

export const entityValidationForTest = { parseEntity, uniqueKeys };
