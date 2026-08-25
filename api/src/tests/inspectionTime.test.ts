import { describe, expect, it } from "vitest";
import { inspectionSchema } from "../validation/inspection";
import { sqlTime, toSqlLocalDateTime } from "../validation/sqlFields";

const SQL_GUID = "29ABD04F-29A0-F111-9B33-002248377314";
const validBase = {
  companyId: SQL_GUID,
  projectId: SQL_GUID,
  vehicleId: SQL_GUID,
  driverId: SQL_GUID,
  inspectionDate: "2026-08-25",
  mileage: 100,
  items: []
};

describe("horário de vistoria compatível com SQL Server time(0)", () => {
  it.each(["00:00", "00:47", "08:30", "12:00", "23:59"])("aceita %s sem alterar o valor", (time) => {
    expect(sqlTime.parse(time)).toBe(time);
    expect(inspectionSchema.parse({ ...validBase, inspectionTime: time }).inspectionTime).toBe(time);
  });

  it.each(["24:00", "12:60", "abc", "8:30", ""])("rejeita o horário inválido %j", (time) => {
    const result = inspectionSchema.safeParse({ ...validBase, inspectionTime: time });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("Horário inválido. Use o formato HH:mm.");
  });

  it("compõe data e hora locais sem timezone ou deslocamento", () => {
    expect(toSqlLocalDateTime("2026-08-25", "00:47")).toBe("2026-08-25T00:47:00");
  });

  it("mantém GUIDs SQL Server nos quatro relacionamentos obrigatórios", () => {
    const parsed = inspectionSchema.parse({ ...validBase, inspectionTime: "08:30" });
    expect([parsed.companyId, parsed.projectId, parsed.vehicleId, parsed.driverId]).toEqual([SQL_GUID, SQL_GUID, SQL_GUID, SQL_GUID]);
  });
});
