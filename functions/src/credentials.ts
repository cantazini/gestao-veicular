import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireActiveUser } from "./auth.js";
import { auditEntry } from "./audit.js";
import { isLinkedToCompany } from "./companyLinks.js";
import { firestore, serverTimestamp } from "./firebase.js";
import { firestoreId, optionalFirestoreId } from "./validation.js";

const eligibilityInput = z.object({ clientId: optionalFirestoreId, companyId: optionalFirestoreId, vehicleId: optionalFirestoreId, accessProfileId: optionalFirestoreId });
const asDate = (value: unknown) => String(value || "");
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (date: string, days: number) => { const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };

export const getCredentialEligibility = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  await requireActiveUser(request);
  const parsed = eligibilityInput.safeParse(request.data);
  if (!parsed.success || !parsed.data.vehicleId || !parsed.data.accessProfileId) throw new HttpsError("invalid-argument", "Selecione veículo e perfil de acesso.");
  const [vehicle, profile, settings] = await Promise.all([
    firestore.collection("vehicles").doc(parsed.data.vehicleId).get(), firestore.collection("accessProfiles").doc(parsed.data.accessProfileId).get(), firestore.collection("systemSettings").doc("default").get()
  ]);
  if (!vehicle.exists || !profile.exists) throw new HttpsError("not-found", "Veículo ou perfil não encontrado.");
  const vehicleData = vehicle.data()!;
  // Veículos podem atender várias empresas: a empresa selecionada precisa ser um vínculo do veículo.
  const requestedCompanyId = parsed.data.companyId;
  if (requestedCompanyId && !isLinkedToCompany(vehicleData, requestedCompanyId)) throw new HttpsError("failed-precondition", "O veículo não está vinculado à empresa selecionada.");
  const companyId = requestedCompanyId || String(vehicleData.companyId || "missing");
  const [company, client, linkedDrivers, approvedInspections, approvalsForVehicle, credentialsForVehicle] = await Promise.all([
    firestore.collection("companies").doc(companyId).get(),
    firestore.collection("clients").doc(String(parsed.data.clientId || "missing")).get(),
    Promise.all((vehicleData.driverIds as string[] || []).map((id) => firestore.collection("drivers").doc(id).get())),
    firestore.collection("inspections").where("vehicleId", "==", vehicle.id).where("result", "==", "APROVADO").orderBy("inspectionDate", "desc").get(),
    firestore.collection("credentialApprovals").where("vehicleId", "==", vehicle.id).get(),
    firestore.collection("credentials").where("vehicleId", "==", vehicle.id).get()
  ]);
  const companyData = company.data() || {};
  const actualClient = client.exists ? client : await firestore.collection("clients").doc(String(companyData.clientId || "missing")).get();
  const drivers = requestedCompanyId ? linkedDrivers.filter((driver) => !driver.exists || isLinkedToCompany(driver.data(), requestedCompanyId)) : linkedDrivers;
  const inspection = approvedInspections.docs.find((item) => item.data().deleted !== true && (!requestedCompanyId || item.data().companyId === requestedCompanyId));
  const validityDays = Number(settings.data()?.credentialValidityDays || 30);
  const cards = [];
  // Issued credentials retain their own profile relation, independently of the query selection.
  const profileColors = new Map<string, unknown>([[profile.id, profile.data()?.color]]);
  for (const driver of drivers.filter((item) => item.exists)) {
    const driverData = driver.data()!;
    const reasons: string[] = [];
    if (!vehicleData.active || !companyData.active || !driverData.active) reasons.push("Cadastro operacional inativo");
    if (asDate(driverData.licenseExpiry) < today()) reasons.push("CNH vencida");
    if (!inspection) reasons.push("Nenhuma vistoria aprovada encontrada");
    const matchingApprovals = approvalsForVehicle.docs.filter((item) => item.data().driverId === driver.id && item.data().accessProfileId === profile.id);
    const approved = matchingApprovals.find((item) => item.data().status === "approved");
    const pending = matchingApprovals.find((item) => item.data().status === "pending");
    const credential = credentialsForVehicle.docs.find((item) => item.data().driverId === driver.id && item.data().status === "active");
    const currentCredential = credential?.data();
    const colorProfileId = String(currentCredential?.accessProfileId || profile.id);
    if (!profileColors.has(colorProfileId)) {
      const linkedProfile = await firestore.collection("accessProfiles").doc(colorProfileId).get();
      profileColors.set(colorProfileId, linkedProfile.data()?.color);
    }
    const operationalEligible = reasons.length === 0;
    const approval = approved || pending;
    const relatedInspectionId = String(currentCredential?.inspectionId || approval?.data().inspectionId || inspection?.id || "");
    const relatedInspection = approvedInspections.docs.find((item) => item.id === relatedInspectionId && item.data().deleted !== true) || inspection;
    const approvalStatus = approved ? "approved" : pending ? "pending" : "none";
    const credentialActive = Boolean(currentCredential && asDate(currentCredential.validUntil) >= today());
    if (operationalEligible && approvalStatus === "none") reasons.push("Solicite a aprovação administrativa");
    if (operationalEligible && approvalStatus === "pending") reasons.push("Aprovação administrativa pendente");
    if (operationalEligible && approvalStatus === "approved" && !credentialActive) reasons.push("Credencial aprovada; emissão pendente");
    cards.push({
      vehicleId: vehicle.id, driverId: driver.id, plate: vehicleData.plate, brand: vehicleData.brand, model: vehicleData.model, vehicleType: vehicleData.type,
      clientId: actualClient.id, clientName: actualClient.data()?.name || "Cliente", clientLogoBlobPath: actualClient.data()?.logoStoragePath || "",
      companyId: company.id, companyName: companyData.tradeName || companyData.legalName || "Empresa", driverName: driverData.name, registration: driverData.registration,
      licenseCategory: driverData.licenseCategory, licenseExpiry: driverData.licenseExpiry, accessProfileId: profile.id, accessProfileName: profile.data()?.name,
      accessProfileDescription: profile.data()?.description, accessProfileColor: profileColors.get(colorProfileId) ?? null, credentialCode: currentCredential?.code || "Aguardando emissão",
      eligible: operationalEligible && approvalStatus === "approved" && credentialActive, reasons, approvalStatus, approvalId: approval?.id || null,
      canRequestApproval: operationalEligible && approvalStatus === "none", canIssue: operationalEligible && approvalStatus === "approved" && !credentialActive,
      credentialValidUntil: currentCredential?.validUntil || addDays(today(), validityDays), inspectionId: relatedInspection?.id || null,
      inspectionDate: relatedInspection?.data().inspectionDate || null
    });
  }
  return cards;
});

const approvalRequestInput = z.object({ inspectionId: firestoreId, vehicleId: firestoreId, driverId: firestoreId, accessProfileId: firestoreId });
export const requestCredentialApproval = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireActiveUser(request);
  const parsed = approvalRequestInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Revise os dados da solicitação.");
  const inspection = await firestore.collection("inspections").doc(parsed.data.inspectionId).get();
  if (!inspection.exists || inspection.data()?.deleted === true || inspection.data()?.result !== "APROVADO") throw new HttpsError("failed-precondition", "A solicitação exige uma vistoria válida e aprovada.");
  if (inspection.data()?.vehicleId !== parsed.data.vehicleId || inspection.data()?.driverId !== parsed.data.driverId) throw new HttpsError("failed-precondition", "A vistoria não corresponde aos vínculos informados.");
  const reference = firestore.collection("credentialApprovals").doc(`${parsed.data.inspectionId}_${parsed.data.driverId}_${parsed.data.accessProfileId}`);
  const current = await reference.get();
  if (current.exists && ["pending", "approved"].includes(current.data()?.status)) return { id: reference.id, status: current.data()?.status };
  const inspectionData = inspection.data()!;
  await reference.set({ ...parsed.data, clientId: inspectionData.snapshot?.client?.id || null, companyId: inspectionData.companyId, projectId: inspectionData.projectId, status: "pending", requestedAt: serverTimestamp(), requestedBy: actor.id, createdAt: serverTimestamp(), createdBy: actor.id, updatedAt: serverTimestamp(), updatedBy: actor.id });
  await firestore.collection("auditLogs").add(auditEntry(actor, "credential-approval.requested", "credentialApprovals", reference.id));
  return { id: reference.id, status: "pending" };
});

const approvalInput = z.object({ approvalId: firestoreId, decision: z.enum(["approved", "rejected"]), observation: z.string().trim().max(1000).optional().default("") });
export const decideCredentialApproval = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireActiveUser(request);
  const parsed = approvalInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Revise os dados da aprovação.");
  const reference = firestore.collection("credentialApprovals").doc(parsed.data.approvalId);
  const current = await reference.get();
  if (!current.exists || current.data()?.status !== "pending") throw new HttpsError("failed-precondition", "A solicitação não está pendente.");
  const inspection = await firestore.collection("inspections").doc(String(current.data()?.inspectionId)).get();
  if (!inspection.exists || inspection.data()?.deleted === true || inspection.data()?.result !== "APROVADO") throw new HttpsError("failed-precondition", "A aprovação exige uma vistoria válida e aprovada.");
  await reference.update({ status: parsed.data.decision, observation: parsed.data.observation, reviewedAt: serverTimestamp(), reviewedBy: actor.id, updatedAt: serverTimestamp(), updatedBy: actor.id });
  await firestore.collection("auditLogs").add(auditEntry(actor, `credential-approval.${parsed.data.decision}`, "credentialApprovals", reference.id));
  return { id: reference.id, status: parsed.data.decision };
});

const issueInput = z.object({ approvalId: firestoreId });
export const issueCredential = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireActiveUser(request);
  const parsed = issueInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Aprovação inválida.");
  const reference = firestore.collection("credentials").doc();
  const code = `CRD-${reference.id.slice(0, 8).toUpperCase()}`;
  const validUntil = await firestore.runTransaction(async (transaction) => {
    const approvalReference = firestore.collection("credentialApprovals").doc(parsed.data.approvalId);
    const approval = await transaction.get(approvalReference);
    if (!approval.exists || approval.data()?.status !== "approved") throw new HttpsError("failed-precondition", "A credencial ainda não foi aprovada.");
    const [inspection, settings] = await Promise.all([
      transaction.get(firestore.collection("inspections").doc(String(approval.data()?.inspectionId || "missing"))),
      transaction.get(firestore.collection("systemSettings").doc("default"))
    ]);
    if (!inspection.exists || inspection.data()?.deleted === true || inspection.data()?.result !== "APROVADO") throw new HttpsError("failed-precondition", "A vistoria vinculada não está disponível para emissão.");
    const expiry = addDays(today(), Number(settings.data()?.credentialValidityDays || 30));
    transaction.set(reference, { ...approval.data(), approvalId: approval.id, code, validFrom: today(), validUntil: expiry, status: "active", createdAt: serverTimestamp(), createdBy: actor.id });
    transaction.set(firestore.collection("auditLogs").doc(), auditEntry(actor, "credential.issued", "credentials", reference.id));
    return expiry;
  });
  return { id: reference.id, code, validUntil, status: "active" };
});
