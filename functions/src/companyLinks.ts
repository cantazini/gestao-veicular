// Vínculos de empresa de veículos e motoristas.
// `companyIds` é a lista de empresas atendidas; `companyId` permanece como empresa principal para
// retrocompatibilidade (registros legados só possuem `companyId`).
export const MAX_COMPANY_LINKS = 20;

export function linkedCompanyIds(record: { companyId?: unknown; companyIds?: unknown } | null | undefined): string[] {
  if (!record) return [];
  const list = Array.isArray(record.companyIds) ? record.companyIds.map(String).filter(Boolean) : [];
  const primary = typeof record.companyId === "string" && record.companyId ? record.companyId : "";
  const ordered = primary && list.length === 0 ? [primary] : list;
  return [...new Set(ordered)];
}

export function isLinkedToCompany(record: { companyId?: unknown; companyIds?: unknown } | null | undefined, companyId: string): boolean {
  return linkedCompanyIds(record).includes(companyId);
}

export function sharesCompany(left: { companyId?: unknown; companyIds?: unknown } | null | undefined, right: { companyId?: unknown; companyIds?: unknown } | null | undefined): boolean {
  const rightIds = new Set(linkedCompanyIds(right));
  return linkedCompanyIds(left).some((id) => rightIds.has(id));
}

/**
 * Normaliza a entrada do formulário/importação.
 * A empresa principal é `companyId` quando ela também está selecionada; caso contrário, a primeira da lista.
 * Retorna `null` quando nenhuma empresa foi informada.
 */
export function normalizeCompanyLinks(companyId: unknown, companyIds: unknown): { companyId: string; companyIds: string[] } | null {
  const list = [...new Set((Array.isArray(companyIds) ? companyIds : []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  const primary = typeof companyId === "string" ? companyId.trim() : "";
  const selected = list.length ? list : primary ? [primary] : [];
  if (!selected.length) return null;
  const main = primary && selected.includes(primary) ? primary : selected[0];
  return { companyId: main, companyIds: [main, ...selected.filter((id) => id !== main)] };
}
