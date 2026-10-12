import { describe, expect, it, vi } from "vitest";
import { validateCompanyAncestry } from "./companyHierarchy.js";
import { entityValidationForTest } from "./entities.js";

const company = { clientId: "client", legalName: "Empresa exemplo", document: "11444777000161", contractType: "subcontractor", active: true };
describe("hierarquia no backend", () => {
  it("aceita empresa legada sem contratante", async () => {
    expect(entityValidationForTest.parseEntity("companies", company).parentCompanyId).toBeUndefined();
    const read = vi.fn();
    await validateCompanyAncestry("a", undefined, "client", read);
    expect(read).not.toHaveBeenCalled();
  });
  it("limpa contratante ao mudar para contrato direto", () => {
    expect(entityValidationForTest.parseEntity("companies", { ...company, contractType: "direct", parentCompanyId: "old" }).parentCompanyId).toBeUndefined();
  });
  it.each(["a", "b", "c"])("bloqueia ciclos com %s em qualquer profundidade", async (parent) => {
    const rows: Record<string, { parentCompanyId: string; clientId: string; active: boolean }> = {
      b: { parentCompanyId: "a", clientId: "client", active: true }, c: { parentCompanyId: "b", clientId: "client", active: true }
    };
    await expect(validateCompanyAncestry("a", parent, "client", async (id) => rows[id])).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("aceita cadeia multinível válida usando o leitor transacional", async () => {
    const read = vi.fn(async (id: string) => ({ clientId: "client", active: true, parentCompanyId: id === "b" ? "c" : undefined }));
    await expect(validateCompanyAncestry("a", "b", "client", read)).resolves.toBeUndefined();
    expect(read.mock.calls).toEqual([["b"], ["c"]]);
  });
  it.each([undefined, { active: false, clientId: "client" }, { active: true, clientId: "other" }])("recusa pai ausente, inativo ou de outro cliente", async (parent) => {
    await expect(validateCompanyAncestry("a", "b", "client", async () => parent)).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("recusa ciclo legado entre ancestrais sem ficar em loop", async () => {
    await expect(validateCompanyAncestry("new", "b", "client", async (id) => ({ active: true, clientId: "client", parentCompanyId: id === "b" ? "c" : "b" }))).rejects.toMatchObject({ code: "failed-precondition" });
  });
});
