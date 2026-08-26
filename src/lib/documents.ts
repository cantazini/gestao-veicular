import type { DocumentEntityType, DocumentStatus } from "../types";

export interface DocumentDateFields {
  issueDate?: string | null;
  expiryDate?: string | null;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeOptionalDocumentDate(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateDocumentDates({ issueDate, expiryDate }: DocumentDateFields): string | null {
  const issue = normalizeOptionalDocumentDate(issueDate);
  const expiry = normalizeOptionalDocumentDate(expiryDate);
  if ((issue && !isValidIsoDate(issue)) || (expiry && !isValidIsoDate(expiry))) return "Informe uma data válida.";
  if (issue && expiry && expiry < issue) return "A data de validade não pode ser anterior à data de emissão.";
  return null;
}

export function normalizeDocumentDates(
  { issueDate, expiryDate }: DocumentDateFields,
  emptyValue: "omit" | "null" = "omit"
): DocumentDateFields {
  const normalizedIssue = normalizeOptionalDocumentDate(issueDate);
  const normalizedExpiry = normalizeOptionalDocumentDate(expiryDate);
  return {
    ...(normalizedIssue ? { issueDate: normalizedIssue } : emptyValue === "null" ? { issueDate: null } : {}),
    ...(normalizedExpiry ? { expiryDate: normalizedExpiry } : emptyValue === "null" ? { expiryDate: null } : {})
  };
}

export const documentTypeOptions: Record<DocumentEntityType, [string, string][]> = {
  company: [["contract", "Contrato"], ["insurance", "Seguro"], ["certificate", "Certidão"], ["tax-document", "Documento fiscal"], ["other", "Outro"]],
  driver: [["license", "CNH"], ["aso", "ASO"], ["course", "Curso"], ["certificate", "Certificado"], ["other", "Outro"]],
  vehicle: [["registration", "CRLV"], ["insurance", "Seguro"], ["licensing", "Licenciamento"], ["report", "Laudo"], ["other", "Outro"]]
};

export const documentCategoryLabel: Record<DocumentEntityType, string> = { company: "Empresa", driver: "Motorista", vehicle: "Veículo" };
export const documentStatusLabel: Record<DocumentStatus, string> = { VALID: "Válido", EXPIRING: "Próximo do vencimento", EXPIRED: "Vencido" };
export const documentTypeLabel = (entityType: DocumentEntityType, value: string) => documentTypeOptions[entityType].find(([key]) => key === value)?.[1] || value;
