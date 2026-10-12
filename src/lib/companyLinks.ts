// Vínculos de empresa de veículos e motoristas (espelho de functions/src/companyLinks.ts).
// `companyIds` lista as empresas atendidas; `companyId` é a empresa principal e o único campo dos registros legados.
type CompanyLinked = { companyId?: unknown; companyIds?: unknown; [key: string]: unknown } | null | undefined;

export function entityCompanyIds(record: CompanyLinked): string[] {
  if (!record) return [];
  const list = Array.isArray(record.companyIds) ? record.companyIds.map(String).filter(Boolean) : [];
  const primary = typeof record.companyId === "string" && record.companyId ? record.companyId : "";
  return [...new Set(list.length ? list : primary ? [primary] : [])];
}

export function isLinkedToCompany(record: CompanyLinked, companyId: string | null | undefined): boolean {
  return Boolean(companyId) && entityCompanyIds(record).includes(String(companyId));
}

export function sharesCompany(left: CompanyLinked, right: CompanyLinked): boolean {
  const rightIds = new Set(entityCompanyIds(right));
  return entityCompanyIds(left).some((id) => rightIds.has(id));
}

/** Empresa principal: mantém a atual quando ela continua selecionada; senão, a primeira selecionada. */
export function primaryCompanyId(currentPrimary: unknown, selected: string[]): string {
  const current = typeof currentPrimary === "string" ? currentPrimary : "";
  return current && selected.includes(current) ? current : selected[0] || "";
}
