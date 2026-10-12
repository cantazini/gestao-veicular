import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "./auth.js";
import { firestore } from "./firebase.js";
import { assertInspectionCanBeDeleted, inspectionStoragePrefix, purgeInspection } from "./inspectionDeletion.js";
import { transactionFixture, type FixtureRow } from "./transactionFixture.js";

const admin: AppUser = { id: "admin-1", name: "Admin", email: "admin@example.test", role: "admin", active: true };
afterEach(() => vi.restoreAllMocks());

function expectHttpsCode(run: () => void, code: string) {
  try {
    run();
    throw new Error("A validação deveria ter falhado.");
  } catch (reason) {
    expect(reason).toMatchObject({ code });
  }
}

const inspection = (extra: FixtureRow = {}): FixtureRow => ({
  code: "VST-000007", vehicleId: "vehicle-1", companyId: "company-1", projectId: "project-1", driverId: "driver-1",
  inspectionDate: "2026-09-13", result: "APROVADO", sequence: 1,
  snapshot: { vehicle: { plate: "TOK4J83" }, company: { tradeName: "Meta" } }, ...extra
});

function scenario(options: { inspection?: FixtureRow | null; photos?: number; approvals?: FixtureRow[]; credentials?: FixtureRow[]; others?: Record<string, FixtureRow> } = {}) {
  const rows: Record<string, FixtureRow> = { "uniqueKeys/inspection-sequence:vehicle-1:1": { ownerCollection: "inspections", ownerId: "insp-1" } };
  if (options.inspection !== null) rows["inspections/insp-1"] = options.inspection ?? inspection();
  const photoPaths = Array.from({ length: options.photos ?? 0 }, (_, index) => `inspections/insp-1/photos/photo-${index}`);
  photoPaths.forEach((path, index) => { rows[path] = { storagePath: `${path}/foto-${index}.jpg`, mimeType: "image/jpeg" }; });
  const approvalPaths = (options.approvals ?? []).map((approval, index) => { const path = `credentialApprovals/approval-${index}`; rows[path] = { inspectionId: "insp-1", ...approval }; return path; });
  const credentialPaths = (options.credentials ?? []).map((credential, index) => { const path = `credentials/credential-${index}`; rows[path] = { inspectionId: "insp-1", ...credential }; return path; });
  Object.assign(rows, options.others ?? {});
  const vehicleInspectionPaths = Object.keys(rows).filter((path) => /^inspections\/[^/]+$/.test(path) && rows[path].vehicleId === "vehicle-1");
  const fixture = transactionFixture(rows, [
    { query: firestore.collection("inspections").doc("insp-1").collection("photos"), paths: photoPaths },
    { query: firestore.collection("credentialApprovals").where("inspectionId", "==", "insp-1"), paths: approvalPaths },
    { query: firestore.collection("credentials").where("inspectionId", "==", "insp-1"), paths: credentialPaths },
    { query: firestore.collection("inspections").where("vehicleId", "==", "vehicle-1"), paths: vehicleInspectionPaths }
  ]);
  const removeStorageFiles = vi.fn(async (_prefix: string) => undefined);
  return { ...fixture, removeStorageFiles };
}

const deletedPaths = (writes: Array<{ type: string; path: string }>) => writes.filter((write) => write.type === "delete").map((write) => write.path);
const auditOf = (writes: Array<{ type: string; path: string; value?: FixtureRow }>) => writes.find((write) => write.path.startsWith("auditLogs/"))?.value;

describe("autorização da exclusão definitiva", () => {
  it("permite Administrador ativo", () => {
    expect(() => assertInspectionCanBeDeleted(admin, {})).not.toThrow();
  });
  it("recusa Fiscalizador", () => {
    expectHttpsCode(() => assertInspectionCanBeDeleted({ ...admin, role: "inspector" }, {}), "permission-denied");
  });
  it("recusa usuário inativo", () => {
    expectHttpsCode(() => assertInspectionCanBeDeleted({ ...admin, active: false }, {}), "permission-denied");
  });
  it("recusa vistoria inexistente", () => {
    expectHttpsCode(() => assertInspectionCanBeDeleted(admin, null), "not-found");
  });
  it("não é bloqueada por credencial ativa", () => {
    expect(() => assertInspectionCanBeDeleted(admin, { credentialStatus: "active" })).not.toThrow();
  });
});

describe("exclusão definitiva de vistoria", () => {
  it("remove vistoria sem credencial, libera a sequência e registra auditoria mínima", async () => {
    const { writes, removeStorageFiles } = scenario();
    const result = await purgeInspection("insp-1", admin, { removeStorageFiles });
    expect(result).toMatchObject({ id: "insp-1", code: "VST-000007", purged: true, removedCredentials: 0, pendingStoragePaths: [] });
    expect(deletedPaths(writes)).toEqual(expect.arrayContaining(["inspections/insp-1", "uniqueKeys/inspection-sequence:vehicle-1:1"]));
    const audit = auditOf(writes);
    expect(audit).toMatchObject({ action: "inspection.purged", actorUid: admin.id, entityId: "insp-1" });
    expect(audit?.metadata).toMatchObject({ inspectionId: "insp-1", code: "VST-000007", plate: "TOK4J83", companyName: "Meta", inspectionDate: "2026-09-13", sequence: 1 });
    expect(removeStorageFiles).toHaveBeenCalledWith(inspectionStoragePrefix("insp-1"));
  });

  it("remove vistoria com credencial ativa, sem bloquear, e apaga a credencial vinculada", async () => {
    const { writes, removeStorageFiles } = scenario({ credentials: [{ status: "active", code: "CRD-ABC12345", validUntil: "2999-01-01" }] });
    const result = await purgeInspection("insp-1", admin, { removeStorageFiles });
    expect(result.removedCredentials).toBe(1);
    expect(deletedPaths(writes)).toEqual(expect.arrayContaining(["inspections/insp-1", "credentials/credential-0"]));
    expect(auditOf(writes)?.metadata).toMatchObject({ removedCredentials: 1, removedCredentialCodes: ["CRD-ABC12345"] });
  });

  it("remove aprovações pendentes, aprovadas e encerradas vinculadas", async () => {
    const { writes, removeStorageFiles } = scenario({ approvals: [{ status: "pending" }, { status: "approved" }, { status: "rejected" }] });
    const result = await purgeInspection("insp-1", admin, { removeStorageFiles });
    expect(result.removedApprovals).toBe(3);
    expect(deletedPaths(writes)).toEqual(expect.arrayContaining(["credentialApprovals/approval-0", "credentialApprovals/approval-1", "credentialApprovals/approval-2"]));
    expect(writes.some((write) => write.type === "update")).toBe(false);
  });

  it("remove os metadados das fotos e os arquivos do Storage pelo prefixo da vistoria", async () => {
    const { writes, removeStorageFiles } = scenario({ photos: 3 });
    const result = await purgeInspection("insp-1", admin, { removeStorageFiles });
    expect(result.removedPhotos).toBe(3);
    expect(deletedPaths(writes)).toEqual(expect.arrayContaining(["inspections/insp-1/photos/photo-0", "inspections/insp-1/photos/photo-1", "inspections/insp-1/photos/photo-2"]));
    expect(removeStorageFiles).toHaveBeenCalledWith("inspections/insp-1/");
  });

  it("não desfaz a exclusão quando a limpeza do Storage falha e devolve os arquivos pendentes", async () => {
    const { writes, removeStorageFiles } = scenario({ photos: 2 });
    removeStorageFiles.mockRejectedValueOnce(new Error("403"));
    const result = await purgeInspection("insp-1", admin, { removeStorageFiles });
    expect(deletedPaths(writes)).toContain("inspections/insp-1");
    expect(result.pendingStoragePaths).toEqual(["inspections/insp-1/photos/photo-0/foto-0.jpg", "inspections/insp-1/photos/photo-1/foto-1.jpg"]);
  });

  it("congela a sequência das demais vistorias legadas para não renumerar o histórico", async () => {
    const { writes, removeStorageFiles } = scenario({
      inspection: inspection({ sequence: undefined, createdAt: "2026-09-01T10:00:00Z" }),
      others: {
        "inspections/legacy-2": { code: "VST-000008", vehicleId: "vehicle-1", createdAt: "2026-09-05T10:00:00Z" },
        "inspections/legacy-3": { code: "VST-000009", vehicleId: "vehicle-1", createdAt: "2026-09-09T10:00:00Z" }
      }
    });
    await purgeInspection("insp-1", admin, { removeStorageFiles });
    expect(writes.find((write) => write.path === "inspections/legacy-2")?.value).toEqual({ sequence: 2 });
    expect(writes.find((write) => write.path === "inspections/legacy-3")?.value).toEqual({ sequence: 3 });
    expect(auditOf(writes)?.metadata).toMatchObject({ sequence: 1 });
  });

  it("não grava nada para usuário não autorizado", async () => {
    const { writes, removeStorageFiles } = scenario();
    await expect(purgeInspection("insp-1", { ...admin, role: "inspector" }, { removeStorageFiles })).rejects.toMatchObject({ code: "permission-denied" });
    expect(writes).toEqual([]);
    expect(removeStorageFiles).not.toHaveBeenCalled();
  });

  it("informa vistoria inexistente sem gravar", async () => {
    const { writes, removeStorageFiles } = scenario({ inspection: null });
    await expect(purgeInspection("insp-1", admin, { removeStorageFiles })).rejects.toMatchObject({ code: "not-found" });
    expect(writes).toEqual([]);
  });

  it("remove definitivamente uma vistoria que já tinha exclusão lógica", async () => {
    const { writes, removeStorageFiles } = scenario({ inspection: inspection({ deleted: true }) });
    await purgeInspection("insp-1", admin, { removeStorageFiles });
    expect(deletedPaths(writes)).toContain("inspections/insp-1");
    expect(auditOf(writes)?.metadata).toMatchObject({ previouslySoftDeleted: true });
  });
});
