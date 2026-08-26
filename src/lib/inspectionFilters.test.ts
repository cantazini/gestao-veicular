import { describe, expect, it } from "vitest";
import { buildInspectionSearch, emptyInspectionFilters } from "./inspectionFilters";

describe("filtros de vistorias", () => {
  it("mantém o Histórico sem filtro obrigatório de resultado", () => {
    const query = new URLSearchParams(buildInspectionSearch(emptyInspectionFilters()));
    expect(query.get("result")).toBeNull();
  });

  it("sempre consulta somente resultados persistidos como REPROVADO em Reprovações", () => {
    const filters = { ...emptyInspectionFilters(), result: "APROVADO" as const };
    const query = new URLSearchParams(buildInspectionSearch(filters, true));
    expect(query.get("result")).toBe("REPROVADO");
  });

  it("envia os filtros relacionais e de período para o backend", () => {
    const query = new URLSearchParams(buildInspectionSearch({
      ...emptyInspectionFilters(), startDate: "2026-08-01", endDate: "2026-08-31",
      clientId: "client-id", companyId: "company-id", projectId: "project-id",
      vehicleId: "vehicle-id", driverId: "driver-id", plate: "ABC1D23"
    }));
    expect(Object.fromEntries(query)).toMatchObject({
      startDate: "2026-08-01", endDate: "2026-08-31", clientId: "client-id",
      companyId: "company-id", projectId: "project-id", vehicleId: "vehicle-id",
      driverId: "driver-id", plate: "ABC1D23"
    });
  });
});
