import { describe, expect, it } from "vitest";
import { resolveClientLogo } from "./branding";

describe("identidade visual do relatório", () => {
  it("prioriza a logo privada cadastrada pelo cliente", () => expect(resolveClientLogo("Cliente", "/api/clients/1/logo")).toBe("/api/clients/1/logo"));
  it("usa temporariamente a logo Klabin anexada nas vistorias atuais", () => expect(resolveClientLogo("Klabin", null)).toBe("/assets/logo-klabin.png"));
  it("não quebra o layout de outros clientes sem logo", () => expect(resolveClientLogo("Cliente sem logo", null)).toBe(""));
});
