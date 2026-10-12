import { newChecklist } from "../data/checklist";
import type { DashboardData, DocumentRecord, Entity, Inspection, PageResult, User } from "../types";
import { entityCompanyIds, isLinkedToCompany, primaryCompanyId, sharesCompany } from "./companyLinks";
import { classifyDocumentExpiry, countDocumentStatuses } from "./documentStatus";
import { effectiveInspectionSequences, nextInspectionSequence, persistedSequence, summarizeInspectionTimeline, vehicleSequenceSummary } from "./inspectionTimeline";
import { onlyDigits } from "./format";
import { createsCompanyCycle } from "./organizationDirectory";

const ids = { client: "00000000-0000-4000-8000-000000000010", project: "00000000-0000-4000-8000-000000000020", company: "00000000-0000-4000-8000-000000000030", secondCompany: "00000000-0000-4000-8000-000000000031", profile: "00000000-0000-4000-8000-000000000040", driver: "00000000-0000-4000-8000-000000000050", vehicle: "00000000-0000-4000-8000-000000000060", inspection: "00000000-0000-4000-8000-000000000070" };
const entities: Record<string, Entity[]> = {
  clients: [{ id: ids.client, name: "Klabin", legalName: "Klabin S.A.", document: "89.637.490/0001-45", logoBlobPath: "/assets/logo-klabin.png", active: true }],
  projects: [{ id: ids.project, clientId: ids.client, name: "Operação Florestal", code: "OF-01", active: true }],
  companies: [{ id: ids.company, clientId: ids.client, legalName: "Transportes Horizonte Ltda.", tradeName: "Horizonte", document: "12.345.678/0001-90", unit: "Telêmaco Borba", managerName: "Marina Alves", contractNumber: "CT-2026-014", contractType: "direct", projectIds: [ids.project], active: true }, { id: ids.secondCompany, clientId: ids.client, legalName: "Aurora Logística Ltda.", tradeName: "Aurora", document: "11.444.777/0001-61", unit: "Ortigueira", managerName: "Paulo Souza", contractNumber: "CT-2026-021", contractType: "direct", projectIds: [ids.project], active: true }],
  drivers: [{ id: ids.driver, companyId: ids.company, companyIds: [ids.company, ids.secondCompany], name: "Carlos Eduardo Lima", registration: "M-1842", jobTitle: "Motorista", licenseCategory: "D", licenseNumber: "•••• 7384", licenseExpiry: "2027-09-30", provisionalLicense: false, active: true }],
  accessProfiles: [{ id: ids.profile, clientId: ids.client, name: "Operacional", description: "Acesso às áreas operacionais", color: "#0056A4", gates: ["Portaria principal"], areas: ["Pátio", "Oficina"], active: true }],
  vehicles: [{ id: ids.vehicle, companyId: ids.company, companyIds: [ids.company, ids.secondCompany], projectId: ids.project, accessProfileId: ids.profile, plate: "ABC1D23", brand: "Volkswagen", model: "Delivery 11.180", year: 2024, type: "Caminhão", color: "Branco", fuel: "Diesel", mileage: 18452, ownership: "owned", driverIds: [ids.driver], active: true }],
  users: [{ id: "00000000-0000-4000-8000-000000000001", identityProviderId: "local-admin", email: "admin@local.test", name: "Administrador local", role: "admin", active: true }]
};
const inspectionItems = newChecklist();
inspectionItems[21] = { ...inspectionItems[21], status: "nao_conforme", observation: "Pequeno indício de vazamento próximo ao cárter." };
let inspections: Inspection[] = [{ id: ids.inspection, code: "VST-000012", companyId: ids.company, projectId: ids.project, vehicleId: ids.vehicle, driverId: ids.driver, createdAt: new Date().toISOString(), inspectionDate: new Date().toISOString().slice(0,10), inspectionTime: "09:35", mileage: 18452, result: "APROVADO", compliancePercentage: 97.4, companyName: "Transportes Horizonte Ltda.", clientName: "Klabin", projectName: "Operação Florestal", driverName: "Carlos Eduardo Lima", inspectorName: "Administrador local", plate: "ABC1D23", generalObservations: "Veículo liberado com orientação de acompanhamento preventivo.", snapshot: { client: { id: ids.client, name: "Klabin", logoBlobPath: "/assets/logo-klabin.png" }, company: entities.companies[0], project: entities.projects[0], driver: entities.drivers[0], vehicle: entities.vehicles[0], accessProfile: entities.accessProfiles[0] }, items: inspectionItems, photos: [] }];
let documents: DocumentRecord[] = [];

export const mockUser: User = { id: "00000000-0000-4000-8000-000000000001", name: "Administrador local", email: "admin@local.test", role: "admin" };

function page<T>(items: T[]): PageResult<T> { return { items, page: 1, pageSize: 100, total: items.length }; }
function normalizeMockCompanyLinks(entity: string, body: Entity): void {
  if (!["drivers", "vehicles"].includes(entity)) return;
  const selected = [...new Set(entityCompanyIds(body))];
  const primary = primaryCompanyId(body.companyId, selected);
  body.companyId = primary;
  body.companyIds = primary ? [primary, ...selected.filter((id) => id !== primary)] : [];
}
function assertMockRelationships(entity:string,body:Entity):void{
  if(["projects","companies"].includes(entity)&&!entities.clients.some(item=>item.id===body.clientId&&item.active))throw new Error("Selecione um cliente ativo e válido.");
  if(["drivers","vehicles"].includes(entity)){
    const companyIds=entityCompanyIds(body);
    if(!companyIds.length||companyIds.some(id=>!entities.companies.some(item=>item.id===id&&item.active)))throw new Error("Selecione uma empresa ativa e válida.");
  }
  if(entity==="drivers"){
    const orphaned=entities.vehicles.find(vehicle=>vehicle.active&&(vehicle.driverIds as string[]||[]).includes(String(body.id))&&!sharesCompany(vehicle,body));
    if(orphaned)throw new Error(`O motorista está vinculado ao veículo ${orphaned.plate}, que não atende nenhuma das empresas selecionadas.`);
  }
  if(entity==="companies"){
    if (body.contractType === "direct") body.parentCompanyId = undefined;
    if (body.parentCompanyId) {
      const parent = entities.companies.find((item) => item.id === body.parentCompanyId);
      if (!parent || parent.active !== true || parent.clientId !== body.clientId) throw new Error("A empresa contratante deve estar ativa e pertencer ao mesmo cliente.");
      if (createsCompanyCycle(body.id || "", String(body.parentCompanyId), new Map(entities.companies.map((item) => [item.id, item])))) throw new Error("A empresa contratante criaria um ciclo na hierarquia.");
    }
    const projectIds=(body.projectIds as string[]||[]);
    if(projectIds.some(id=>!entities.projects.some(project=>project.id===id&&project.clientId===body.clientId&&project.active)))throw new Error("Todos os projetos selecionados devem estar ativos e pertencer ao cliente da empresa.");
  }
  if(entity==="vehicles"){
    const companies=entities.companies.filter(item=>entityCompanyIds(body).includes(item.id));
    if(!entities.projects.some(project=>project.id===body.projectId&&project.active)||!companies.some(company=>(company.projectIds as string[]||[]).includes(String(body.projectId))))throw new Error("O projeto deve estar ativo e autorizado em ao menos uma das empresas vinculadas.");
    if((body.driverIds as string[]||[]).some(id=>!entities.drivers.some(driver=>driver.id===id&&sharesCompany(driver,body)&&driver.active)))throw new Error("Todos os motoristas selecionados devem atender ao menos uma das empresas do veículo.");
  }
}
function mockVehicleInspections(vehicleId: string) {
  return inspections.filter((item) => item.vehicleId === vehicleId || item.snapshot?.vehicle?.id === vehicleId).map((item) => ({ ...item, vehicleId }));
}
function mockSequence(vehicleId: string, requested: unknown, currentId?: string): number {
  const history = mockVehicleInspections(vehicleId);
  const effective = effectiveInspectionSequences(history);
  const others = [...effective].filter(([id]) => id !== currentId).map(([, sequence]) => sequence);
  const sequence = persistedSequence(requested) ?? (currentId ? effective.get(currentId) : undefined) ?? nextInspectionSequence(others);
  if (requested !== undefined && requested !== null && requested !== "" && persistedSequence(requested) === null) throw new Error("Informe uma sequência inteira entre 1 e 9999.");
  if (others.includes(sequence)) throw new Error(`Já existe a ${sequence}ª vistoria para este veículo. Informe outra sequência.`);
  // Congela as legadas do veículo, como no servidor.
  for (const item of inspections) if ((item.vehicleId === vehicleId || item.snapshot?.vehicle?.id === vehicleId) && item.id !== currentId && item.deleted !== true && persistedSequence(item.sequence) === null) item.sequence = effective.get(item.id);
  return sequence;
}
function mockCalculate(items: Array<{ status: string }>) {
  const applicable = items.filter((item) => item.status !== "nao_se_aplica"); const compliant = items.filter((item) => item.status === "conforme").length;
  const percentage = applicable.length ? Number((compliant / applicable.length * 100).toFixed(1)) : 0;
  return { result: percentage >= 90 ? "APROVADO" as const : "REPROVADO" as const, compliancePercentage: percentage };
}export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const [pathname, queryString] = path.split("?");
  if (pathname === "/auth/me") return { user: mockUser } as T;
  if (pathname === "/dashboard") {
    const timeline = summarizeInspectionTimeline(inspections);
    return { metrics: { inspections: timeline.inspections.length, vehicles: entities.vehicles.length, drivers: entities.drivers.length, companies: entities.companies.length, pendingVehicles: timeline.pendingVehicles }, recentInspections: timeline.recentInspections, alerts: countDocumentStatuses(documents, 30) } satisfies DashboardData as T;
  }
  if (pathname === "/inspections/sequence" && (!init?.method || init.method === "GET")) {
    const query = new URLSearchParams(queryString || "");
    return vehicleSequenceSummary(mockVehicleInspections(String(query.get("vehicleId") || "")), query.get("excludeId")) as T;
  }
  if (pathname === "/inspections" && (!init?.method || init.method === "GET")) {
    const query = new URLSearchParams(queryString || "");
    const filtered = summarizeInspectionTimeline(inspections).inspections.filter((inspection) => {
      const snapshot = inspection.snapshot || {};
      const byId = (name: string, expected: string | null) => !expected || String(snapshot[name]?.id || "") === expected;
      return (!query.get("startDate") || inspection.inspectionDate >= query.get("startDate")!)
        && (!query.get("endDate") || inspection.inspectionDate <= query.get("endDate")!)
        && byId("client", query.get("clientId")) && byId("company", query.get("companyId"))
        && byId("project", query.get("projectId")) && byId("vehicle", query.get("vehicleId"))
        && byId("driver", query.get("driverId"))
        && (!query.get("plate") || String(inspection.plate || "").toUpperCase().includes(query.get("plate")!.toUpperCase()))
        && (!query.get("result") || inspection.result === query.get("result"));
    });
    return page(filtered) as T;
  }
  if (pathname.startsWith("/inspections/") && init?.method === "DELETE") {
    // Exclusão definitiva: nada bloqueia; fotos e vínculos saem junto com a vistoria.
    const id = pathname.split("/")[2]; const current = inspections.find((item) => item.id === id);
    if (!current) throw new Error("Vistoria não encontrada.");
    const vehicleId = current.vehicleId || String(current.snapshot?.vehicle?.id || "");
    if (vehicleId) {
      const effective = effectiveInspectionSequences(mockVehicleInspections(vehicleId));
      for (const item of inspections) if (item.id !== id && (item.vehicleId === vehicleId || item.snapshot?.vehicle?.id === vehicleId) && item.deleted !== true && persistedSequence(item.sequence) === null) item.sequence = effective.get(item.id);
    }
    inspections = inspections.filter((item) => item.id !== id);
    return { id: current.id, code: current.code, purged: true, removedPhotos: current.photos?.length || 0, removedApprovals: 0, removedCredentials: 0, pendingStoragePaths: [] } as T;
  }
  if (pathname.startsWith("/inspections/") && (!init?.method || init.method === "GET")) {
    const current = inspections.find((item) => item.id === pathname.split("/")[2]);
    if (!current) throw new Error("Vistoria não encontrada.");
    if (current.deleted) throw new Error("Vistoria excluída.");
    return (summarizeInspectionTimeline(inspections).inspections.find((item) => item.id === current.id) || current) as T;
  }
  if (pathname === "/inspections" && init?.method === "POST") {
    const body = JSON.parse(String(init.body)); const calculation = mockCalculate(body.items);
    const vehicle = entities.vehicles.find((item) => item.id === body.vehicleId)!; const company = entities.companies.find((item) => item.id === body.companyId)!; const driver = entities.drivers.find((item) => item.id === body.driverId)!; const project = entities.projects.find((item) => item.id === body.projectId)!;
    if (!isLinkedToCompany(vehicle, company?.id) || !isLinkedToCompany(driver, company?.id)) throw new Error("Os vínculos operacionais informados não são compatíveis.");
    const sequence = mockSequence(vehicle.id, body.sequence);
    const globalCode = inspections.reduce((highest, item) => Math.max(highest, Number(/^VST-(\d+)$/.exec(item.code)?.[1] || 0)), 0) + 1;
    const created: Inspection = { id: crypto.randomUUID(), ...body, code: `VST-${String(globalCode).padStart(6, "0")}`, sequence, createdAt: new Date().toISOString(), ...calculation, companyName: company.legalName as string, clientName: "Klabin", driverName: driver.name as string, projectName: project.name as string, inspectorName: mockUser.name, plate: vehicle.plate as string, snapshot: { client: entities.clients[0], company, driver, project, vehicle, accessProfile: entities.accessProfiles[0] }, photos: body.photos || [] };
    inspections = [created, ...inspections]; return created as T;
  }
  if (pathname.startsWith("/inspections/") && init?.method === "PUT") {
    const id = pathname.split("/")[2]; const index = inspections.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Vistoria não encontrada.");
    const body = JSON.parse(String(init.body)); const vehicle = entities.vehicles.find((item) => item.id === body.vehicleId)!;
    const sequence = mockSequence(vehicle.id, body.sequence, id);
    inspections[index] = { ...inspections[index], ...body, sequence, ...mockCalculate(body.items), photos: inspections[index].photos };
    return inspections[index] as T;
  }
  if (pathname === "/exports/inspections") return summarizeInspectionTimeline(inspections).inspections.map((i) => ({ ID_Vistoria: i.id, Codigo: i.code, Sequencia_Veiculo: i.sequence, Data: i.inspectionDate, Hora: i.inspectionTime, Fiscalizador: i.inspectorName, Cliente: i.clientName, Empresa: i.companyName, Motorista: i.driverName, Placa: i.plate, Quilometragem: i.mileage, Conformidade_Percentual: i.compliancePercentage, Resultado_Vistoria: i.result, Observacoes: i.generalObservations })) as T;
  if (pathname === "/settings") return { minimumInspectionCompliance: 90, maximumFleetAge: 12, expiryAlertDays: 30, allowProvisionalLicense: false, blockVehicleForAnyIrregularDriver: false, credentialMaximumDays: 365, documentRequirements: [], credentialDimensions: [] } as T;
  if (pathname === "/files/complete" && init?.method === "POST") {
    const body = JSON.parse(String(init.body || "{}"));
    if (body.kind === "vehicle-cover") {
      const vehicle = entities.vehicles.find((item) => item.id === body.entityId);
      if (vehicle) vehicle.coverBlobPath = body.blobPath;
      return { id: body.entityId } as T;
    }
    if (body.kind === "client-branding" || body.kind === "company-branding") {
      const source = body.kind === "client-branding" ? entities.clients : entities.companies;
      const record = source.find((item) => item.id === body.entityId);
      if (record) record.logoBlobPath = body.kind === "client-branding" ? "/assets/logo-klabin.png" : body.blobPath;
      return { id: body.entityId } as T;
    }
    const entityType = String(body.kind).replace("-document", "") as "company" | "driver" | "vehicle";
    if (["company", "driver", "vehicle"].includes(entityType)) {
      const source = entityType === "company" ? entities.companies : entityType === "driver" ? entities.drivers : entities.vehicles;
      const related = source.find((item) => item.id === body.entityId)!;
      const companyIds = entityType === "company" ? [related.id] : entityCompanyIds(related);
      const company = entities.companies.find((item) => item.id === companyIds[0])!;
      const client = entities.clients.find((item) => item.id === company.clientId)!;
      const expiryDate = body.expiryDate || null;
      const documentStatus = classifyDocumentExpiry(expiryDate, 30);
      const created: DocumentRecord = {
        id: crypto.randomUUID(), entityType, entityId: body.entityId, clientId: client.id, clientName: String(client.name),
        companyId: company.id, companyIds, companyName: entities.companies.filter((item) => companyIds.includes(item.id)).map((item) => String(item.tradeName || item.legalName)).join(", "), entityName: String(related.legalName || related.name || `${related.plate} · ${related.brand} ${related.model}`),
        entityIdentifier: String(related.document || related.registration || related.plate || ""), documentType: body.documentType || "other",
        label: body.label || body.fileName, fileName: body.fileName, mimeType: body.mimeType, size: body.size,
        issueDate: body.issueDate || null, expiryDate, observation: body.observation || "", documentStatus,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), url: "#"
      };
      documents = [created, ...documents];
      return { id: created.id } as T;
    }
  }
  if (pathname === "/documents" && (!init?.method || init.method === "GET")) {
    const query = new URLSearchParams(queryString || "");
    return documents.map((document) => ({ ...document, documentStatus: classifyDocumentExpiry(document.expiryDate, 30) })).filter((document) => ["entityType", "entityId", "clientId", "companyId", "documentType", "status"].every((key) => {
      if (key === "companyId") return !query.get(key) || (document.companyIds || [document.companyId]).includes(query.get(key)!);
      const expected = query.get(key); const actual = key === "status" ? document.documentStatus : document[key as keyof DocumentRecord];
      return !expected || String(actual) === expected;
    }) && (!query.get("search") || `${document.label} ${document.fileName} ${document.entityName} ${document.entityIdentifier}`.toLowerCase().includes(query.get("search")!.toLowerCase()))) as T;
  }
  if (pathname.startsWith("/documents/") && init?.method === "PUT") {
    const id = pathname.split("/")[2]; const body = JSON.parse(String(init.body || "{}"));
    documents = documents.map((document) => document.id === id ? { ...document, ...body, updatedAt: new Date().toISOString() } : document);
    return undefined as T;
  }
  if (pathname.startsWith("/files/") && init?.method === "DELETE") {
    const id = pathname.split("/")[2]; documents = documents.filter((document) => document.id !== id); return undefined as T;
  }
  if (pathname.startsWith("/clients/") && pathname.endsWith("/logo") && init?.method === "DELETE") {
    const client = entities.clients.find((item) => item.id === pathname.split("/")[2]); if (client) client.logoBlobPath = null; return undefined as T;
  }
  if (pathname.startsWith("/companies/") && pathname.endsWith("/logo") && init?.method === "DELETE") {
    const company = entities.companies.find((item) => item.id === pathname.split("/")[2]); if (company) company.logoBlobPath = null; return undefined as T;
  }
  if (pathname.startsWith("/vehicles/") && pathname.endsWith("/cover") && init?.method === "DELETE") {
    const vehicle = entities.vehicles.find((item) => item.id === pathname.split("/")[2]); if (vehicle) vehicle.coverBlobPath = null; return undefined as T;
  }
  if (pathname === "/credentials/eligibility") {
    const query = new URLSearchParams(queryString || "");
    const credential = { vehicleId: ids.vehicle, driverId: ids.driver, plate: "ABC1D23", brand: "Volkswagen", model: "Delivery 11.180", vehicleType: "Caminhão", clientId: ids.client, clientName: "Klabin", clientLogoBlobPath: entities.clients[0].logoBlobPath, companyId: ids.company, companyName: "Transportes Horizonte Ltda.", driverName: "Carlos Eduardo Lima", registration: "M-1842", licenseCategory: "D", licenseExpiry: "2027-09-30", accessProfileId: ids.profile, accessProfileName: "Operacional", accessProfileDescription: "Acesso às áreas operacionais", accessProfileColor: "#0056A4", credentialCode: "MGV-ABC1D23-00000000-0000", eligible: true, reasons: [], credentialValidUntil: "2027-08-23", inspectionDate: inspections.find((item) => item.vehicleId === ids.vehicle || item.snapshot?.vehicle?.id === ids.vehicle)?.inspectionDate || null };
    const matches = ["clientId", "companyId", "vehicleId", "accessProfileId"].every((key) => !query.get(key) || String(credential[key as keyof typeof credential]) === query.get(key));
    return (matches ? [credential] : []) as T;
  }
  const entity = pathname.split("/")[1]; const id = pathname.split("/")[2];
  if (entities[entity]) {
    if (!init?.method || init.method === "GET") return (id ? entities[entity].find((item) => item.id === id) : page(entities[entity])) as T;
    const body = JSON.parse(String(init.body || "{}"));
    if (init.method === "POST") { if(entity==="clients"&&entities.clients.some(item=>onlyDigits(item.document)===onlyDigits(body.document)))throw new Error("Já existe um cliente cadastrado com este CNPJ.");normalizeMockCompanyLinks(entity,body);assertMockRelationships(entity,body);const created = { id: crypto.randomUUID(), ...body }; entities[entity].push(created); return created as T; }
    if (init.method === "PUT") { const index = entities[entity].findIndex((item) => item.id === id);const updated={...entities[entity][index],...body};normalizeMockCompanyLinks(entity,updated);assertMockRelationships(entity,updated);entities[entity][index] = updated; return entities[entity][index] as T; }
  }
  if (queryString) void queryString;
  throw new Error("Rota de demonstração não implementada.");
}
