import { describe, expect, it } from "vitest";
import { calculateCompliance, CHECKLIST_ITEMS, validateChecklist } from "../services/checklist";
import type { InspectionItemInput } from "../types/domain";

function items(): InspectionItemInput[] {
  return CHECKLIST_ITEMS.map((item) => ({ ...item, status: "conforme" as const, observation: "" }));
}

describe("checklist", () => {
  it("mantém exatamente 39 itens oficiais", () => expect(CHECKLIST_ITEMS).toHaveLength(39));

  it("retira Não se Aplica do denominador", () => {
    const sample = items();
    sample[0].status = "nao_se_aplica";
    sample[1].status = "nao_conforme";
    sample[1].observation = "Teste";
    expect(calculateCompliance(sample)).toMatchObject({ applicable: 38, compliant: 37, nonCompliant: 1, notApplicable: 1, percentage: 97.4 });
  });

  it("exige observação para não conformidade", () => {
    const sample = items();
    sample[0].status = "nao_conforme";
    expect(() => validateChecklist(sample)).toThrow(/Descreva/);
  });
});
