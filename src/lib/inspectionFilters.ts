export type InspectionResult = "APROVADO" | "REPROVADO";

export interface InspectionFilters {
  startDate: string;
  endDate: string;
  clientId: string;
  companyId: string;
  projectId: string;
  vehicleId: string;
  driverId: string;
  plate: string;
  result: "" | InspectionResult;
}

export const emptyInspectionFilters = (): InspectionFilters => ({
  startDate: "",
  endDate: "",
  clientId: "",
  companyId: "",
  projectId: "",
  vehicleId: "",
  driverId: "",
  plate: "",
  result: ""
});

export function buildInspectionSearch(filters: InspectionFilters, rejectedOnly = false): string {
  const params = new URLSearchParams({ pageSize: "100" });
  const values: Record<string, string> = {
    ...filters,
    result: rejectedOnly ? "REPROVADO" : filters.result
  };
  Object.entries(values).forEach(([key, value]) => {
    const normalized = value.trim();
    if (normalized) params.set(key, normalized);
  });
  return params.toString();
}

export function hasInspectionFilters(filters: InspectionFilters, rejectedOnly = false): boolean {
  return Object.entries(filters).some(([key, value]) => Boolean(value) && !(rejectedOnly && key === "result"));
}
