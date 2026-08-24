import { describe, expect, it } from "vitest";
import { assertCompanyScope, assertRoles, decodePrincipal } from "../middleware/auth";
import type { AppUser } from "../types/auth";

const supplier: AppUser = {
  id: "u1", identityProviderId: "entra-1", email: "fornecedor@empresa.com", name: "Fornecedor",
  role: "supplier", companyId: "company-a", active: true
};

describe("autorização", () => {
  it("decodifica o principal enviado pelo Static Web Apps", () => {
    const header = Buffer.from(JSON.stringify({ identityProvider: "aad", userId: "entra-1", userDetails: "u@e.com", userRoles: ["authenticated"] })).toString("base64");
    expect(decodePrincipal(header)?.userId).toBe("entra-1");
  });

  it("bloqueia fornecedor fora da própria empresa", () => {
    expect(() => assertCompanyScope(supplier, "company-b")).toThrow(/própria empresa/i);
  });

  it("bloqueia papel sem permissão", () => {
    expect(() => assertRoles(supplier, ["admin"])).toThrow(/permissão/i);
  });
});
