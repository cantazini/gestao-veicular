import { describe, expect, it } from "vitest";
import type { Entity } from "../types";
import { companyInitials, driverCountLabel, EMPTY_DRIVER_FILTERS, groupDriversByCompany, hasDriverFilters, toggleExpandedCompany, UNASSIGNED_COMPANY_ID, type DriverFilters } from "./driverGroups";

const companies: Entity[] = [
  { id: "company-z", legalName: "Zeta Logística", active: true, logoBlobPath: "/zeta.png" },
  { id: "company-a", legalName: "Alfa Transportes", tradeName: "Alfa", active: true }
];
const drivers: Entity[] = [
  { id: "driver-2", companyId: "company-a", name: "Zélia Costa", registration: "M-200", licenseCategory: "D", licenseNumber: "9988", licenseExpiry: "2029-12-30", active: false },
  { id: "driver-1", companyId: "company-a", name: "Ana Lima", registration: "M-100", licenseCategory: "B", licenseNumber: "1122", licenseExpiry: "2028-10-20", active: true },
  { id: "driver-3", companyId: "company-z", name: "Bruno Reis", registration: "M-300", licenseCategory: "E", licenseExpiry: "2030-01-10", active: true },
  { id: "driver-4", name: "Carlos Sem Vínculo", registration: "M-400", licenseCategory: "C", licenseExpiry: "2027-03-12", active: true }
];

const filters = (changes: Partial<DriverFilters> = {}): DriverFilters => ({ ...EMPTY_DRIVER_FILTERS, ...changes });

describe("agrupamento de motoristas por empresa", () => {
  it("agrupa, ordena empresas e ordena motoristas alfabeticamente", () => {
    const groups = groupDriversByCompany(drivers, companies);
    expect(groups.map((group) => group.name)).toEqual(["Alfa", "Zeta Logística", "Sem empresa vinculada"]);
    expect(groups[0].drivers.map((driver) => driver.name)).toEqual(["Ana Lima", "Zélia Costa"]);
    expect(groups[1].drivers).toHaveLength(1);
    expect(groups[2].id).toBe(UNASSIGNED_COMPANY_ID);
  });

  it("filtra por nome, matrícula e CNH com correspondência parcial", () => {
    expect(groupDriversByCompany(drivers, companies, filters({ name: "ana" }))[0].drivers.map((driver) => driver.id)).toEqual(["driver-1"]);
    expect(groupDriversByCompany(drivers, companies, filters({ registration: "-30" }))[0].drivers.map((driver) => driver.id)).toEqual(["driver-3"]);
    expect(groupDriversByCompany(drivers, companies, filters({ license: "998" }))[0].drivers.map((driver) => driver.id)).toEqual(["driver-2"]);
    expect(groupDriversByCompany(drivers, companies, filters({ license: "c" }))[0].drivers.map((driver) => driver.id)).toEqual(["driver-4"]);
  });

  it("filtra pela razão social da empresa mantendo seus motoristas visíveis", () => {
    const groups = groupDriversByCompany(drivers, companies, filters({ company: "alfa transp" }));
    expect(groups).toHaveLength(1);
    expect(groups[0].drivers).toHaveLength(2);
  });

  it("combina empresa, motorista e status e atualiza a contagem", () => {
    const groups = groupDriversByCompany(drivers, companies, filters({ company: "Alfa", name: "zé", status: "inactive" }));
    expect(groups).toHaveLength(1);
    expect(groups[0].drivers.map((driver) => driver.id)).toEqual(["driver-2"]);
    expect(driverCountLabel(groups[0].drivers.length)).toBe("1 motorista");
  });

  it("filtra ativos e inativos usando a regra booleana atual", () => {
    expect(groupDriversByCompany(drivers, companies, filters({ status: "active" })).flatMap((group) => group.drivers)).toHaveLength(3);
    expect(groupDriversByCompany(drivers, companies, filters({ status: "inactive" })).flatMap((group) => group.drivers).map((driver) => driver.id)).toEqual(["driver-2"]);
  });

  it("remove empresas sem motoristas correspondentes e reconhece filtros limpos", () => {
    expect(groupDriversByCompany(drivers, companies, filters({ name: "Ana" })).map((group) => group.name)).toEqual(["Alfa"]);
    expect(hasDriverFilters(filters())).toBe(false);
    expect(hasDriverFilters(filters({ registration: "0007" }))).toBe(true);
    expect(groupDriversByCompany(drivers, companies, filters())).toHaveLength(3);
  });

  it("mantém singular, plural e fallback visual coerentes", () => {
    expect(driverCountLabel(1)).toBe("1 motorista");
    expect(driverCountLabel(12)).toBe("12 motoristas");
    expect(companyInitials("Alfa Transportes")).toBe("AT");
    expect(companyInitials("Valmet")).toBe("VA");
  });

  it("permite mais de uma empresa expandida e recolhe apenas a escolhida", () => {
    const first = toggleExpandedCompany(new Set(), "company-a");
    const second = toggleExpandedCompany(first, "company-z");
    expect([...second]).toEqual(["company-a", "company-z"]);
    expect([...toggleExpandedCompany(second, "company-a")]).toEqual(["company-z"]);
  });
});

describe("motorista que atende várias empresas", () => {
  it("aparece no grupo de cada empresa vinculada", () => {
    const shared: Entity = { id: "shared", companyId: "company-a", companyIds: ["company-a", "company-z"], name: "Dora Souza", registration: "M-900", licenseCategory: "D", licenseExpiry: "2030-01-01", active: true };
    const groups = groupDriversByCompany([shared], companies);
    expect(groups.map((group) => group.id).sort()).toEqual(["company-a", "company-z"]);
    expect(groups.every((group) => group.drivers[0].id === "shared")).toBe(true);
  });
});