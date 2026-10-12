import { afterEach, describe, expect, it, vi } from "vitest";
import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { firestore } from "./firebase.js";
import { persistEntity } from "./entities.js";
import type { AppUser } from "./auth.js";

const user: AppUser = { id: "admin", name: "Admin", email: "admin@example.test", active: true, role: "admin" };
const input = { clientId: "client", legalName: "Empresa exemplo", document: "11444777000161", contractType: "subcontractor", active: true, projectIds: [] };
afterEach(() => vi.restoreAllMocks());

function transactionFixture(rows: Record<string, Record<string, unknown>>) {
  const writes: Array<{ path: string; value: Record<string, unknown> }> = [];
  const readPaths: string[] = [];
  const transaction = {
    get: vi.fn(async (reference: { path?: string }) => {
      if (!reference.path) return { docs: [] };
      if (writes.length) throw new Error("Leitura depois de gravação na transação");
      readPaths.push(reference.path);
      const value = rows[reference.path];
      return { exists: Boolean(value), data: () => value, id: reference.path.split("/").at(-1) };
    }),
    set: vi.fn((reference: { path: string }, value: Record<string, unknown>) => { writes.push({ path: reference.path, value }); }),
    delete: vi.fn()
  };
  // All Firestore I/O is replaced; this test never contacts a real Firebase project.
  vi.spyOn(firestore, "runTransaction").mockImplementation(async (work) => work(transaction as unknown as Transaction));
  return { writes, readPaths, transaction };
}

describe("persistência transacional da hierarquia", () => {
  it("lê todos os ancestrais antes de salvar e mantém auditoria existente", async () => {
    const { writes, readPaths } = transactionFixture({
      "companies/a": { ...input }, "clients/client": { active: true },
      "companies/b": { ...input, parentCompanyId: "c" }, "companies/c": { ...input, contractType: "direct" }
    });
    await persistEntity("companies", "a", { ...input, parentCompanyId: "b" }, user);
    expect(readPaths).toEqual(expect.arrayContaining(["companies/a", "companies/b", "companies/c"]));
    expect(writes.find((write) => write.path === "companies/a")?.value.parentCompanyId).toBe("b");
    expect(writes.some((write) => write.path.startsWith("auditLogs/"))).toBe(true);
  });
  it("não grava nada quando a nova relação fecharia um ciclo", async () => {
    const { writes } = transactionFixture({ "companies/a": input, "clients/client": { active: true }, "companies/b": { ...input, parentCompanyId: "a" } });
    await expect(persistEntity("companies", "a", { ...input, parentCompanyId: "b" }, user)).rejects.toMatchObject({ code: "failed-precondition" });
    expect(writes).toEqual([]);
  });
  it("remove o campo persistido ao mudar para direto", async () => {
    const { writes } = transactionFixture({ "companies/a": { ...input, parentCompanyId: "b" }, "clients/client": { active: true } });
    await persistEntity("companies", "a", { ...input, contractType: "direct", parentCompanyId: "b" }, user);
    expect(writes.find((write) => write.path === "companies/a")?.value.parentCompanyId).toEqual(FieldValue.delete());
  });
});
