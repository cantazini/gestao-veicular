import { describe, expect, it } from "vitest";
import { entityValidationForTest } from "./entities.js";

describe("unicidade das entidades", () => {
  it("compartilha a chave global de CNPJ entre cliente e empresa", () => {
    const client = entityValidationForTest.parseEntity("clients", { name: "Meta", legalName: "Meta Serviços Ltda", document: "11.444.777/0001-61", active: true });
    const company = entityValidationForTest.parseEntity("companies", { clientId: "client-1", legalName: "Fornecedor", document: "11.444.777/0001-61", contractType: "direct", projectIds: [], active: true });
    expect(entityValidationForTest.uniqueKeys("clients", client)).toEqual(entityValidationForTest.uniqueKeys("companies", company));
  });
  it("normaliza campos relacionais opcionais vazios", () => {
    const company = entityValidationForTest.parseEntity("companies", { clientId: "client-1", parentCompanyId: "", legalName: "Fornecedor", document: "11.444.777/0001-61", contractType: "direct", projectIds: [], active: true });
    expect(company.parentCompanyId).toBeUndefined();
  });
  it("mantém identificadores obrigatórios obrigatórios", () => {
    expect(() => entityValidationForTest.parseEntity("projects", { clientId: "", name: "Projeto", code: "P1", active: true })).toThrow();
  });
});
