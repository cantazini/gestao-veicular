import { describe, expect, it } from "vitest";
import { resolveClientLogo } from "./branding";

describe("identidade visual do relatório", () => {
  it("prioriza a logo privada cadastrada pelo cliente", () => expect(resolveClientLogo("Cliente", "/api/clients/1/logo")).toBe("/api/clients/1/logo"));
  it("não acopla uma marca ao nome do cliente", () => expect(resolveClientLogo("Klabin", null)).toBe(""));
  it("não quebra o layout de outros clientes sem logo", () => expect(resolveClientLogo("Cliente sem logo", null)).toBe(""));
});
