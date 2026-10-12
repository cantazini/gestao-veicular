import type { Entity } from "../types";

export type OrganizationKind = "clients" | "projects" | "companies";
export type OrganizationFilters = { search: string; name: string; document: string; clientId: string; code: string; unit: string; contractType: string; status: string };
export const EMPTY_ORGANIZATION_FILTERS: OrganizationFilters = { search: "", name: "", document: "", clientId: "", code: "", unit: "", contractType: "", status: "all" };
export const normalizeSearch = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
const compare = (a: unknown, b: unknown) => String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { sensitivity: "base", numeric: true });
export const organizationName = (item?: Entity) => String(item?.name || item?.legalName || "Cliente não disponível");
export const contractLabel = (value: unknown) => value === "direct" ? "Direto" : value === "subcontractor" ? "Subcontratado" : "Não informado";

export function filterOrganizations(items: Entity[], kind: OrganizationKind, filters: OrganizationFilters, sort: string, clients: Map<string, Entity>) {
  const contains = (value: unknown, term: string) => normalizeSearch(value).includes(normalizeSearch(term));
  const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
  return items.filter((item) => {
    const search = filters.search.trim();
    const matchesSearch = !search || [item.name, item.legalName].some((value) => contains(value, search)) ||
      (Boolean(digits(search)) && /^[\d\s./-]+$/.test(search) && digits(item.document).includes(digits(search)));
    return matchesSearch && contains(kind === "companies" ? item.legalName : item.name, filters.name) &&
      (!filters.document || (Boolean(digits(filters.document)) && digits(item.document).includes(digits(filters.document)))) &&
      (!filters.clientId || item.clientId === filters.clientId) && contains(item.code, filters.code) && contains(item.unit, filters.unit) &&
      (!filters.contractType || item.contractType === filters.contractType) &&
      (filters.status === "all" || (filters.status === "active" ? item.active === true : item.active !== true));
  }).sort((a, b) => {
    const field = sort.startsWith("code") ? "code" : kind === "companies" ? "legalName" : "name";
    const clientOrder = sort === "client" ? compare(organizationName(clients.get(String(a.clientId))), organizationName(clients.get(String(b.clientId)))) : 0;
    return clientOrder || compare(a[field], b[field]) * (sort.endsWith("desc") ? -1 : 1) || compare(a.id, b.id);
  });
}

/** Checks the whole ancestry, including malformed legacy cycles, without recursion. */
export function createsCompanyCycle(id: string, parentId: string, companies: Map<string, Entity>) {
  const visited = new Set(id ? [id] : []);
  let cursor = parentId;
  while (cursor) {
    if (visited.has(cursor)) return true;
    visited.add(cursor);
    cursor = String(companies.get(cursor)?.parentCompanyId || "");
  }
  return false;
}

export interface CompanyNode { company: Entity; children: CompanyNode[]; warning?: string }
export function companyForest(companies: Entity[]): CompanyNode[] {
  const byId = new Map(companies.map((item) => [item.id, item]));
  const nodes = new Map(companies.map((company) => [company.id, { company, children: [] } as CompanyNode]));
  const roots: CompanyNode[] = [];
  for (const company of companies) {
    const node = nodes.get(company.id)!;
    const parentId = String(company.parentCompanyId || "");
    const parent = byId.get(parentId);
    if (parentId && createsCompanyCycle(company.id, parentId, byId)) node.warning = "Hierarquia inconsistente: ciclo cadastrado";
    else if (parentId && (!parent || parent.clientId !== company.clientId)) node.warning = "Empresa contratante não disponível neste cliente";
    else if (company.contractType === "subcontractor" && !parentId) node.warning = "Hierarquia não informada";
    if (parent && !node.warning) nodes.get(parentId)!.children.push(node);
    else roots.push(node);
  }
  for (const node of nodes.values()) node.children.sort((a, b) => compare(a.company.legalName, b.company.legalName));
  return roots.sort((a, b) => compare(a.company.legalName, b.company.legalName));
}

export function searchCompanyForest(nodes: CompanyNode[], search: string): CompanyNode[] {
  const term = normalizeSearch(search);
  if (!term) return nodes;
  return nodes.flatMap((node) => {
    if (normalizeSearch(node.company.legalName).includes(term)) return [node];
    const children = searchCompanyForest(node.children, term);
    return children.length ? [{ ...node, children }] : [];
  });
}

export const COMPANY_VIEW_KEY = "meta.company-directory.view";
export function readCompanyView(storage?: Pick<Storage, "getItem">): "cards" | "list" {
  try { return storage?.getItem(COMPANY_VIEW_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; }
}
export function saveCompanyView(view: "cards" | "list", storage?: Pick<Storage, "setItem">) {
  try { storage?.setItem(COMPANY_VIEW_KEY, view); } catch { /* Storage can be unavailable; the current view still works. */ }
}
