import type { Request } from "mssql";
import { describe, expect, it } from "vitest";
import { bindOptionalFilters, type InspectionQuery } from "../repositories/inspectionRepository";

describe("consulta de Histórico e Reprovações", () => {
  it("vincula REPROVADO diretamente à consulta SQL", () => {
    const inputs: Record<string, unknown> = {};
    const request = { input(name: string, _type: unknown, value: unknown) { inputs[name] = value; return this; } } as unknown as Request;
    const filters: InspectionQuery = { page: 1, pageSize: 100, result: "REPROVADO" };
    const where = bindOptionalFilters(request, filters);
    expect(where).toContain("i.result=@result");
    expect(inputs.result).toBe("REPROVADO");
  });

  it("não adiciona filtro de resultado ao Histórico sem seleção", () => {
    const request = { input() { return this; } } as unknown as Request;
    const where = bindOptionalFilters(request, { page: 1, pageSize: 100 });
    expect(where).not.toContain("i.result=@result");
  });
});
