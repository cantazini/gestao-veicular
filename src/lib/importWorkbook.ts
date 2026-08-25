import type { Entity } from "../types";
import { onlyDigits } from "./format";

export type ImportEntity = "clients" | "projects" | "companies" | "accessProfiles" | "drivers" | "vehicles";
export type ImportStatus = "valid" | "invalid" | "imported" | "failed";
export interface ImportCandidate {
  id: string;
  entity: ImportEntity;
  sheet: string;
  rowNumber: number;
  description: string;
  status: ImportStatus;
  errors: string[];
  data: Record<string, unknown>;
}
export type ImportWorkbookRows = Record<string, Record<string, unknown>[]>;
export type ExistingEntities = Record<ImportEntity, Entity[]>;

export const IMPORT_TEMPLATE: Record<string, string[]> = {
  Clientes: ["Razao_Social", "Nome_Fantasia", "CNPJ", "Ativo"],
  Projetos: ["Cliente_CNPJ", "Nome", "Codigo", "Ativo"],
  Empresas: ["Cliente_CNPJ", "Razao_Social", "Nome_Fantasia", "CNPJ", "Unidade", "Responsavel", "Numero_Contrato", "Tipo_Contrato", "Empresa_Contratante_CNPJ", "Projetos_Codigos", "Ativo"],
  Perfis_Acesso: ["Cliente_CNPJ", "Nome", "Descricao", "Cor", "Portarias", "Areas", "Ativo"],
  Motoristas: ["Empresa_CNPJ", "Nome", "Matricula", "Funcao", "Categoria_CNH", "Numero_CNH", "Validade_CNH", "CNH_Provisoria", "Ativo"],
  Veiculos: ["Empresa_CNPJ", "Projeto_Codigo", "Perfil_Acesso", "Placa", "Marca", "Modelo", "Ano", "Tipo", "Cor", "Combustivel", "Quilometragem", "Propriedade", "Locadora", "Motoristas_Matriculas", "Ativo"]
};

const order: { sheet: string; entity: ImportEntity }[] = [
  { sheet: "Clientes", entity: "clients" }, { sheet: "Projetos", entity: "projects" },
  { sheet: "Empresas", entity: "companies" }, { sheet: "Perfis_Acesso", entity: "accessProfiles" },
  { sheet: "Motoristas", entity: "drivers" }, { sheet: "Veiculos", entity: "vehicles" }
];

const value = (row: Record<string, unknown>, key: string) => String(row[key] ?? "").trim();
const normalized = (input: unknown) => String(input ?? "").trim().toUpperCase();
const list = (input: unknown) => String(input ?? "").split(/[;,]/).map((item) => item.trim()).filter(Boolean);
const boolean = (input: unknown, fallback = true) => {
  const text = normalized(input);
  if (!text) return fallback;
  return !["NAO", "NÃO", "N", "0", "FALSE", "INATIVO"].includes(text);
};
const validCnpj = (input: unknown) => {
  const document = onlyDigits(input);
  if (document.length !== 14 || /^(\d)\1+$/.test(document)) return false;
  const digit = (length: number) => {
    let sum = 0; let weight = length - 7;
    for (let index = 0; index < length; index += 1) { sum += Number(document[index]) * weight--; if (weight < 2) weight = 9; }
    const remainder = sum % 11; return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(12) === Number(document[12]) && digit(13) === Number(document[13]);
};
const validDate = (input: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(input ?? ""));
const uniqueError = (errors: string[], found: boolean, message: string) => { if (found) errors.push(message); };

export async function readWorkbook(file: File): Promise<ImportWorkbookRows> {
  if (!/\.xlsx?$/i.test(file.name)) throw new Error("Selecione uma planilha Excel no formato XLSX.");
  if (file.size > 10 * 1024 * 1024) throw new Error("A planilha deve ter no máximo 10 MB.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  return Object.fromEntries(workbook.SheetNames.map((sheet) => [sheet, XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet], { defval: "", raw: false })]));
}

export function analyzeImportRows(workbook: ImportWorkbookRows, existing: ExistingEntities): ImportCandidate[] {
  const result: ImportCandidate[] = [];
  const clientIds = new Map(existing.clients.filter((item) => item.active).map((item) => [onlyDigits(item.document), String(item.id)]));
  const clientDocuments = new Set(clientIds.keys());
  const projectIds = new Map<string, string>();
  existing.projects.filter((item) => item.active).forEach((item) => {
    const clientDocument = [...clientIds].find(([, id]) => id === item.clientId)?.[0];
    if (clientDocument) projectIds.set(`${clientDocument}|${normalized(item.code)}`, String(item.id));
  });
  const companyIds = new Map(existing.companies.filter((item) => item.active).map((item) => [onlyDigits(item.document), String(item.id)]));
  const companyClients = new Map(existing.companies.filter((item) => item.active).map((item) => {
    const clientDocument = [...clientIds].find(([, id]) => id === item.clientId)?.[0] || "";
    return [onlyDigits(item.document), clientDocument];
  }));
  const companyProjects = new Map<string, Set<string>>();
  existing.companies.filter((item) => item.active).forEach((company) => {
    const clientDocument = companyClients.get(onlyDigits(company.document)) || "";
    const codes = existing.projects.filter((project) => (company.projectIds as string[] || []).includes(project.id)).map((project) => normalized(project.code));
    companyProjects.set(onlyDigits(company.document), new Set(codes.map((code) => `${clientDocument}|${code}`)));
  });
  const driverIds = new Map(existing.drivers.filter((item) => item.active).map((item) => {
    const companyDocument = [...companyIds].find(([, id]) => id === item.companyId)?.[0] || "";
    return [`${companyDocument}|${normalized(item.registration)}`, String(item.id)];
  }));
  const profileIds = new Map(existing.accessProfiles.filter((item) => item.active).map((item) => {
    const clientDocument = [...clientIds].find(([, id]) => id === item.clientId)?.[0] || "";
    return [`${clientDocument}|${normalized(item.name)}`, String(item.id)];
  }));
  const plates = new Set(existing.vehicles.map((item) => normalized(item.plate).replace(/[^A-Z0-9]/g, "")));

  const push = (entity: ImportEntity, sheet: string, index: number, description: string, errors: string[], data: Record<string, unknown>) => {
    const candidate: ImportCandidate = { id: `${sheet}-${index + 2}`, entity, sheet, rowNumber: index + 2, description, status: errors.length ? "invalid" : "valid", errors, data };
    result.push(candidate); return candidate;
  };

  for (const { sheet, entity } of order) {
    const rows = workbook[sheet] || [];
    rows.forEach((row, index) => {
      const errors: string[] = [];
      if (entity === "clients") {
        const document = onlyDigits(value(row, "CNPJ")); const legalName = value(row, "Razao_Social"); const name = value(row, "Nome_Fantasia");
        if (!legalName) errors.push("Razão social obrigatória."); if (!name) errors.push("Nome fantasia obrigatório."); if (!validCnpj(document)) errors.push("CNPJ inválido.");
        uniqueError(errors, clientDocuments.has(document), "CNPJ de cliente já cadastrado ou repetido na planilha.");
        const candidate = push(entity, sheet, index, name || legalName || document, errors, { document, legalName, name, active: boolean(row.Ativo) });
        if (candidate.status === "valid") clientDocuments.add(document);
      }
      if (entity === "projects") {
        const clientDocument = onlyDigits(value(row, "Cliente_CNPJ")); const code = value(row, "Codigo"); const name = value(row, "Nome"); const key = `${clientDocument}|${normalized(code)}`;
        if (!clientDocuments.has(clientDocument)) errors.push("Cliente não encontrado na base nem em uma linha válida da planilha."); if (!name) errors.push("Nome obrigatório."); if (!code) errors.push("Código obrigatório.");
        uniqueError(errors, projectIds.has(key), "Projeto já cadastrado ou repetido para este cliente.");
        const candidate = push(entity, sheet, index, code || name, errors, { clientDocument, code, name, active: boolean(row.Ativo) });
        if (candidate.status === "valid") projectIds.set(key, "__file__");
      }
      if (entity === "companies") {
        const clientDocument = onlyDigits(value(row, "Cliente_CNPJ")); const document = onlyDigits(value(row, "CNPJ")); const legalName = value(row, "Razao_Social"); const projectCodes = list(row.Projetos_Codigos); const projectKeys = projectCodes.map((code) => `${clientDocument}|${normalized(code)}`); const contractType = normalized(row.Tipo_Contrato) === "SUBCONTRATADO" ? "subcontractor" : "direct"; const parentDocument = onlyDigits(value(row, "Empresa_Contratante_CNPJ"));
        if (!clientDocuments.has(clientDocument)) errors.push("Cliente não encontrado."); if (!legalName) errors.push("Razão social obrigatória."); if (!validCnpj(document)) errors.push("CNPJ inválido."); if (!projectCodes.length) errors.push("Informe ao menos um projeto."); if (projectKeys.some((key) => !projectIds.has(key))) errors.push("Um ou mais projetos não pertencem ao cliente informado."); if (contractType === "subcontractor" && (!companyIds.has(parentDocument) || companyClients.get(parentDocument) !== clientDocument)) errors.push("Empresa contratante deve existir antes e pertencer ao mesmo cliente.");
        uniqueError(errors, companyIds.has(document), "Empresa já cadastrada ou repetida na planilha.");
        const candidate = push(entity, sheet, index, legalName || document, errors, { clientDocument, document, legalName, tradeName: value(row, "Nome_Fantasia"), unit: value(row, "Unidade"), managerName: value(row, "Responsavel"), contractNumber: value(row, "Numero_Contrato"), contractType, parentDocument, projectCodes, active: boolean(row.Ativo) });
        if (candidate.status === "valid") { companyIds.set(document, "__file__"); companyClients.set(document, clientDocument); companyProjects.set(document, new Set(projectKeys)); }
      }
      if (entity === "accessProfiles") {
        const clientDocument = onlyDigits(value(row, "Cliente_CNPJ")); const name = value(row, "Nome"); const key = `${clientDocument}|${normalized(name)}`; const color = value(row, "Cor") || "#0056A4";
        if (!clientDocuments.has(clientDocument)) errors.push("Cliente não encontrado."); if (!name) errors.push("Nome obrigatório."); if (!/^#[0-9A-F]{6}$/i.test(color)) errors.push("Cor inválida; use #RRGGBB."); uniqueError(errors, profileIds.has(key), "Perfil já cadastrado ou repetido para este cliente.");
        const candidate = push(entity, sheet, index, name, errors, { clientDocument, name, description: value(row, "Descricao"), color, gates: list(row.Portarias), areas: list(row.Areas), active: boolean(row.Ativo) });
        if (candidate.status === "valid") profileIds.set(key, "__file__");
      }
      if (entity === "drivers") {
        const companyDocument = onlyDigits(value(row, "Empresa_CNPJ")); const registration = value(row, "Matricula"); const name = value(row, "Nome"); const licenseExpiry = value(row, "Validade_CNH"); const key = `${companyDocument}|${normalized(registration)}`;
        if (!companyIds.has(companyDocument)) errors.push("Empresa não encontrada."); if (!name) errors.push("Nome obrigatório."); if (!registration) errors.push("Matrícula obrigatória."); if (!value(row, "Categoria_CNH")) errors.push("Categoria da CNH obrigatória."); if (!validDate(licenseExpiry)) errors.push("Validade da CNH deve usar AAAA-MM-DD."); uniqueError(errors, driverIds.has(key), "Matrícula já cadastrada ou repetida para esta empresa.");
        const candidate = push(entity, sheet, index, `${registration} · ${name}`, errors, { companyDocument, name, registration, jobTitle: value(row, "Funcao"), licenseCategory: value(row, "Categoria_CNH"), licenseNumber: value(row, "Numero_CNH"), licenseExpiry, provisionalLicense: boolean(row.CNH_Provisoria, false), active: boolean(row.Ativo) });
        if (candidate.status === "valid") driverIds.set(key, "__file__");
      }
      if (entity === "vehicles") {
        const companyDocument = onlyDigits(value(row, "Empresa_CNPJ")); const clientDocument = companyClients.get(companyDocument) || ""; const projectCode = value(row, "Projeto_Codigo"); const projectKey = `${clientDocument}|${normalized(projectCode)}`; const profileName = value(row, "Perfil_Acesso"); const profileKey = `${clientDocument}|${normalized(profileName)}`; const plate = normalized(row.Placa).replace(/[^A-Z0-9]/g, ""); const registrations = list(row.Motoristas_Matriculas); const year = Number(value(row, "Ano")); const mileage = Number(value(row, "Quilometragem"));
        if (!companyIds.has(companyDocument)) errors.push("Empresa não encontrada."); if (!projectIds.has(projectKey) || !companyProjects.get(companyDocument)?.has(projectKey)) errors.push("Projeto não está vinculado à empresa."); if (!profileIds.has(profileKey)) errors.push("Perfil de acesso não encontrado para o cliente."); if (!/^[A-Z0-9]{7}$/.test(plate)) errors.push("Placa inválida."); if (!value(row, "Marca") || !value(row, "Modelo")) errors.push("Marca e modelo são obrigatórios."); if (!Number.isInteger(year) || year < 1950 || year > 2200) errors.push("Ano inválido."); if (!Number.isInteger(mileage) || mileage < 0) errors.push("Quilometragem inválida."); if (registrations.some((registration) => !driverIds.has(`${companyDocument}|${normalized(registration)}`))) errors.push("Um ou mais motoristas não pertencem à empresa."); uniqueError(errors, plates.has(plate), "Placa já cadastrada ou repetida na planilha.");
        const candidate = push(entity, sheet, index, `${plate} · ${value(row, "Marca")} ${value(row, "Modelo")}`, errors, { companyDocument, clientDocument, projectCode, profileName, plate, brand: value(row, "Marca"), model: value(row, "Modelo"), year, type: value(row, "Tipo"), color: value(row, "Cor"), fuel: value(row, "Combustivel"), mileage, ownership: normalized(row.Propriedade) === "LOCADO" ? "rented" : "owned", rentalCompany: value(row, "Locadora"), registrations, active: boolean(row.Ativo) });
        if (candidate.status === "valid") plates.add(plate);
      }
    });
  }
  return result;
}

export async function executeImport(
  candidates: ImportCandidate[], existing: ExistingEntities,
  create: (entity: ImportEntity, payload: Record<string, unknown>) => Promise<Entity>,
  onResult: (id: string, status: "imported" | "failed", error?: string) => void
): Promise<void> {
  const clientIds = new Map(existing.clients.filter((item) => item.active).map((item) => [onlyDigits(item.document), String(item.id)]));
  const projectIds = new Map<string, string>();
  existing.projects.filter((item) => item.active).forEach((item) => { const document = [...clientIds].find(([, id]) => id === item.clientId)?.[0]; if (document) projectIds.set(`${document}|${normalized(item.code)}`, String(item.id)); });
  const companyIds = new Map(existing.companies.filter((item) => item.active).map((item) => [onlyDigits(item.document), String(item.id)]));
  const driverIds = new Map(existing.drivers.filter((item) => item.active).map((item) => { const document = [...companyIds].find(([, id]) => id === item.companyId)?.[0] || ""; return [`${document}|${normalized(item.registration)}`, String(item.id)]; }));
  const profileIds = new Map(existing.accessProfiles.filter((item) => item.active).map((item) => { const document = [...clientIds].find(([, id]) => id === item.clientId)?.[0] || ""; return [`${document}|${normalized(item.name)}`, String(item.id)]; }));

  for (const candidate of candidates.filter((item) => item.status === "valid")) {
    const data = candidate.data;
    try {
      let payload: Record<string, unknown> = { ...data };
      if (candidate.entity === "projects") { payload = { name: data.name, code: data.code, active: data.active, clientId: clientIds.get(String(data.clientDocument)) }; }
      if (candidate.entity === "companies") { const clientDocument = String(data.clientDocument); payload = { ...data, clientId: clientIds.get(clientDocument), projectIds: (data.projectCodes as string[]).map((code) => projectIds.get(`${clientDocument}|${normalized(code)}`)), parentCompanyId: data.parentDocument ? companyIds.get(String(data.parentDocument)) : "" }; delete payload.clientDocument; delete payload.parentDocument; delete payload.projectCodes; }
      if (candidate.entity === "accessProfiles") { const clientDocument = String(data.clientDocument); payload = { ...data, clientId: clientIds.get(clientDocument) }; delete payload.clientDocument; }
      if (candidate.entity === "drivers") { payload = { ...data, companyId: companyIds.get(String(data.companyDocument)) }; delete payload.companyDocument; }
      if (candidate.entity === "vehicles") { const companyDocument = String(data.companyDocument); const clientDocument = String(data.clientDocument); payload = { ...data, companyId: companyIds.get(companyDocument), projectId: projectIds.get(`${clientDocument}|${normalized(data.projectCode)}`), accessProfileId: profileIds.get(`${clientDocument}|${normalized(data.profileName)}`), driverIds: (data.registrations as string[]).map((registration) => driverIds.get(`${companyDocument}|${normalized(registration)}`)) }; ["companyDocument", "clientDocument", "projectCode", "profileName", "registrations"].forEach((key) => delete payload[key]); }
      const saved = await create(candidate.entity, payload);
      if (candidate.entity === "clients") clientIds.set(String(data.document), saved.id);
      if (candidate.entity === "projects") projectIds.set(`${data.clientDocument}|${normalized(data.code)}`, saved.id);
      if (candidate.entity === "companies") companyIds.set(String(data.document), saved.id);
      if (candidate.entity === "accessProfiles") profileIds.set(`${data.clientDocument}|${normalized(data.name)}`, saved.id);
      if (candidate.entity === "drivers") driverIds.set(`${data.companyDocument}|${normalized(data.registration)}`, saved.id);
      onResult(candidate.id, "imported");
    } catch (reason) { onResult(candidate.id, "failed", reason instanceof Error ? reason.message : "Falha ao importar a linha."); }
  }
}
