import type { Request, Transaction } from "mssql";
import { describe, expect, it, vi } from "vitest";
import { createInspection, type InspectionPersistenceDependencies } from "../repositories/inspectionRepository";
import { CHECKLIST_ITEMS } from "../services/checklist";
import { executeTransaction, withTransaction } from "../services/sql";
import type { AppUser } from "../types/auth";
import type { InspectionInput } from "../types/domain";

const SQL_GUID = "29ABD04F-29A0-F111-9B33-002248377314";
const INSPECTION_ID = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";

const actor: AppUser = {
  id: SQL_GUID,
  identityProviderId: "entra-user",
  email: "fiscalizador@empresa.com",
  name: "Fiscalizador",
  role: "inspector",
  companyId: null,
  active: true
};

function inspectionInput(): InspectionInput {
  return {
    companyId: SQL_GUID,
    projectId: SQL_GUID,
    vehicleId: SQL_GUID,
    driverId: SQL_GUID,
    inspectionDate: "2026-08-25",
    inspectionTime: "00:47",
    mileage: 18_500,
    generalObservations: "Vistoria concluída.",
    items: CHECKLIST_ITEMS.map((item) => ({ ...item, status: "conforme", observation: "" }))
  };
}

const metadata = {
  id: SQL_GUID,
  plate: "ABC1D23",
  plate_normalized: "ABC1D23",
  brand: "Volkswagen",
  model: "Delivery",
  year: 2024,
  type: "Caminhão",
  color: "Branco",
  fuel: "Diesel",
  mileage: 18_452,
  ownership: "owned",
  rental_company: "",
  inspection_sequence: 12,
  company_id: SQL_GUID,
  company_name: "Transportes SQL",
  trade_name: "Transportes SQL",
  document: "11222333000181",
  unit: "Unidade 1",
  manager_name: "Responsável",
  contract_number: "CT-01",
  contract_start: "2026-01-01",
  contract_end: "2026-12-31",
  client_id: SQL_GUID,
  client_name: "Cliente SQL",
  client_legal_name: "Cliente SQL S.A.",
  client_document: "04252011000110",
  client_logo_blob_path: "",
  project_id: SQL_GUID,
  project_name: "Projeto SQL",
  project_code: "SQL-01",
  driver_id: SQL_GUID,
  driver_name: "Motorista SQL",
  registration: "MAT-01",
  job_title: "Motorista",
  license_category: "D",
  license_number: "123",
  license_expiry: "2027-08-25",
  provisional_license: false,
  access_profile_id: SQL_GUID,
  access_profile_name: "Operacional",
  access_profile_description: "Acesso operacional",
  access_profile_color: "#0056A4",
  driver_linked: 1
};

type CapturedRequest = { inputs: Record<string, unknown>; query: string };

function persistenceHarness(failWhen?: (query: string) => boolean) {
  const captured: CapturedRequest[] = [];
  const transaction = {
    begin: vi.fn(async () => undefined),
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => undefined)
  } as unknown as Transaction;

  class FakeRequest {
    inputs: Record<string, unknown> = {};

    input(name: string, _type: unknown, value: unknown) {
      this.inputs[name] = value;
      return this;
    }

    async query(query: string) {
      captured.push({ inputs: { ...this.inputs }, query });
      if (failWhen?.(query)) throw new Error("Falha simulada durante a persistência");
      if (query.includes("FROM dbo.vehicles")) return { recordset: [metadata] };
      if (query.includes("FROM dbo.system_settings")) return { recordset: [{ minimum_inspection_compliance: 90 }] };
      return { recordset: [] };
    }
  }

  const runInTransaction: typeof withTransaction = <T>(work: (current: Transaction) => Promise<T>) => executeTransaction(transaction, work);
  const dependencies: InspectionPersistenceDependencies = {
    runInTransaction,
    createRequest: () => new FakeRequest() as unknown as Request,
    createId: () => INSPECTION_ID
  };
  return { captured, transaction, dependencies };
}

describe("persistência transacional da vistoria", () => {
  it("cria a vistoria completa e preserva data e hora informadas", async () => {
    const harness = persistenceHarness();
    const result = await createInspection(inspectionInput(), actor, harness.dependencies);
    const inspectionInsert = harness.captured.find((request) => request.query.includes("INSERT INTO dbo.inspections"));
    const itemInserts = harness.captured.filter((request) => request.query.includes("INSERT INTO dbo.inspection_items"));
    const vehicleUpdate = harness.captured.find((request) => request.query.includes("UPDATE dbo.vehicles"));

    expect(result).toMatchObject({ id: INSPECTION_ID, code: "VIST-ABC1D23-013", result: "APROVADO", compliancePercentage: 100 });
    expect(inspectionInsert?.inputs).toMatchObject({
      companyId: SQL_GUID,
      projectId: SQL_GUID,
      vehicleId: SQL_GUID,
      driverId: SQL_GUID,
      inspectionDate: "2026-08-25",
      inspectionTime: "00:47",
      deviceRecordedAt: "2026-08-25T00:47:00"
    });
    expect(inspectionInsert?.query).toContain("CONVERT(time(0),@inspectionTime,108)");
    expect(inspectionInsert?.query).toContain("CONVERT(datetime2(0),@deviceRecordedAt,126)");
    expect(itemInserts).toHaveLength(39);
    expect(vehicleUpdate).toBeDefined();
    expect(harness.transaction.begin).toHaveBeenCalledOnce();
    expect(harness.transaction.commit).toHaveBeenCalledOnce();
    expect(harness.transaction.rollback).not.toHaveBeenCalled();
  });

  it("faz rollback se ocorrer erro depois do INSERT principal", async () => {
    const harness = persistenceHarness((query) => query.includes("INSERT INTO dbo.inspection_items"));

    await expect(createInspection(inspectionInput(), actor, harness.dependencies)).rejects.toThrow("Falha simulada durante a persistência");

    expect(harness.captured.some((request) => request.query.includes("INSERT INTO dbo.inspections"))).toBe(true);
    expect(harness.transaction.begin).toHaveBeenCalledOnce();
    expect(harness.transaction.commit).not.toHaveBeenCalled();
    expect(harness.transaction.rollback).toHaveBeenCalledOnce();
    expect(harness.captured.some((request) => request.query.includes("UPDATE dbo.vehicles"))).toBe(false);
  });
});
