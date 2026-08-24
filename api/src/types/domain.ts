export type InspectionStatus = "conforme" | "nao_conforme" | "nao_se_aplica";

export interface InspectionItemInput {
  key: string;
  categoryKey: string;
  categoryLabel: string;
  label: string;
  status: InspectionStatus;
  observation?: string;
}

export interface InspectionInput {
  companyId: string;
  vehicleId: string;
  driverId: string;
  projectId: string;
  inspectionDate: string;
  inspectionTime: string;
  mileage: number;
  generalObservations?: string;
  items: InspectionItemInput[];
}

export interface ComplianceSummary {
  compliant: number;
  nonCompliant: number;
  notApplicable: number;
  applicable: number;
  total: number;
  percentage: number;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
