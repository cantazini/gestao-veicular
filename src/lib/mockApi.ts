import { newChecklist } from "../data/checklist";
import type { DashboardData, DocumentRecord, Entity, Inspection, PageResult, User } from "../types";
import { onlyDigits } from "./format";

const ids = { client: "00000000-0000-4000-8000-000000000010", project: "00000000-0000-4000-8000-000000000020", company: "00000000-0000-4000-8000-000000000030", profile: "00000000-0000-4000-8000-000000000040", driver: "00000000-0000-4000-8000-000000000050", vehicle: "00000000-0000-4000-8000-000000000060", inspection: "00000000-0000-4000-8000-000000000070" };
const entities: Record<string, Entity[]> = {
  clients: [{ id: ids.client, name: "Klabin", legalName: "Klabin S.A.", document: "89.637.490/0001-45", logoBlobPath: "/assets/logo-klabin.png", active: true }],
  projects: [{ id: ids.project, clientId: ids.client, name: "Operação Florestal", code: "OF-01", active: true }],
  companies: [{ id: ids.company, clientId: ids.client, legalName: "Transportes Horizonte Ltda.", tradeName: "Horizonte", document: "12.345.678/0001-90", unit: "Telêmaco Borba", managerName: "Marina Alves", contractNumber: "CT-2026-014", contractType: "direct", projectIds: [ids.project], active: true }],
  drivers: [{ id: ids.driver, companyId: ids.company, name: "Carlos Eduardo Lima", registration: "M-1842", jobTitle: "Motorista", licenseCategory: "D", licenseNumber: "•••• 7384", licenseExpiry: "2027-09-30", provisionalLicense: false, active: true }],
  accessProfiles: [{ id: ids.profile, clientId: ids.client, name: "Operacional", description: "Acesso às áreas operacionais", color: "#0056A4", gates: ["Portaria principal"], areas: ["Pátio", "Oficina"], active: true }],
  vehicles: [{ id: ids.vehicle, companyId: ids.company, projectId: ids.project, accessProfileId: ids.profile, plate: "ABC1D23", brand: "Volkswagen", model: "Delivery 11.180", year: 2024, type: "Caminhão", color: "Branco", fuel: "Diesel", mileage: 18452, ownership: "owned", driverIds: [ids.driver], inspectionSequence: 12, active: true }],
  users: [{ id: "00000000-0000-4000-8000-000000000001", identityProviderId: "local-admin", email: "admin@local.test", name: "Administrador local", role: "admin", active: true }]
};
const inspectionItems = newChecklist();
inspectionItems[21] = { ...inspectionItems[21], status: "nao_conforme", observation: "Pequeno indício de vazamento próximo ao cárter." };
let inspections: Inspection[] = [{ id: ids.inspection, code: "VIST-ABC1D23-012", inspectionDate: new Date().toISOString().slice(0,10), inspectionTime: "09:35", mileage: 18452, result: "APROVADO", compliancePercentage: 97.4, companyName: "Transportes Horizonte Ltda.", clientName: "Klabin", projectName: "Operação Florestal", driverName: "Carlos Eduardo Lima", inspectorName: "Administrador local", plate: "ABC1D23", generalObservations: "Veículo liberado com orientação de acompanhamento preventivo.", snapshot: { client: { id: ids.client, name: "Klabin", logoBlobPath: "/assets/logo-klabin.png" }, company: entities.companies[0], project: entities.projects[0], driver: entities.drivers[0], vehicle: entities.vehicles[0], accessProfile: entities.accessProfiles[0] }, items: inspectionItems, photos: [] }];
let documents: DocumentRecord[] = [];

export const mockUser: User = { id: "00000000-0000-4000-8000-000000000001", name: "Administrador local", email: "admin@local.test", role: "admin" };

function page<T>(items: T[]): PageResult<T> { return { items, page: 1, pageSize: 100, total: items.length }; }
function assertMockRelationships(entity:string,body:Entity):void{
  if(["projects","companies"].includes(entity)&&!entities.clients.some(item=>item.id===body.clientId&&item.active))throw new Error("Selecione um cliente ativo e válido.");
  if(["drivers","vehicles"].includes(entity)&&!entities.companies.some(item=>item.id===body.companyId&&item.active))throw new Error("Selecione uma empresa ativa e válida.");
  if(entity==="companies"){
    const projectIds=(body.projectIds as string[]||[]);
    if(projectIds.some(id=>!entities.projects.some(project=>project.id===id&&project.clientId===body.clientId&&project.active)))throw new Error("Todos os projetos selecionados devem estar ativos e pertencer ao cliente da empresa.");
  }
  if(entity==="vehicles"){
    const company=entities.companies.find(item=>item.id===body.companyId);
    if(!entities.projects.some(project=>project.id===body.projectId&&project.clientId===company?.clientId&&project.active)||(company?.projectIds as string[]||[]).includes(String(body.projectId))===false)throw new Error("O projeto deve estar ativo e vinculado à empresa selecionada.");
    if((body.driverIds as string[]||[]).some(id=>!entities.drivers.some(driver=>driver.id===id&&driver.companyId===body.companyId&&driver.active)))throw new Error("Todos os motoristas selecionados devem pertencer à empresa do veículo.");
  }
}
export async function mockRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const [pathname, queryString] = path.split("?");
  if (pathname === "/auth/me") return { user: mockUser } as T;
  if (pathname === "/dashboard") return { metrics: { inspections: inspections.length, vehicles: entities.vehicles.length, drivers: entities.drivers.length, companies: entities.companies.length, rejected: inspections.filter((i) => i.result === "REPROVADO").length }, recentInspections: inspections.slice(0,8), alerts: { expiringDocuments: 2 } } satisfies DashboardData as T;
  if (pathname === "/inspections" && (!init?.method || init.method === "GET")) {
    const query = new URLSearchParams(queryString || "");
    const filtered = inspections.filter((inspection) => {
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
  if (pathname.startsWith("/inspections/") && (!init?.method || init.method === "GET")) return inspections.find((item) => item.id === pathname.split("/")[2]) as T;
  if (pathname === "/inspections" && init?.method === "POST") {
    const body = JSON.parse(String(init.body)); const items = body.items; const applicable = items.filter((item: {status:string}) => item.status !== "nao_se_aplica"); const compliant = items.filter((item: {status:string}) => item.status === "conforme").length; const percentage = applicable.length ? Number((compliant / applicable.length * 100).toFixed(1)) : 0;
    const vehicle = entities.vehicles.find((item) => item.id === body.vehicleId)!; const company = entities.companies.find((item) => item.id === body.companyId)!; const driver = entities.drivers.find((item) => item.id === body.driverId)!; const project = entities.projects.find((item) => item.id === body.projectId)!;
    const created: Inspection = { id: crypto.randomUUID(), code: `VIST-${vehicle.plate}-${String(inspections.length + 13).padStart(3,"0")}`, ...body, result: percentage >= 90 ? "APROVADO" : "REPROVADO", compliancePercentage: percentage, companyName: company.legalName as string, clientName: "Klabin", driverName: driver.name as string, projectName: project.name as string, inspectorName: mockUser.name, plate: vehicle.plate as string, snapshot: { client: entities.clients[0], company, driver, project, vehicle, accessProfile: entities.accessProfiles[0] }, photos: body.photos || [] };
    inspections = [created, ...inspections]; return created as T;
  }
  if (pathname === "/exports/inspections") return inspections.map((i) => ({ ID_Vistoria: i.id, Codigo: i.code, Data: i.inspectionDate, Hora: i.inspectionTime, Fiscalizador: i.inspectorName, Cliente: i.clientName, Empresa: i.companyName, Motorista: i.driverName, Placa: i.plate, Quilometragem: i.mileage, Conformidade_Percentual: i.compliancePercentage, Resultado_Vistoria: i.result, Observacoes: i.generalObservations })) as T;
  if (pathname === "/settings") return { minimumInspectionCompliance: 90, maximumFleetAge: 12, expiryAlertDays: 30, allowProvisionalLicense: false, blockVehicleForAnyIrregularDriver: false, credentialMaximumDays: 365, documentRequirements: [], credentialDimensions: [] } as T;
  if (pathname === "/files/complete" && init?.method === "POST") {
    const body = JSON.parse(String(init.body || "{}"));
    if (body.kind === "client-branding") {
      const client = entities.clients.find((item) => item.id === body.entityId);
      if (client) client.logoBlobPath = "/assets/logo-klabin.png";
      return { id: body.entityId } as T;
    }
    const entityType = String(body.kind).replace("-document", "") as "company" | "driver" | "vehicle";
    if (["company", "driver", "vehicle"].includes(entityType)) {
      const source = entityType === "company" ? entities.companies : entityType === "driver" ? entities.drivers : entities.vehicles;
      const related = source.find((item) => item.id === body.entityId)!;
      const company = entityType === "company" ? related : entities.companies.find((item) => item.id === related.companyId)!;
      const client = entities.clients.find((item) => item.id === company.clientId)!;
      const expiryDate = body.expiryDate || null;
      const today = new Date().toISOString().slice(0, 10);
      const warning = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const documentStatus = !expiryDate || expiryDate > warning ? "VALID" : expiryDate < today ? "EXPIRED" : "EXPIRING";
      const created: DocumentRecord = {
        id: crypto.randomUUID(), entityType, entityId: body.entityId, clientId: client.id, clientName: String(client.name),
        companyId: company.id, companyName: String(company.legalName), entityName: String(related.legalName || related.name || `${related.plate} · ${related.brand} ${related.model}`),
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
    return documents.filter((document) => ["entityType", "entityId", "clientId", "companyId", "documentType", "status"].every((key) => {
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
  if (pathname === "/credentials/eligibility") {
    const query = new URLSearchParams(queryString || "");
    const credential = { vehicleId: ids.vehicle, driverId: ids.driver, plate: "ABC1D23", brand: "Volkswagen", model: "Delivery 11.180", vehicleType: "Caminhão", clientId: ids.client, clientName: "Klabin", clientLogoBlobPath: entities.clients[0].logoBlobPath, companyId: ids.company, companyName: "Transportes Horizonte Ltda.", driverName: "Carlos Eduardo Lima", registration: "M-1842", licenseCategory: "D", licenseExpiry: "2027-09-30", accessProfileId: ids.profile, accessProfileName: "Operacional", accessProfileDescription: "Acesso às áreas operacionais", accessProfileColor: "#0056A4", credentialCode: "MGV-ABC1D23-00000000-0000", eligible: true, reasons: [], credentialValidUntil: "2027-08-23" };
    const matches = ["clientId", "companyId", "vehicleId", "accessProfileId"].every((key) => !query.get(key) || String(credential[key as keyof typeof credential]) === query.get(key));
    return (matches ? [credential] : []) as T;
  }
  const entity = pathname.split("/")[1]; const id = pathname.split("/")[2];
  if (entities[entity]) {
    if (!init?.method || init.method === "GET") return (id ? entities[entity].find((item) => item.id === id) : page(entities[entity])) as T;
    const body = JSON.parse(String(init.body || "{}"));
    if (init.method === "POST") { if(entity==="clients"&&entities.clients.some(item=>onlyDigits(item.document)===onlyDigits(body.document)))throw new Error("Já existe um cliente cadastrado com este CNPJ.");assertMockRelationships(entity,body);const created = { id: crypto.randomUUID(), ...body }; entities[entity].push(created); return created as T; }
    if (init.method === "PUT") { const index = entities[entity].findIndex((item) => item.id === id);const updated={...entities[entity][index],...body};assertMockRelationships(entity,updated);entities[entity][index] = updated; return entities[entity][index] as T; }
  }
  if (queryString) void queryString;
  throw new Error("Rota de demonstração não implementada.");
}
