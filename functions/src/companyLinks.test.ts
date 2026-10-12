import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "./auth.js";
import { linkedCompanyIds, normalizeCompanyLinks, sharesCompany } from "./companyLinks.js";
import { entityValidationForTest, persistEntity } from "./entities.js";
import { firestore } from "./firebase.js";
import { transactionFixture, type FixtureRow } from "./transactionFixture.js";

const user: AppUser = { id: "admin", name: "Admin", email: "admin@example.test", active: true, role: "admin" };
afterEach(() => vi.restoreAllMocks());

describe("vínculos de empresa", () => {
  it("lê registros legados que possuem somente companyId", () => {
    expect(linkedCompanyIds({ companyId: "a" })).toEqual(["a"]);
    expect(linkedCompanyIds({ companyId: "a", companyIds: ["a", "b"] })).toEqual(["a", "b"]);
    expect(linkedCompanyIds({})).toEqual([]);
  });
  it("normaliza a empresa principal e remove duplicidades", () => {
    expect(normalizeCompanyLinks("b", ["a", "b", "a"])).toEqual({ companyId: "b", companyIds: ["b", "a"] });
    expect(normalizeCompanyLinks("x", ["a", "b"])).toEqual({ companyId: "a", companyIds: ["a", "b"] });
    expect(normalizeCompanyLinks("a", undefined)).toEqual({ companyId: "a", companyIds: ["a"] });
    expect(normalizeCompanyLinks("", [])).toBeNull();
  });
  it("identifica empresa compartilhada entre veículo e motorista", () => {
    expect(sharesCompany({ companyIds: ["a", "b"] }, { companyId: "b" })).toBe(true);
    expect(sharesCompany({ companyIds: ["a"] }, { companyIds: ["c"] })).toBe(false);
  });
  it("reserva a matrícula em cada empresa vinculada, sem remover a unicidade", () => {
    const { parseEntity, uniqueKeys } = entityValidationForTest;
    const driver = parseEntity("drivers", { companyIds: ["tequaly", "palmont"], name: "Motorista", registration: "m-10", licenseCategory: "D", licenseExpiry: "2030-01-01" });
    expect(uniqueKeys("drivers", driver)).toEqual(["driver-registration:tequaly:M-10", "driver-registration:palmont:M-10"]);
    expect(uniqueKeys("drivers", { companyId: "tequaly", registration: "m-10" })).toEqual(["driver-registration:tequaly:M-10"]);
  });
  it("mantém a placa como identificador único global do veículo", () => {
    expect(entityValidationForTest.uniqueKeys("vehicles", { plate: "tok-4j83", companyIds: ["a", "b"] })).toEqual(["plate:TOK4J83"]);
  });
  it("exige ao menos uma empresa", () => {
    expect(() => entityValidationForTest.parseEntity("drivers", { companyIds: [], name: "Motorista", registration: "1", licenseCategory: "D", licenseExpiry: "2030-01-01" })).toThrow(expect.objectContaining({ code: "invalid-argument" }));
  });
});

const vehicleInput = { companyIds: ["tequaly", "palmont"], projectId: "project", accessProfileId: "profile", plate: "TOK4J83", brand: "VW", model: "Gol", year: 2020, type: "Carros Leves", mileage: 10, ownership: "owned", driverIds: ["driver"], active: true };
function rows(extra: Record<string, FixtureRow> = {}): Record<string, FixtureRow> {
  return {
    "companies/tequaly": { active: true, clientId: "client", projectIds: ["project"] },
    "companies/palmont": { active: true, clientId: "client", projectIds: [] },
    "projects/project": { active: true, clientId: "client" },
    "accessProfiles/profile": { active: true, clientId: "client" },
    "drivers/driver": { active: true, companyId: "palmont", companyIds: ["palmont"] },
    "vehicles/vehicle": { plate: "TOK4J83", companyId: "tequaly", active: true },
    ...extra
  };
}

describe("persistência de veículo em várias empresas", () => {
  it("grava companyIds, mantém companyId principal e cria um vínculo histórico por empresa", async () => {
    const { writes } = transactionFixture(rows());
    await persistEntity("vehicles", "vehicle", vehicleInput, user);
    expect(writes.find((write) => write.path === "vehicles/vehicle")?.value).toMatchObject({ companyId: "tequaly", companyIds: ["tequaly", "palmont"] });
    expect(writes.find((write) => write.path === "vehicleCompanyAssignments/vehicle_tequaly")?.value).toMatchObject({ vehicleId: "vehicle", companyId: "tequaly", primary: true, active: true });
    expect(writes.find((write) => write.path === "vehicleCompanyAssignments/vehicle_palmont")?.value).toMatchObject({ companyId: "palmont", primary: false, active: true });
    expect(writes.some((write) => write.path === "uniqueKeys/plate:TOK4J83")).toBe(true);
  });

  it("encerra o vínculo de empresa removida sem apagar o histórico", async () => {
    const existing = { vehicleId: "vehicle", companyId: "palmont", active: true };
    const { writes } = transactionFixture(rows({ "vehicles/vehicle": { ...vehicleInput, companyId: "tequaly" }, "vehicleCompanyAssignments/vehicle_palmont": existing, "drivers/driver": { active: true, companyIds: ["tequaly"] } }), [
      { query: firestore.collection("vehicleCompanyAssignments").where("vehicleId", "==", "vehicle"), paths: ["vehicleCompanyAssignments/vehicle_palmont"] }
    ]);
    await persistEntity("vehicles", "vehicle", { ...vehicleInput, companyIds: ["tequaly"] }, user);
    expect(writes.find((write) => write.path === "vehicleCompanyAssignments/vehicle_palmont")?.value).toMatchObject({ active: false });
    expect(writes.some((write) => write.type === "delete" && write.path.startsWith("vehicleCompanyAssignments/"))).toBe(false);
  });

  it("recusa projeto não autorizado em nenhuma empresa vinculada", async () => {
    const { writes } = transactionFixture(rows({ "companies/tequaly": { active: true, clientId: "client", projectIds: [] } }));
    await expect(persistEntity("vehicles", "vehicle", vehicleInput, user)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(writes).toEqual([]);
  });

  it("recusa motorista que não atende nenhuma empresa do veículo", async () => {
    const { writes } = transactionFixture(rows({ "drivers/driver": { active: true, companyId: "outra" } }));
    await expect(persistEntity("vehicles", "vehicle", vehicleInput, user)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(writes).toEqual([]);
  });

  it("recusa placa já utilizada por outro veículo", async () => {
    const { writes } = transactionFixture(rows({ "uniqueKeys/plate:TOK4J83": { ownerCollection: "vehicles", ownerId: "outro" } }));
    await expect(persistEntity("vehicles", "vehicle", vehicleInput, user)).rejects.toMatchObject({ code: "already-exists" });
    expect(writes).toEqual([]);
  });
});

describe("persistência de motorista em várias empresas", () => {
  const driverInput = { companyIds: ["tequaly", "palmont"], name: "Motorista", registration: "M-10", licenseCategory: "D", licenseExpiry: "2030-01-01", active: true };

  it("reserva a matrícula nas duas empresas e cria os vínculos", async () => {
    const { writes } = transactionFixture(rows());
    await persistEntity("drivers", "driver", driverInput, user);
    expect(writes.some((write) => write.path === "uniqueKeys/driver-registration:tequaly:M-10")).toBe(true);
    expect(writes.some((write) => write.path === "uniqueKeys/driver-registration:palmont:M-10")).toBe(true);
    expect(writes.find((write) => write.path === "driverCompanyAssignments/driver_palmont")?.value).toMatchObject({ driverId: "driver", companyId: "palmont", active: true });
  });

  it("recusa matrícula já usada por outro motorista em uma das empresas", async () => {
    const { writes } = transactionFixture(rows({ "uniqueKeys/driver-registration:palmont:M-10": { ownerCollection: "drivers", ownerId: "outro" } }));
    await expect(persistEntity("drivers", "driver", driverInput, user)).rejects.toMatchObject({ code: "already-exists" });
    expect(writes).toEqual([]);
  });

  it("recusa retirar a empresa pela qual o motorista atende um veículo ativo", async () => {
    const { writes } = transactionFixture(rows({ "vehicles/v1": { active: true, plate: "TOK4J83", companyIds: ["palmont"], driverIds: ["driver"] } }), [
      { query: firestore.collection("vehicles").where("driverIds", "array-contains", "driver"), paths: ["vehicles/v1"] }
    ]);
    await expect(persistEntity("drivers", "driver", { ...driverInput, companyIds: ["tequaly"] }, user)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(writes).toEqual([]);
  });
});
