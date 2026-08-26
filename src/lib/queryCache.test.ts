import { describe, expect, it } from "vitest";
import { upsertPageResult } from "./queryCache";

describe("cache compartilhado de entidades", () => {
  it("inclui um cadastro novo nas listas já carregadas sem exigir reload", () => {
    const current = { items: [{ id: "1", name: "Anterior" }], page: 1, pageSize: 100, total: 1 };
    expect(upsertPageResult(current, { id: "2", name: "Novo motorista" })).toMatchObject({
      total: 2,
      items: [{ id: "2", name: "Novo motorista" }, { id: "1", name: "Anterior" }]
    });
  });

  it("atualiza um cadastro existente sem duplicá-lo", () => {
    const current = { items: [{ id: "1", name: "Anterior" }], page: 1, pageSize: 100, total: 1 };
    expect(upsertPageResult(current, { id: "1", name: "Atualizado" })).toMatchObject({ total: 1, items: [{ id: "1", name: "Atualizado" }] });
  });
});
