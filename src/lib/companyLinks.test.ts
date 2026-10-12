import { describe, expect, it } from "vitest";
import { entityCompanyIds, isLinkedToCompany, primaryCompanyId, sharesCompany } from "./companyLinks";

describe("vínculos de empresa no frontend", () => {
  it("lê registros legados com somente companyId", () => {
    expect(entityCompanyIds({ companyId: "tequaly" })).toEqual(["tequaly"]);
    expect(isLinkedToCompany({ companyId: "tequaly" }, "tequaly")).toBe(true);
  });
  it("reconhece veículo que atende duas empresas", () => {
    const vehicle = { companyId: "tequaly", companyIds: ["tequaly", "palmont"] };
    expect(isLinkedToCompany(vehicle, "palmont")).toBe(true);
    expect(isLinkedToCompany(vehicle, "outra")).toBe(false);
    expect(isLinkedToCompany(vehicle, "")).toBe(false);
  });
  it("verifica empresa em comum entre veículo e motorista", () => {
    expect(sharesCompany({ companyIds: ["a", "b"] }, { companyIds: ["b"] })).toBe(true);
    expect(sharesCompany({ companyIds: ["a"] }, { companyId: "b" })).toBe(false);
  });
  it("preserva a empresa principal enquanto ela continua selecionada", () => {
    expect(primaryCompanyId("b", ["a", "b"])).toBe("b");
    expect(primaryCompanyId("c", ["a", "b"])).toBe("a");
    expect(primaryCompanyId("", [])).toBe("");
  });
});
