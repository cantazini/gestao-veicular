import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "./auth.js";
import { CHECKLIST_KEYS } from "./checklist.js";
import { firestore } from "./firebase.js";
import { saveInspection } from "./inspections.js";
import { effectiveInspectionSequences, nextInspectionSequence, planInspectionSequence } from "./inspectionSequence.js";
import { transactionFixture, type FixtureRow } from "./transactionFixture.js";

const actor: AppUser = { id: "inspector-1", name: "Fiscal", email: "fiscal@example.test", role: "inspector", active: true };
const items = CHECKLIST_KEYS.map((key) => ({ key, categoryKey: "test", categoryLabel: "Teste", label: key, status: "conforme" as const, observation: "" }));
const input = (extra: Record<string, unknown> = {}) => ({ companyId: "company-1", projectId: "project-1", vehicleId: "vehicle-1", driverId: "driver-1", inspectionDate: "2024-03-10", inspectionTime: "08:00", mileage: 100, items, ...extra });
afterEach(() => vi.restoreAllMocks());

describe("sequência efetiva por veículo", () => {
  it("preserva sequências persistidas, inclusive com lacunas", () => {
    const result = effectiveInspectionSequences([{ id: "a", sequence: 1 }, { id: "b", sequence: 4 }]);
    expect([...result]).toEqual([["a", 1], ["b", 4]]);
    expect(nextInspectionSequence(result.values())).toBe(5);
  });
  it("numera vistorias legadas em ordem cronológica, sem considerar exclusões lógicas", () => {
    const result = effectiveInspectionSequences([
      { id: "late", createdAt: "2026-09-10T10:00:00Z", code: "VST-000003" },
      { id: "removed", createdAt: "2026-09-05T10:00:00Z", deleted: true },
      { id: "early", createdAt: "2026-09-01T10:00:00Z", code: "VST-000001" }
    ]);
    expect(Object.fromEntries(result)).toEqual({ early: 1, late: 2 });
  });
  it("sugere 1 para o primeiro registro do veículo", () => {
    expect(planInspectionSequence([], "new", undefined).sequence).toBe(1);
  });
  it("aceita sequência retroativa em lacuna e recusa duplicidade", () => {
    const history = [{ id: "a", sequence: 1 }, { id: "b", sequence: 4 }];
    expect(planInspectionSequence(history, "new", 2).sequence).toBe(2);
    expect(planInspectionSequence(history, "new", 3).sequence).toBe(3);
    expect(() => planInspectionSequence(history, "new", 4)).toThrow(expect.objectContaining({ code: "already-exists" }));
  });
  it("mantém a sequência atual ao editar sem informar outra", () => {
    expect(planInspectionSequence([{ id: "a", sequence: 1 }, { id: "b", sequence: 4 }], "b", undefined).sequence).toBe(4);
  });
  it("congela as legadas quando o histórico recebe uma vistoria persistida", () => {
    const plan = planInspectionSequence([{ id: "x", createdAt: "2026-01-01T00:00:00Z" }, { id: "y", createdAt: "2026-02-01T00:00:00Z" }], "new", undefined);
    expect(plan).toEqual({ sequence: 3, freeze: [{ id: "x", sequence: 1 }, { id: "y", sequence: 2 }] });
  });
});

function operationalRows(extra: Record<string, FixtureRow> = {}): Record<string, FixtureRow> {
  return {
    "companies/company-1": { active: true, clientId: "client-1", projectIds: ["project-1"] },
    "companies/company-2": { active: true, clientId: "client-1", projectIds: ["project-1"] },
    "projects/project-1": { active: true, clientId: "client-1" },
    "vehicles/vehicle-1": { active: true, plate: "TOK4J83", companyId: "company-1", projectId: "project-1", accessProfileId: "profile-1", driverIds: ["driver-1"], mileage: 0 },
    "vehicles/vehicle-2": { active: true, plate: "ABC1D23", companyId: "company-1", projectId: "project-1", accessProfileId: "profile-1", driverIds: ["driver-1"], mileage: 0 },
    "drivers/driver-1": { active: true, companyId: "company-1" },
    "clients/client-1": { active: true, name: "Cliente" },
    "accessProfiles/profile-1": { active: true, color: "#0056A4" },
    "systemSettings/default": { minimumInspectionCompliance: 90 },
    "systemSettings/inspectionSequence": { value: 12 },
    ...extra
  };
}

function saveScenario(rows: Record<string, FixtureRow>, inspectionId?: string) {
  const byVehicle = (vehicleId: string) => Object.keys(rows).filter((path) => /^inspections\/[^/]+$/.test(path) && rows[path].vehicleId === vehicleId);
  return transactionFixture(rows, [
    { query: firestore.collection("inspections").where("vehicleId", "==", "vehicle-1"), paths: byVehicle("vehicle-1") },
    { query: firestore.collection("inspections").where("vehicleId", "==", "vehicle-2"), paths: byVehicle("vehicle-2") },
    ...(inspectionId ? [{ query: firestore.collection("credentialApprovals").where("inspectionId", "==", inspectionId).where("status", "==", "approved"), paths: [] }] : [])
  ]);
}

const savedInspection = (writes: Array<{ path: string; value?: FixtureRow }>, id?: string) => writes.find((write) => /^inspections\/[^/]+$/.test(write.path) && (!id || write.path === `inspections/${id}`) && "items" in (write.value ?? {}));

describe("persistência da sequência na vistoria", () => {
  it("atribui automaticamente a próxima sequência do veículo sem alterar o código global", async () => {
    const { writes } = saveScenario(operationalRows({
      "inspections/a": { vehicleId: "vehicle-1", sequence: 1, code: "VST-000001" },
      "inspections/b": { vehicleId: "vehicle-1", sequence: 4, code: "VST-000009" }
    }));
    const saved = await saveInspection(input(), undefined, actor);
    expect(saved).toMatchObject({ sequence: 5, code: "VST-000013" });
    expect(savedInspection(writes)?.value).toMatchObject({ sequence: 5, code: "VST-000013" });
    expect(writes.some((write) => write.path === "uniqueKeys/inspection-sequence:vehicle-1:5")).toBe(true);
  });

  it("aceita vistoria retroativa com sequência manual em uma lacuna", async () => {
    const { writes } = saveScenario(operationalRows({
      "inspections/a": { vehicleId: "vehicle-1", sequence: 1 },
      "inspections/b": { vehicleId: "vehicle-1", sequence: 4 }
    }));
    const saved = await saveInspection(input({ sequence: 2, inspectionDate: "2023-05-01" }), undefined, actor);
    expect(saved.sequence).toBe(2);
    expect(saved.code).toBe("VST-000013");
    expect(savedInspection(writes)?.value).toMatchObject({ sequence: 2, inspectionDate: "2023-05-01" });
  });

  it("recusa duplicar a sequência do mesmo veículo e não grava nada", async () => {
    const { writes } = saveScenario(operationalRows({ "inspections/b": { vehicleId: "vehicle-1", sequence: 4 } }));
    await expect(saveInspection(input({ sequence: 4 }), undefined, actor)).rejects.toMatchObject({ code: "already-exists" });
    expect(writes).toEqual([]);
  });

  it("recusa duplicar a sequência efetiva de uma vistoria legada", async () => {
    const { writes } = saveScenario(operationalRows({ "inspections/legacy": { vehicleId: "vehicle-1", createdAt: "2026-01-01T00:00:00Z" } }));
    await expect(saveInspection(input({ sequence: 1 }), undefined, actor)).rejects.toMatchObject({ code: "already-exists" });
    expect(writes).toEqual([]);
  });

  it("recusa quando a chave de sequência já pertence a outra vistoria", async () => {
    const { writes } = saveScenario(operationalRows({ "uniqueKeys/inspection-sequence:vehicle-1:3": { ownerCollection: "inspections", ownerId: "other" } }));
    await expect(saveInspection(input({ sequence: 3 }), undefined, actor)).rejects.toMatchObject({ code: "already-exists" });
    expect(writes).toEqual([]);
  });

  it("permite a mesma sequência em veículos diferentes", async () => {
    saveScenario(operationalRows({ "inspections/a": { vehicleId: "vehicle-1", sequence: 1 } }));
    const saved = await saveInspection(input({ vehicleId: "vehicle-2", sequence: 1 }), undefined, actor);
    expect(saved.sequence).toBe(1);
  });

  it("congela as vistorias legadas do veículo ao registrar a primeira sequência persistida", async () => {
    const { writes } = saveScenario(operationalRows({
      "inspections/old-1": { vehicleId: "vehicle-1", createdAt: "2026-01-01T00:00:00Z" },
      "inspections/old-2": { vehicleId: "vehicle-1", createdAt: "2026-02-01T00:00:00Z" }
    }));
    const saved = await saveInspection(input(), undefined, actor);
    expect(saved.sequence).toBe(3);
    expect(writes.find((write) => write.path === "inspections/old-1")?.value).toEqual({ sequence: 1 });
    expect(writes.find((write) => write.path === "inspections/old-2")?.value).toEqual({ sequence: 2 });
  });

  it("na edição preserva createdAt e libera a chave antiga ao trocar a sequência", async () => {
    const createdAt = { seconds: 1 };
    const { writes } = saveScenario(operationalRows({
      "inspections/edit": { vehicleId: "vehicle-1", sequence: 2, code: "VST-000002", createdAt, createdBy: "author", completedAt: createdAt, completedBy: "author" },
      "uniqueKeys/inspection-sequence:vehicle-1:2": { ownerCollection: "inspections", ownerId: "edit" }
    }), "edit");
    const saved = await saveInspection(input({ sequence: 3 }), "edit", actor);
    expect(saved).toMatchObject({ sequence: 3, code: "VST-000002" });
    expect(savedInspection(writes, "edit")?.value).toMatchObject({ createdAt, createdBy: "author", completedAt: createdAt, completedBy: "author", sequence: 3 });
    expect(writes).toContainEqual(expect.objectContaining({ type: "delete", path: "uniqueKeys/inspection-sequence:vehicle-1:2" }));
    expect(writes.some((write) => write.path === "systemSettings/inspectionSequence")).toBe(false);
  });
});

describe("vistoria de veículo e motorista com várias empresas", () => {
  const multiCompany = () => operationalRows({
    "vehicles/vehicle-1": { active: true, plate: "TOK4J83", companyId: "company-1", companyIds: ["company-1", "company-2"], projectId: "project-1", accessProfileId: "profile-1", driverIds: ["driver-1"], mileage: 0 },
    "drivers/driver-1": { active: true, companyId: "company-1", companyIds: ["company-1", "company-2"] }
  });

  it("aceita a vistoria em qualquer empresa vinculada", async () => {
    saveScenario(multiCompany());
    const saved = await saveInspection(input({ companyId: "company-2" }), undefined, actor);
    expect(saved.sequence).toBe(1);
  });

  it("recusa empresa sem vínculo com o motorista", async () => {
    const rows = multiCompany();
    rows["drivers/driver-1"] = { active: true, companyId: "company-1", companyIds: ["company-1"] };
    saveScenario(rows);
    await expect(saveInspection(input({ companyId: "company-2" }), undefined, actor)).rejects.toMatchObject({ code: "failed-precondition" });
  });

  it("recusa projeto não autorizado para a empresa selecionada", async () => {
    const rows = multiCompany();
    rows["companies/company-2"] = { active: true, clientId: "client-1", projectIds: [] };
    saveScenario(rows);
    await expect(saveInspection(input({ companyId: "company-2" }), undefined, actor)).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
