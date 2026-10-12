import type { DocumentStatus } from "../types";

export const DEFAULT_DOCUMENT_WARNING_DAYS = 30;

/** Janela de "a vencer" já usada pelo sistema: documentExpiryWarningDays, depois expiryAlertDays, depois 30 dias. */
export function documentWarningDays(settings: Record<string, unknown> | null | undefined): number {
  const value = Number(settings?.documentExpiryWarningDays || settings?.expiryAlertDays || DEFAULT_DOCUMENT_WARNING_DAYS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DOCUMENT_WARNING_DAYS;
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Normaliza a validade para YYYY-MM-DD. Aceita string de data/ISO, Date e Timestamp do Firestore. */
export function documentExpiryKey(expiryDate: unknown): string | null {
  if (!expiryDate) return null;
  if (typeof expiryDate === "object" && typeof (expiryDate as { toDate?: unknown }).toDate === "function") return localDateKey((expiryDate as { toDate: () => Date }).toDate());
  if (expiryDate instanceof Date) return Number.isNaN(expiryDate.getTime()) ? null : localDateKey(expiryDate);
  const text = String(expiryDate).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

/**
 * Classificação única e mutuamente exclusiva de um documento ativo:
 * - EXPIRED (vencido/inválido): validade anterior a hoje;
 * - EXPIRING (a vencer): validade entre hoje e hoje + janela configurada, inclusive;
 * - VALID (válido): demais casos, incluindo documento sem validade informada (semântica histórica do sistema).
 * Documentos removidos (active: false) não são classificados; o chamador deve filtrá-los antes.
 */
export function classifyDocumentExpiry(expiryDate: unknown, warningDays = DEFAULT_DOCUMENT_WARNING_DAYS, today = new Date()): DocumentStatus {
  const expiry = documentExpiryKey(expiryDate);
  if (!expiry) return "VALID";
  const start = localDateKey(today);
  if (expiry < start) return "EXPIRED";
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + Math.max(0, warningDays));
  return expiry <= localDateKey(limit) ? "EXPIRING" : "VALID";
}

export interface DocumentStatusCounts { validDocuments: number; expiringDocuments: number; expiredDocuments: number }

export function countDocumentStatuses(documents: Array<{ expiryDate?: unknown; active?: unknown }>, warningDays = DEFAULT_DOCUMENT_WARNING_DAYS, today = new Date()): DocumentStatusCounts {
  const counts: DocumentStatusCounts = { validDocuments: 0, expiringDocuments: 0, expiredDocuments: 0 };
  for (const document of documents) {
    if (document.active === false) continue;
    const status = classifyDocumentExpiry(document.expiryDate, warningDays, today);
    if (status === "EXPIRED") counts.expiredDocuments += 1;
    else if (status === "EXPIRING") counts.expiringDocuments += 1;
    else counts.validDocuments += 1;
  }
  return counts;
}
