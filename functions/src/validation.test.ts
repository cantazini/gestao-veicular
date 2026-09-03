import { describe, expect, it } from "vitest";
import { CHECKLIST_KEYS } from "./checklist.js";
import { calculateInspection, inspectionInputSchema } from "./inspections.js";
import { dateOnly, timeOnly } from "./validation.js";

const items = CHECKLIST_KEYS.map((key) => ({ key, categoryKey: "test", categoryLabel: "Teste", label: key, status: "conforme" as const, observation: "" }));
const validInspection = { companyId: "company", projectId: "project", vehicleId: "vehicle", driverId: "driver", inspectionDate: "2026-08-25", inspectionTime: "00:47", mileage: 100, items };

describe("validação temporal Firebase", () => {
  it.each(["00:00", "00:47", "08:30", "12:00", "23:59"])("aceita %s", (value) => expect(timeOnly.safeParse(value).success).toBe(true));
  it.each(["24:00", "12:60", "abc", "8:30", ""])("rejeita %s", (value) => expect(timeOnly.safeParse(value).success).toBe(false));
  it("preserva data e hora como valores de domínio", () => {
    const parsed = inspectionInputSchema.parse(validInspection);
    expect(parsed.inspectionDate).toBe("2026-08-25");
    expect(parsed.inspectionTime).toBe("00:47");
    expect(dateOnly.safeParse(parsed.inspectionDate).success).toBe(true);
  });
});

describe("regra oficial da vistoria", () => {
  it("exige exatamente os 39 itens oficiais", () => {
    expect(CHECKLIST_KEYS).toHaveLength(39);
    expect(inspectionInputSchema.safeParse(validInspection).success).toBe(true);
    expect(inspectionInputSchema.safeParse({ ...validInspection, items: items.slice(1) }).success).toBe(false);
  });
  it("calcula o resultado sem confiar no cliente", () => {
    const result = calculateInspection(items.map((item, index) => index < 4 ? { ...item, status: "nao_conforme" as const, observation: "Problema" } : item), 90);
    expect(result.compliancePercentage).toBe(89.7);
    expect(result.result).toBe("REPROVADO");
  });
});
