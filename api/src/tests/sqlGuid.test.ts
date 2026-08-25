import { describe, expect, it } from "vitest";
import { entitySchemas, entityUpdateSchemas } from "../validation/entities";
import { uploadRequestSchema } from "../validation/files";
import { inspectionQuerySchema, inspectionSchema } from "../validation/inspection";
import { optionalSqlGuid, sqlGuid } from "../validation/sqlFields";

const REAL_SQL_GUID = "29ABD04F-29A0-F111-9B33-002248377314";
const SECOND_SQL_GUID = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";

const companyPayload = {
  clientId: REAL_SQL_GUID,
  parentCompanyId: "",
  legalName: "Empresa vinculada Ltda.",
  tradeName: "Empresa vinculada",
  document: "04.252.011/0001-10",
  unit: "Unidade 1",
  managerName: "Responsável",
  phone: "",
  email: "",
  contractNumber: "CT-01",
  contractType: "direct" as const,
  contractStart: "",
  contractEnd: "",
  projectIds: [REAL_SQL_GUID, SECOND_SQL_GUID],
  active: true
};

describe("GUIDs compatíveis com SQL Server uniqueidentifier", () => {
  it("aceita o clientId real retornado pelo Azure SQL", () => {
    expect(sqlGuid.parse(REAL_SQL_GUID)).toBe(REAL_SQL_GUID);
  });

  it("aceita Empresa vinculada ao Cliente e normaliza opcionais vazios", () => {
    const company = entitySchemas.companies.parse(companyPayload);
    const partialUpdate = entityUpdateSchemas.companies.parse({ parentCompanyId: "", contractEnd: "" });
    expect(company.clientId).toBe(REAL_SQL_GUID);
    expect(company.parentCompanyId).toBeUndefined();
    expect(company.contractStart).toBeUndefined();
    expect(company.contractEnd).toBeUndefined();
    expect(partialUpdate.parentCompanyId).toBeUndefined();
    expect(partialUpdate.contractEnd).toBeUndefined();
  });

  it("aceita Projeto vinculado ao Cliente", () => {
    const project = entitySchemas.projects.parse({ clientId: REAL_SQL_GUID, name: "Projeto SQL", code: "SQL-01", active: true });
    expect(project.clientId).toBe(REAL_SQL_GUID);
  });

  it("aceita arrays de IDs relacionais no formato uniqueidentifier", () => {
    const company = entitySchemas.companies.parse(companyPayload);
    expect(company.projectIds).toEqual([REAL_SQL_GUID, SECOND_SQL_GUID]);
    expect(entitySchemas.companies.safeParse({ ...companyPayload, projectIds: [REAL_SQL_GUID, "id-inválido"] }).success).toBe(false);
  });

  it("normaliza IDs e datas opcionais sem valor", () => {
    expect(optionalSqlGuid.parse("")).toBeUndefined();
    expect(optionalSqlGuid.parse(null)).toBeUndefined();
    expect(entitySchemas.accessProfiles.parse({ clientId: "", name: "Perfil SQL", description: "", color: "#0056A4", gates: [], areas: [], active: true }).clientId).toBeUndefined();
    expect(uploadRequestSchema.parse({ kind: "company-document", entityId: REAL_SQL_GUID, fileName: "contrato.pdf", mimeType: "application/pdf", size: 100, expiryDate: "" }).expiryDate).toBeUndefined();
    expect(inspectionQuerySchema.parse({ clientId: "", companyId: "" }).clientId).toBeUndefined();
  });

  it("aceita os relacionamentos obrigatórios de uma vistoria", () => {
    const inspection = inspectionSchema.parse({
      companyId: REAL_SQL_GUID, vehicleId: SECOND_SQL_GUID, driverId: REAL_SQL_GUID, projectId: SECOND_SQL_GUID,
      inspectionDate: "2026-08-24", inspectionTime: "10:30", mileage: 100, items: []
    });
    expect(inspection.companyId).toBe(REAL_SQL_GUID);
  });

  it("rejeita um identificador realmente malformado", () => {
    const result = sqlGuid.safeParse("29ABD04F-29A0-F111-invalido");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Identificador inválido");
  });

  it("mantém inválidos os campos relacionais obrigatórios vazios", () => {
    expect(entitySchemas.projects.safeParse({ clientId: "", name: "Projeto inválido", code: "INV", active: true }).success).toBe(false);
    expect(entitySchemas.companies.safeParse({ ...companyPayload, clientId: "" }).success).toBe(false);
  });
});
