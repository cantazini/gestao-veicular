import { describe, expect, it } from "vitest";
import { credentialQuerySchema } from "../validation/credentials";

describe("filtros de credenciais", () => {
  it("preserva IDs reais de veículo e perfil de acesso", () => {
    const id = "29ABD04F-29A0-F111-9B33-002248377314";
    expect(credentialQuerySchema.parse({ clientId: id, companyId: id, vehicleId: id, accessProfileId: id })).toEqual({ clientId: id, companyId: id, vehicleId: id, accessProfileId: id });
  });

  it("normaliza selects opcionais vazios", () => {
    expect(credentialQuerySchema.parse({ clientId: "", companyId: "" })).toEqual({ clientId: undefined, companyId: undefined });
  });
});
