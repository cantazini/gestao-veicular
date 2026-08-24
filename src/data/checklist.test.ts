import { describe, expect, it } from "vitest";
import { CHECKLIST_GROUPS, newChecklist, statusLabel } from "./checklist";

describe("checklist oficial", () => {
  it("mantém 39 itens distribuídos em 10, 12, 9 e 8", () => {
    expect(CHECKLIST_GROUPS.map(group => group.items.length)).toEqual([10, 12, 9, 8]);
    expect(newChecklist()).toHaveLength(39);
  });
  it("inicia os itens como conformes", () => expect(newChecklist().every(item => item.status === "conforme")).toBe(true));
  it("traduz os três resultados", () => expect([statusLabel("conforme"), statusLabel("nao_conforme"), statusLabel("nao_se_aplica")]).toEqual(["Conforme", "Não conforme", "Não se aplica"]));
});
