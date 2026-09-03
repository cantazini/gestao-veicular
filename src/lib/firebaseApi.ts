import { collection, deleteField, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where, type DocumentData, type QueryConstraint, type Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getDownloadURL, ref } from "firebase/storage";
import { firebaseDb, firebaseFunctions, firebaseStorage } from "../firebase/config";
import { firebaseAuth } from "../firebase/config";
import { ApiError } from "./api";

const entityCollections = new Set(["clients", "projects", "companies", "drivers", "vehicles", "accessProfiles", "users"]);

function bodyOf(init: RequestInit): Record<string, unknown> {
  if (!init.body) return {};
  try { return JSON.parse(String(init.body)) as Record<string, unknown>; }
  catch { throw new ApiError("Corpo da requisição inválido.", 400); }
}

function plain(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as Timestamp).toDate === "function") return (value as Timestamp).toDate().toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  return value;
}

function record(snapshot: { id: string; data: () => DocumentData }): Record<string, unknown> {
  return { id: snapshot.id, ...(plain(snapshot.data()) as Record<string, unknown>) };
}

function messageOf(reason: unknown) {
  const fallback = "Não foi possível concluir a operação.";
  if (!(reason instanceof Error)) return fallback;
  const firebaseMessage = reason.message.replace(/^FirebaseError:\s*/i, "").replace(/^\w+\/[^:]+:\s*/i, "");
  return firebaseMessage || fallback;
}

async function callable<T>(name: string, data: unknown): Promise<T> {
  try { return (await httpsCallable<unknown, T>(firebaseFunctions(), name)(data)).data; }
  catch (reason) {
    const code = typeof reason === "object" && reason && "code" in reason ? String((reason as { code: unknown }).code) : "";
    const status = code.includes("invalid-argument") ? 400 : code.includes("permission-denied") ? 403 : code.includes("not-found") ? 404 : code.includes("already-exists") ? 409 : 500;
    throw new ApiError(messageOf(reason), status, typeof reason === "object" && reason && "details" in reason ? (reason as { details: unknown }).details : undefined);
  }
}

async function logoUrl(storagePath: unknown) {
  if (!storagePath) return null;
  try { return await getDownloadURL(ref(firebaseStorage(), String(storagePath))); }
  catch { return null; }
}

async function listEntities(name: string, search: URLSearchParams) {
  const constraints: QueryConstraint[] = [];
  const activeFilter = search.get("active");
  if (activeFilter) constraints.push(where("active", "==", activeFilter === "true"));
  constraints.push(limit(1000));
  const snapshot = await getDocs(query(collection(firebaseDb(), name), ...constraints));
  let items = snapshot.docs.map(record);
  if (name === "clients") items = await Promise.all(items.map(async (item) => ({ ...item, logoBlobPath: await logoUrl(item.logoStoragePath) })));
  if (name === "vehicles") {
    const profiles = new Map((await getDocs(collection(firebaseDb(), "accessProfiles"))).docs.map((item) => [item.id, item.data()]));
    items = items.map((item) => ({ ...item, accessProfileName: profiles.get(String(item.accessProfileId))?.name }));
  }
  const page = Math.max(1, Number(search.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(search.get("pageSize") || 25)));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length };
}

function inspectionSummary(item: Record<string, unknown>): Record<string, unknown> {
  const snapshot = item.snapshot as Record<string, Record<string, unknown>> | undefined;
  return { ...item,
    clientName: snapshot?.client?.name || "—", companyName: snapshot?.company?.tradeName || snapshot?.company?.legalName || "—", projectName: snapshot?.project?.name || "—",
    driverName: snapshot?.driver?.name || "—", inspectorName: item.inspectorName || snapshot?.inspector?.name || "—", plate: snapshot?.vehicle?.plate || "—"
  };
}

async function listInspections(search: URLSearchParams) {
  const constraints: QueryConstraint[] = [];
  const companyFilter = search.get("companyId"); const resultFilter = search.get("result");
  if (companyFilter) constraints.push(where("companyId", "==", companyFilter));
  else if (resultFilter) constraints.push(where("result", "==", resultFilter));
  const startFilter = search.get("startDate"); const endFilter = search.get("endDate");
  if (startFilter) constraints.push(where("inspectionDate", ">=", startFilter));
  if (endFilter) constraints.push(where("inspectionDate", "<=", endFilter));
  constraints.push(orderBy("inspectionDate", "desc"), limit(1000));
  const snapshot = await getDocs(query(collection(firebaseDb(), "inspections"), ...constraints));
  let items = snapshot.docs.map(record).map(inspectionSummary);
  const match = (key: string) => { const value = search.get(key); if (value) items = items.filter((item) => String(item[key] || "") === value); };
  ["companyId", "projectId", "vehicleId", "driverId", "result"].forEach(match);
  const clientId = search.get("clientId"); if (clientId) items = items.filter((item) => String((item.snapshot as Record<string, Record<string, unknown>>)?.client?.id || "") === clientId);
  const start = search.get("startDate"); if (start) items = items.filter((item) => String(item.inspectionDate) >= start);
  const end = search.get("endDate"); if (end) items = items.filter((item) => String(item.inspectionDate) <= end);
  const plate = search.get("plate")?.toUpperCase(); if (plate) items = items.filter((item) => String(item.plate).includes(plate));
  const page = Math.max(1, Number(search.get("page") || 1)); const pageSize = Math.min(100, Math.max(1, Number(search.get("pageSize") || 25)));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length };
}

async function getInspection(id: string) {
  const snapshot = await getDoc(doc(firebaseDb(), "inspections", id));
  if (!snapshot.exists()) throw new ApiError("Vistoria não encontrada.", 404);
  const photos = await getDocs(collection(snapshot.ref, "photos"));
  const decorated = await Promise.all(photos.docs.filter((photo) => photo.data().active !== false).map(async (photo) => ({ ...record(photo), url: await getDownloadURL(ref(firebaseStorage(), String(photo.data().storagePath))) })));
  const value = inspectionSummary(record(snapshot));
  const clientSnapshot = (value.snapshot as Record<string, Record<string, unknown>>)?.client;
  const currentClient = clientSnapshot?.id ? await getDoc(doc(firebaseDb(), "clients", String(clientSnapshot.id))) : null;
  const clientPath = currentClient?.exists() ? currentClient.data().logoStoragePath : clientSnapshot?.logoStoragePath;
  return { ...value, clientLogoUrl: await logoUrl(clientPath), photos: decorated };
}

function documentStatus(expiryDate: unknown, warningDays = 30) {
  if (!expiryDate) return "VALID";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${String(expiryDate).slice(0, 10)}T12:00:00`);
  if (expiry < today) return "EXPIRED";
  const warning = new Date(today); warning.setDate(warning.getDate() + warningDays);
  return expiry <= warning ? "EXPIRING" : "VALID";
}

async function listDocuments(search: URLSearchParams) {
  const [documents, clients, companies, drivers, vehicles, settings] = await Promise.all([
    getDocs(query(collection(firebaseDb(), "documents"), where("active", "==", true), limit(1000))), getDocs(collection(firebaseDb(), "clients")), getDocs(collection(firebaseDb(), "companies")),
    getDocs(collection(firebaseDb(), "drivers")), getDocs(collection(firebaseDb(), "vehicles")), getDoc(doc(firebaseDb(), "systemSettings", "default"))
  ]);
  const maps: Record<"client" | "company" | "driver" | "vehicle", Map<string, Record<string, unknown>>> = { client: new Map(clients.docs.map((item) => [item.id, record(item)])), company: new Map(companies.docs.map((item) => [item.id, record(item)])), driver: new Map(drivers.docs.map((item) => [item.id, record(item)])), vehicle: new Map(vehicles.docs.map((item) => [item.id, record(item)])) };
  const warning = Number(settings.data()?.documentExpiryWarningDays || settings.data()?.expiryAlertDays || 30);
  let rows: Record<string, unknown>[] = await Promise.all(documents.docs.map(async (item) => {
    const data = record(item); const entityType = String(data.entityType) as "company" | "driver" | "vehicle"; const entity: Record<string, unknown> = maps[entityType].get(String(data.entityId)) || {};
    const company: Record<string, unknown> = entityType === "company" ? entity : maps.company.get(String(entity.companyId)) || {}; const client: Record<string, unknown> = maps.client.get(String(company.clientId)) || {};
    return { ...data, clientId: client.id || "", clientName: client.name || client.legalName || "—", companyId: company.id || "", companyName: company.tradeName || company.legalName || "—", entityName: entity.name || entity.legalName || entity.plate || "—", entityIdentifier: entity.plate || entity.registration || entity.document || "—", documentStatus: documentStatus(data.expiryDate, warning), url: await getDownloadURL(ref(firebaseStorage(), String(data.storagePath))) };
  }));
  for (const key of ["entityType", "clientId", "companyId", "documentType"] as const) { const value = search.get(key); if (value) rows = rows.filter((item) => String(item[key]) === value); }
  const status = search.get("status"); if (status) rows = rows.filter((item) => item.documentStatus === status);
  const text = search.get("search")?.toLowerCase(); if (text) rows = rows.filter((item) => Object.values(item).join(" ").toLowerCase().includes(text));
  return rows;
}

async function dashboard() {
  const db = firebaseDb();
  const [inspections, vehicles, drivers, companies, rejected, recent, documents, settings] = await Promise.all([
    getCountFromServer(collection(db, "inspections")), getCountFromServer(query(collection(db, "vehicles"), where("active", "==", true))), getCountFromServer(query(collection(db, "drivers"), where("active", "==", true))),
    getCountFromServer(query(collection(db, "companies"), where("active", "==", true))), getCountFromServer(query(collection(db, "inspections"), where("result", "==", "REPROVADO"))),
    getDocs(query(collection(db, "inspections"), orderBy("inspectionDate", "desc"), limit(8))), getDocs(query(collection(db, "documents"), where("active", "==", true), limit(1000))), getDoc(doc(db, "systemSettings", "default"))
  ]);
  const warning = Number(settings.data()?.documentExpiryWarningDays || settings.data()?.expiryAlertDays || 30);
  const expiringDocuments = documents.docs.filter((item) => documentStatus(item.data().expiryDate, warning) === "EXPIRING").length;
  return { metrics: { inspections: inspections.data().count, vehicles: vehicles.data().count, drivers: drivers.data().count, companies: companies.data().count, rejected: rejected.data().count }, recentInspections: recent.docs.map(record).map(inspectionSummary), alerts: { expiringDocuments } };
}

async function settings(method: string, body: Record<string, unknown>) {
  if (method === "PUT") return callable("updateSettings", body);
  const snapshot = await getDoc(doc(firebaseDb(), "systemSettings", "default"));
  return snapshot.exists() ? plain(snapshot.data()) : { minimumInspectionCompliance: 90, maximumFleetAge: 12, expiryAlertDays: 30, allowProvisionalLicense: false, blockVehicleForAnyIrregularDriver: false, credentialMaximumDays: 365, credentialValidityDays: 30, documentExpiryWarningDays: 30, documentRequirements: [], credentialDimensions: [] };
}

async function exportInspections() {
  const result = await listInspections(new URLSearchParams("pageSize=1000"));
  return result.items.map((item) => {
    const snapshot = item.snapshot as Record<string, Record<string, unknown>> || {}; const output: Record<string, unknown> = {
      ID_Vistoria: item.id, Codigo: item.code, Data: item.inspectionDate, Hora: item.inspectionTime, Fiscalizador: item.inspectorName,
      Cliente: snapshot.client?.name, Empresa: snapshot.company?.legalName, CNPJ: snapshot.company?.document, Unidade: snapshot.company?.unit, Projeto: snapshot.project?.name,
      Motorista: snapshot.driver?.name, Matricula_Motorista: snapshot.driver?.registration, Categoria_CNH: snapshot.driver?.licenseCategory, Validade_CNH: snapshot.driver?.licenseExpiry,
      Placa: snapshot.vehicle?.plate, Marca: snapshot.vehicle?.brand, Modelo: snapshot.vehicle?.model, Ano: snapshot.vehicle?.year, Tipo_Veiculo: snapshot.vehicle?.type,
      Quilometragem: item.mileage, Resultado_Vistoria: item.result, Percentual_Conformidade: item.compliancePercentage, Observacoes: item.generalObservations
    };
    for (const checklist of item.items as Array<Record<string, unknown>> || []) { output[`Checklist_${checklist.key}`] = checklist.status; output[`Observacao_${checklist.key}`] = checklist.observation || ""; }
    return output;
  });
}

export async function firebaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = new URL(path, "https://local.invalid"); const parts = url.pathname.split("/").filter(Boolean); const method = String(init.method || "GET").toUpperCase();
  if (parts[0] === "dashboard" && method === "GET") return await dashboard() as T;
  if (parts[0] === "settings") return await settings(method, bodyOf(init)) as T;
  if (parts[0] === "inspections") {
    if (method === "GET" && parts[1]) return await getInspection(parts[1]) as T;
    if (method === "GET") return await listInspections(url.searchParams) as T;
    if (method === "POST") return await callable<T>("completeInspection", bodyOf(init));
    if (method === "PUT" && parts[1]) return await callable<T>("updateInspection", { id: parts[1], input: bodyOf(init) });
  }
  if (entityCollections.has(parts[0])) {
    if (method === "GET") return await listEntities(parts[0], url.searchParams) as T;
    return await callable<T>(parts[0] === "users" ? "manageUser" : "manageEntity", { ...(parts[0] === "users" ? {} : { entity: parts[0] }), id: parts[1] || undefined, input: bodyOf(init) });
  }
  if (parts[0] === "documents" && method === "GET") return await listDocuments(url.searchParams) as T;
  if (parts[0] === "documents" && parts[1] && method === "PUT") { await updateDoc(doc(firebaseDb(), "documents", parts[1]), { ...bodyOf(init), updatedAt: serverTimestamp() }); return undefined as T; }
  if (parts[0] === "files" && parts[1] && method === "DELETE") {
    const reference = doc(firebaseDb(), "documents", parts[1]); const snapshot = await getDoc(reference); if (!snapshot.exists()) throw new ApiError("Arquivo não encontrado.", 404);
    await deleteObject(ref(firebaseStorage(), String(snapshot.data().storagePath))).catch(() => undefined); await updateDoc(reference, { active: false, updatedAt: serverTimestamp(), updatedBy: firebaseAuth().currentUser?.uid || "" }); return undefined as T;
  }
  if (parts[0] === "clients" && parts[2] === "logo" && method === "DELETE") {
    const reference = doc(firebaseDb(), "clients", parts[1]); const snapshot = await getDoc(reference); const path = snapshot.data()?.logoStoragePath; if (path) await deleteObject(ref(firebaseStorage(), path)).catch(() => undefined); await updateDoc(reference, { logoStoragePath: deleteField(), updatedAt: serverTimestamp(), updatedBy: firebaseAuth().currentUser?.uid || "" }); return undefined as T;
  }
  if (parts[0] === "credentials" && parts[1] === "eligibility") return await callable<T>("getCredentialEligibility", Object.fromEntries(url.searchParams));
  if (parts[0] === "credentials" && parts[1] === "approval-requests" && method === "POST") return await callable<T>("requestCredentialApproval", bodyOf(init));
  if (parts[0] === "credentials" && parts[1] === "approvals" && method === "POST") return await callable<T>("decideCredentialApproval", bodyOf(init));
  if (parts[0] === "credentials" && parts[1] === "issue" && method === "POST") return await callable<T>("issueCredential", bodyOf(init));
  if (parts[0] === "imports" && method === "POST") return await callable<T>("bulkImport", bodyOf(init));
  if (parts[0] === "exports" && parts[1] === "inspections") return await exportInspections() as T;
  throw new ApiError("Operação ainda não disponível no adaptador Firebase.", 404, { path, method });
}
