import type { DocumentEntityType, DocumentStatus } from "../types";

export const documentTypeOptions: Record<DocumentEntityType, [string, string][]> = {
  company: [["contract", "Contrato"], ["insurance", "Seguro"], ["certificate", "Certidão"], ["tax-document", "Documento fiscal"], ["other", "Outro"]],
  driver: [["license", "CNH"], ["aso", "ASO"], ["course", "Curso"], ["certificate", "Certificado"], ["other", "Outro"]],
  vehicle: [["registration", "CRLV"], ["insurance", "Seguro"], ["licensing", "Licenciamento"], ["report", "Laudo"], ["other", "Outro"]]
};

export const documentCategoryLabel: Record<DocumentEntityType, string> = { company: "Empresa", driver: "Motorista", vehicle: "Veículo" };
export const documentStatusLabel: Record<DocumentStatus, string> = { VALID: "Válido", EXPIRING: "Próximo do vencimento", EXPIRED: "Vencido" };
export const documentTypeLabel = (entityType: DocumentEntityType, value: string) => documentTypeOptions[entityType].find(([key]) => key === value)?.[1] || value;
