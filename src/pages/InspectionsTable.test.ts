import { describe, expect, it } from "vitest";
import { canDeleteInspections, inspectionTableColumns } from "./Inspections";

describe("tabela de Histórico e Reprovações", () => {
  it("exibe Sequência no lugar de Cliente", () => {
    expect(inspectionTableColumns).toContain("Sequência");
    expect(inspectionTableColumns).not.toContain("Cliente");
    expect(inspectionTableColumns.indexOf("Sequência")).toBe(inspectionTableColumns.indexOf("Código") + 1);
  });

  it("disponibiliza a exclusão somente para Admin", () => {
    expect(canDeleteInspections("admin")).toBe(true);
    expect(canDeleteInspections("inspector")).toBe(false);
    expect(canDeleteInspections(undefined)).toBe(false);
  });
});
