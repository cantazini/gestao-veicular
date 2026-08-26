import { describe, expect, it } from "vitest";
import { normalizeDocumentDates, normalizeOptionalDocumentDate, validateDocumentDates } from "./documents";

describe("datas opcionais de documentos", () => {
  it("normaliza valores vazios e omite as datas no payload de upload", () => {
    expect(normalizeOptionalDocumentDate("")).toBeUndefined();
    expect(normalizeOptionalDocumentDate(null)).toBeUndefined();
    expect(normalizeOptionalDocumentDate(undefined)).toBeUndefined();
    const payload = normalizeDocumentDates({ issueDate: "", expiryDate: "" });
    expect(payload).toEqual({});
    expect(JSON.stringify(payload)).toBe("{}");
  });

  it.each([
    { issueDate: "2026-08-26", expiryDate: "" },
    { issueDate: "", expiryDate: "2027-08-26" },
    { issueDate: "2026-08-26", expiryDate: "2027-08-26" },
    { issueDate: "", expiryDate: "" }
  ])("aceita combinações válidas de datas opcionais", (dates) => {
    expect(validateDocumentDates(dates)).toBeNull();
  });

  it("gera null somente no payload de edição para limpar valores existentes", () => {
    expect(normalizeDocumentDates({ issueDate: "", expiryDate: "" }, "null")).toEqual({ issueDate: null, expiryDate: null });
  });

  it("rejeita validade anterior à emissão com mensagem amigável", () => {
    expect(validateDocumentDates({ issueDate: "2026-08-26", expiryDate: "2026-01-01" })).toBe("A data de validade não pode ser anterior à data de emissão.");
  });

  it.each(["26/08/2026", "abc", "2026-99-99"])("rejeita a data realmente inválida %s", (date) => {
    expect(validateDocumentDates({ issueDate: date })).toBe("Informe uma data válida.");
  });
});
