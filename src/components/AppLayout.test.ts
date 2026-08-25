import { describe, expect, it } from "vitest";
import { isMenuItemActive } from "./AppLayout";

describe("navegação lateral", () => {
  it("mantém Nova vistoria como único item ativo na rota de criação", () => {
    expect(isMenuItemActive("/vistorias/nova", "/vistorias/nova")).toBe(true);
    expect(isMenuItemActive("/vistorias/nova", "/vistorias")).toBe(false);
  });

  it("associa um relatório ao Histórico", () => {
    expect(isMenuItemActive("/vistorias/29ABD04F-29A0-F111-9B33-002248377314", "/vistorias")).toBe(true);
    expect(isMenuItemActive("/vistorias/29ABD04F-29A0-F111-9B33-002248377314", "/vistorias/nova")).toBe(false);
  });

  it("não ativa o Dashboard em outras rotas", () => {
    expect(isMenuItemActive("/veiculos", "/")).toBe(false);
    expect(isMenuItemActive("/", "/")).toBe(true);
  });
});
