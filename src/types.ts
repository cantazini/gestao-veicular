export type Role = "admin" | "inspector";
export interface User { id: string; name: string; email: string; role: Role; companyId?: string | null }
export interface PageResult<T> { items: T[]; page: number; pageSize: number; total: number }
export type EntityValue = string | number | boolean | null | undefined | string[];
export interface Entity { id: string; active?: boolean; [key: string]: EntityValue }
export type ChecklistStatus = "conforme" | "nao_conforme" | "nao_se_aplica";
export interface ChecklistItem { key: string; label: string; categoryKey: string; categoryLabel: string; status: ChecklistStatus; observation: string }
export interface Inspection {
  id: string; code: string; inspectionDate: string; inspectionTime: string; mileage: number; result: "APROVADO" | "REPROVADO";
  companyId?: string; projectId?: string; vehicleId?: string; driverId?: string;
  createdAt?: string; completedAt?: string; sequence?: number;
  deleted?: boolean; deletedAt?: string; deletedBy?: string; deleteReason?: string;
  compliancePercentage: number; companyName?: string; clientName?: string; projectName?: string; driverName?: string;
  inspectorName?: string; plate?: string; clientLogoUrl?: string | null; generalObservations?: string; snapshot?: Record<string, Record<string, unknown>>;
  items?: ChecklistItem[]; photos?: Photo[];
}
export interface Photo { id: string; photoType: string; label: string; description?: string; url: string }
// validDocuments/expiredDocuments são opcionais porque o fallback Azure devolve apenas expiringDocuments.
export interface DashboardData { metrics: { inspections: number; vehicles: number; drivers: number; companies: number; pendingVehicles: number }; recentInspections: Inspection[]; alerts: { expiringDocuments: number; validDocuments?: number; expiredDocuments?: number } }
export interface InspectionSequenceSummary { nextSequence: number; usedSequences: number[] }
export type DocumentEntityType = "company" | "driver" | "vehicle";
export type DocumentStatus = "VALID" | "EXPIRING" | "EXPIRED";
export interface DocumentRecord {
  id: string; entityType: DocumentEntityType; entityId: string; clientId: string; clientName: string;
  companyId: string; companyIds?: string[]; companyName: string; entityName: string; entityIdentifier: string;
  documentType: string; label: string; fileName: string; mimeType: string; size: number;
  issueDate?: string | null; expiryDate?: string | null; observation?: string; documentStatus: DocumentStatus;
  createdAt: string; updatedAt: string; url: string;
}
