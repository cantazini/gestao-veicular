import { describe, expect, it } from "vitest";
import { classifyDocumentExpiry, countDocumentStatuses, documentExpiryKey, documentWarningDays } from "./documentStatus";

const today = new Date(2026, 8, 28, 15, 30);

describe("classificação de documentos", () => {
  it("classifica como vencido o documento com validade anterior a hoje", () => {
    expect(classifyDocumentExpiry("2026-09-27", 30, today)).toBe("EXPIRED");
  });
  it("classifica como a vencer os limites de hoje e de hoje + janela", () => {
    expect(classifyDocumentExpiry("2026-09-28", 30, today)).toBe("EXPIRING");
    expect(classifyDocumentExpiry("2026-10-28", 30, today)).toBe("EXPIRING");
  });
  it("classifica como válido o documento após a janela", () => {
    expect(classifyDocumentExpiry("2026-10-29", 30, today)).toBe("VALID");
  });
  it("mantém a semântica histórica: documento sem validade é válido", () => {
    expect(classifyDocumentExpiry(null, 30, today)).toBe("VALID");
    expect(classifyDocumentExpiry("", 30, today)).toBe("VALID");
  });
  it("respeita a janela configurada", () => {
    expect(classifyDocumentExpiry("2026-10-10", 7, today)).toBe("VALID");
    expect(classifyDocumentExpiry("2026-10-05", 7, today)).toBe("EXPIRING");
    expect(documentWarningDays({ documentExpiryWarningDays: 15, expiryAlertDays: 45 })).toBe(15);
    expect(documentWarningDays({ expiryAlertDays: 45 })).toBe(45);
    expect(documentWarningDays(undefined)).toBe(30);
  });
  it("aceita ISO completo e Timestamp do Firestore", () => {
    expect(documentExpiryKey("2026-10-01T00:00:00.000Z")).toBe("2026-10-01");
    expect(classifyDocumentExpiry({ toDate: () => new Date(2026, 8, 1) }, 30, today)).toBe("EXPIRED");
  });
});

describe("contagem dos indicadores de documentos", () => {
  it("não duplica documentos e a soma corresponde ao total ativo", () => {
    const documents = [
      { expiryDate: "2026-01-01" }, { expiryDate: "2026-09-27" },
      { expiryDate: "2026-10-01" },
      { expiryDate: "2027-01-01" }, { expiryDate: null },
      { expiryDate: "2020-01-01", active: false }
    ];
    const counts = countDocumentStatuses(documents, 30, today);
    expect(counts).toEqual({ validDocuments: 2, expiringDocuments: 1, expiredDocuments: 2 });
    expect(counts.validDocuments + counts.expiringDocuments + counts.expiredDocuments).toBe(documents.filter((item) => item.active !== false).length);
  });
});
