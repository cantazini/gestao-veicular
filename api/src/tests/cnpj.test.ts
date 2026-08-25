import { describe, expect, it } from "vitest";
import { entitySchemas } from "../validation/entities";
import { isValidCnpj } from "../utils/normalize";

describe("validação de cliente", () => {
  it("aceita e normaliza um CNPJ válido", () => {
    const parsed = entitySchemas.clients.parse({
      name: "Meta",
      legalName: "Meta Central de Serviços Ltda.",
      document: "11.222.333/0001-81",
      active: true
    });
    expect(parsed.document).toBe("11222333000181");
  });

  it("rejeita CNPJ inválido", () => {
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
    expect(() => entitySchemas.clients.parse({ name: "Meta", legalName: "Meta Ltda.", document: "11.111.111/1111-11", active: true })).toThrow(/CNPJ válido/);
  });
});
