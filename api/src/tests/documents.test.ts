import { describe, expect, it } from "vitest";
import { documentQuerySchema, documentUpdateSchema } from "../validation/documents";
import { completeUploadSchema, uploadRequestSchema } from "../validation/files";
import { optionalSqlDate } from "../validation/sqlFields";

const guid = "29ABD04F-29A0-F111-9B33-002248377314";
const upload = (kind: "company-document" | "driver-document" | "vehicle-document", dates: Record<string, unknown> = {}) => ({
  kind,
  entityId: guid,
  blobPath: `documents/${guid}/arquivo.pdf`,
  fileName: "arquivo.pdf",
  mimeType: "application/pdf",
  size: 1000,
  documentType: "other",
  label: "Documento",
  ...dates
});

describe("contratos de documentos", () => {
  it.each(["company-document", "driver-document", "vehicle-document"] as const)("aceita upload de %s com emissão, validade e observação", (kind) => {
    expect(completeUploadSchema.parse({ ...upload(kind, { issueDate: "2026-01-01", expiryDate: "2027-01-01" }), observation: "Teste" })).toMatchObject({ kind, entityId: guid, issueDate: "2026-01-01" });
  });

  it.each(["company-document", "driver-document", "vehicle-document"] as const)("normaliza emissão e validade vazias no upload de %s", (kind) => {
    const request = uploadRequestSchema.parse({ ...upload(kind, { issueDate: "", expiryDate: "" }), blobPath: undefined });
    const complete = completeUploadSchema.parse(upload(kind, { issueDate: "", expiryDate: "" }));
    expect(request.issueDate).toBeUndefined();
    expect(request.expiryDate).toBeUndefined();
    expect(complete.issueDate).toBeUndefined();
    expect(complete.expiryDate).toBeUndefined();
  });

  it.each([
    [{ issueDate: "2026-08-26", expiryDate: "" }, { issueDate: "2026-08-26", expiryDate: undefined }],
    [{ issueDate: "", expiryDate: "2027-08-26" }, { issueDate: undefined, expiryDate: "2027-08-26" }],
    [{ issueDate: "2026-08-26", expiryDate: "2027-08-26" }, { issueDate: "2026-08-26", expiryDate: "2027-08-26" }]
  ])("aceita combinações válidas de datas opcionais", (dates, expected) => {
    expect(completeUploadSchema.parse(upload("company-document", dates))).toMatchObject(expected);
  });

  it("rejeita validade anterior à emissão com mensagem amigável", () => {
    const result = completeUploadSchema.safeParse(upload("company-document", { issueDate: "2026-08-26", expiryDate: "2026-01-01" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]).toMatchObject({ path: ["expiryDate"], message: "A data de validade não pode ser anterior à data de emissão." });
  });

  it.each(["26/08/2026", "abc", "2026-99-99"])("rejeita a data inválida %s sem expor mensagem técnica", (date) => {
    const result = optionalSqlDate.safeParse(date);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Informe uma data válida.");
  });

  it("normaliza vazios e aceita limpar datas explicitamente durante a edição", () => {
    expect(documentUpdateSchema.parse({ issueDate: "", expiryDate: "" })).toEqual({ issueDate: undefined, expiryDate: undefined });
    expect(documentUpdateSchema.parse({ issueDate: null, expiryDate: null })).toEqual({ issueDate: null, expiryDate: null });
  });

  it("valida a ordem das datas na edição de documento existente", () => {
    expect(documentUpdateSchema.safeParse({ issueDate: "2026-08-26", expiryDate: "2026-01-01" }).success).toBe(false);
    expect(documentUpdateSchema.parse({ issueDate: "2026-08-26", expiryDate: "2027-01-01" })).toMatchObject({ expiryDate: "2027-01-01" });
  });

  it("valida filtros relacionais com GUID do SQL Server", () => {
    expect(documentQuerySchema.parse({ entityType: "vehicle", clientId: guid, companyId: guid, status: "EXPIRING" })).toMatchObject({ clientId: guid, status: "EXPIRING" });
  });
});
