import { getPool, sql, withTransaction } from "../services/sql";
import { calculateCompliance, CHECKLIST_ITEMS, validateChecklist } from "../services/checklist";
import type { AppUser } from "../types/auth";
import type { InspectionInput, PageResult } from "../types/domain";
import { badRequest, conflict, notFound } from "../utils/errors";
import { normalizePlate } from "../utils/normalize";
import { sqlTime, toSqlLocalDateTime } from "../validation/sqlFields";

interface InspectionQuery {
  page: number; pageSize: number; startDate?: string; endDate?: string; clientId?: string; companyId?: string;
  projectId?: string; vehicleId?: string; driverId?: string; plate?: string; result?: string; inspector?: string;
}

export interface InspectionPersistenceDependencies {
  runInTransaction: typeof withTransaction;
  createRequest: (transaction: sql.Transaction) => sql.Request;
  createId: () => string;
}

const defaultPersistenceDependencies: InspectionPersistenceDependencies = {
  runInTransaction: withTransaction,
  createRequest: (transaction) => new sql.Request(transaction),
  createId: () => crypto.randomUUID()
};

function bindOptionalFilters(request: sql.Request, filters: InspectionQuery): string[] {
  const where = ["1=1"];
  const fields: [keyof InspectionQuery, string, sql.ISqlTypeFactoryWithLength | sql.ISqlTypeFactoryWithNoParams][] = [
    ["startDate", "i.inspection_date>=@startDate", sql.Date], ["endDate", "i.inspection_date<=@endDate", sql.Date],
    ["clientId", "i.client_id=@clientId", sql.UniqueIdentifier], ["companyId", "i.company_id=@companyId", sql.UniqueIdentifier],
    ["projectId", "i.project_id=@projectId", sql.UniqueIdentifier], ["vehicleId", "i.vehicle_id=@vehicleId", sql.UniqueIdentifier],
    ["driverId", "i.driver_id=@driverId", sql.UniqueIdentifier], ["result", "i.result=@result", sql.NVarChar]
  ];
  fields.forEach(([key, clause, type]) => {
    const value = filters[key];
    if (value) { request.input(String(key), type as never, value); where.push(clause); }
  });
  if (filters.plate) { request.input("plate", sql.NVarChar(12), `%${normalizePlate(filters.plate)}%`); where.push("v.plate_normalized LIKE @plate"); }
  if (filters.inspector) { request.input("inspector", sql.NVarChar(180), `%${filters.inspector}%`); where.push("u.name LIKE @inspector"); }
  return where;
}

export async function listInspections(filters: InspectionQuery): Promise<PageResult<Record<string, unknown>>> {
  const pool = await getPool();
  const request = pool.request();
  const where = bindOptionalFilters(request, filters).join(" AND ");
  request.input("offset", sql.Int, (filters.page - 1) * filters.pageSize).input("pageSize", sql.Int, filters.pageSize);
  const result = await request.query(`
    SELECT i.id, i.code, i.vehicle_sequence AS vehicleSequence, i.inspection_date AS inspectionDate,
      CONVERT(varchar(5), i.inspection_time, 108) AS inspectionTime, i.mileage, i.compliance_percentage AS compliancePercentage,
      i.compliant_count AS compliantCount, i.non_compliant_count AS nonCompliantCount, i.not_applicable_count AS notApplicableCount,
      i.result, i.general_observations AS generalObservations, i.created_at AS createdAt,
      c.name AS clientName, c.id AS clientId, co.legal_name AS companyName, co.id AS companyId,
      p.name AS projectName, p.id AS projectId, d.name AS driverName, d.id AS driverId,
      v.plate, v.id AS vehicleId, v.brand, v.model, u.name AS inspectorName,
      COUNT(1) OVER() AS [_total]
    FROM dbo.inspections i
    JOIN dbo.clients c ON c.id=i.client_id
    JOIN dbo.companies co ON co.id=i.company_id
    JOIN dbo.projects p ON p.id=i.project_id
    JOIN dbo.drivers d ON d.id=i.driver_id
    JOIN dbo.vehicles v ON v.id=i.vehicle_id
    JOIN dbo.app_users u ON u.id=i.inspector_user_id
    WHERE ${where}
    ORDER BY i.inspection_date DESC, i.inspection_time DESC, i.created_at DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);
  const total = Number(result.recordset[0]?._total || 0);
  return { items: result.recordset.map(({ _total, ...row }) => row), page: filters.page, pageSize: filters.pageSize, total };
}

export async function getInspection(id: string, user: AppUser): Promise<Record<string, unknown> | null> {
  const pool = await getPool();
  const request = pool.request().input("id", sql.UniqueIdentifier, id);
  if (user.companyId) request.input("scopeCompanyId", sql.UniqueIdentifier, user.companyId);
  const supplierScope = user.role === "supplier" ? "AND i.company_id=@scopeCompanyId" : "";
  const result = await request.query(`
    SELECT i.id, i.code, i.vehicle_sequence AS vehicleSequence, i.inspection_date AS inspectionDate,
      CONVERT(varchar(5), i.inspection_time, 108) AS inspectionTime, i.device_recorded_at AS deviceRecordedAt,
      i.server_recorded_at AS serverRecordedAt, i.mileage, i.compliance_percentage AS compliancePercentage,
      i.compliant_count AS compliantCount, i.non_compliant_count AS nonCompliantCount,
      i.not_applicable_count AS notApplicableCount, i.applicable_count AS applicableCount,
      i.threshold_percentage AS thresholdPercentage, i.result, i.general_observations AS generalObservations,
      i.snapshot_json AS snapshotJson, u.name AS inspectorName, i.created_at AS createdAt
    FROM dbo.inspections i JOIN dbo.app_users u ON u.id=i.inspector_user_id WHERE i.id=@id ${supplierScope};
    SELECT id, item_key AS [key], category_key AS categoryKey, category_label AS categoryLabel,
      item_label AS label, status, observation, display_order AS displayOrder
    FROM dbo.inspection_items WHERE inspection_id=@id ORDER BY display_order;
    SELECT id, photo_type AS photoType, label, description, mime_type AS mimeType, width, height,
      original_size AS originalSize, stored_size AS storedSize, created_at AS createdAt
    FROM dbo.inspection_photos WHERE inspection_id=@id ORDER BY display_order, created_at;
  `);
  const sets = result.recordsets as unknown as Record<string, unknown>[][];
  const inspection = sets[0][0];
  if (!inspection) return null;
  const { snapshotJson, ...base } = inspection;
  return {
    ...base,
    snapshot: snapshotJson ? JSON.parse(String(snapshotJson)) : {},
    items: sets[1],
    photos: sets[2].map((photo) => ({ ...photo, url: `/api/files/${photo.id}` }))
  };
}

export async function createInspection(input: InspectionInput, actor: AppUser, dependencies: InspectionPersistenceDependencies = defaultPersistenceDependencies): Promise<Record<string, unknown>> {
  validateChecklist(input.items);
  const summary = calculateCompliance(input.items);
  const inspectionTime = sqlTime.parse(input.inspectionTime);
  const deviceRecordedAt = toSqlLocalDateTime(input.inspectionDate, inspectionTime);
  const id = dependencies.createId();

  return dependencies.runInTransaction(async (transaction) => {
    const metadata = await dependencies.createRequest(transaction)
      .input("vehicleId", sql.UniqueIdentifier, input.vehicleId)
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("driverId", sql.UniqueIdentifier, input.driverId)
      .input("projectId", sql.UniqueIdentifier, input.projectId)
      .query(`
        SELECT v.id, v.plate, v.plate_normalized, v.brand, v.model, v.year, v.type, v.color, v.fuel, v.mileage,
          v.ownership, v.rental_company, v.inspection_sequence, v.active AS vehicle_active,
          co.id AS company_id, co.legal_name AS company_name, co.trade_name, co.document, co.unit, co.manager_name,
          co.contract_number, co.contract_start, co.contract_end, co.active AS company_active,
          c.id AS client_id, c.name AS client_name, c.legal_name AS client_legal_name, c.document AS client_document,
          c.logo_blob_path AS client_logo_blob_path,
          p.id AS project_id, p.name AS project_name, p.code AS project_code,
          d.id AS driver_id, d.name AS driver_name, d.registration, d.job_title, d.license_category,
          d.license_number, d.license_expiry, d.provisional_license, d.active AS driver_active,
          ap.id AS access_profile_id, ap.name AS access_profile_name, ap.description AS access_profile_description, ap.color AS access_profile_color,
          CASE WHEN vd.vehicle_id IS NULL THEN 0 ELSE 1 END AS driver_linked
        FROM dbo.vehicles v WITH (UPDLOCK,HOLDLOCK)
        JOIN dbo.companies co ON co.id=v.company_id
        JOIN dbo.clients c ON c.id=co.client_id
        JOIN dbo.projects p ON p.id=v.project_id
        JOIN dbo.company_projects cp ON cp.company_id=co.id AND cp.project_id=p.id
        JOIN dbo.drivers d ON d.id=@driverId AND d.company_id=co.id
        JOIN dbo.access_profiles ap ON ap.id=v.access_profile_id
        LEFT JOIN dbo.vehicle_drivers vd ON vd.vehicle_id=v.id AND vd.driver_id=d.id
        WHERE v.id=@vehicleId AND v.company_id=@companyId AND v.project_id=@projectId
          AND v.active=1 AND co.active=1 AND c.active=1 AND p.active=1 AND d.active=1 AND ap.active=1
      `);
    const row = metadata.recordset[0];
    if (!row) throw notFound("Selecione vínculos ativos e válidos entre empresa, projeto, veículo e motorista.");
    if (!row.driver_linked) throw badRequest("O motorista não está vinculado ao veículo selecionado.");
    if (Number(input.mileage) < Number(row.mileage || 0)) throw conflict(`A quilometragem não pode ser menor que ${row.mileage} km.`);

    const settingsResult = await dependencies.createRequest(transaction).query("SELECT minimum_inspection_compliance FROM dbo.system_settings WHERE id=1");
    const threshold = Number(settingsResult.recordset[0]?.minimum_inspection_compliance ?? 90);
    const resultStatus = summary.percentage >= threshold ? "APROVADO" : "REPROVADO";
    const sequence = Number(row.inspection_sequence || 0) + 1;
    const code = `VIST-${row.plate_normalized}-${String(sequence).padStart(3, "0")}`;
    const snapshot = {
      client: { id: row.client_id, name: row.client_name, legalName: row.client_legal_name, document: row.client_document, logoBlobPath: row.client_logo_blob_path },
      company: { id: row.company_id, legalName: row.company_name, tradeName: row.trade_name, document: row.document, unit: row.unit, managerName: row.manager_name, contractNumber: row.contract_number, contractStart: row.contract_start, contractEnd: row.contract_end },
      project: { id: row.project_id, name: row.project_name, code: row.project_code },
      driver: { id: row.driver_id, name: row.driver_name, registration: row.registration, jobTitle: row.job_title, licenseCategory: row.license_category, licenseNumber: row.license_number, licenseExpiry: row.license_expiry, provisionalLicense: Boolean(row.provisional_license) },
      vehicle: { id: row.id, plate: row.plate, brand: row.brand, model: row.model, year: row.year, type: row.type, color: row.color, fuel: row.fuel, ownership: row.ownership, rentalCompany: row.rental_company },
      accessProfile: { id: row.access_profile_id, name: row.access_profile_name, description: row.access_profile_description, color: row.access_profile_color }
    };

    await dependencies.createRequest(transaction)
      .input("id", sql.UniqueIdentifier, id).input("code", sql.NVarChar(40), code).input("sequence", sql.Int, sequence)
      .input("clientId", sql.UniqueIdentifier, row.client_id).input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("projectId", sql.UniqueIdentifier, input.projectId).input("vehicleId", sql.UniqueIdentifier, input.vehicleId)
      .input("driverId", sql.UniqueIdentifier, input.driverId).input("inspectorId", sql.UniqueIdentifier, actor.id)
      .input("inspectionDate", sql.Date, input.inspectionDate).input("inspectionTime", sql.NVarChar(5), inspectionTime)
      .input("deviceRecordedAt", sql.NVarChar(19), deviceRecordedAt)
      .input("mileage", sql.Int, input.mileage).input("compliant", sql.Int, summary.compliant)
      .input("nonCompliant", sql.Int, summary.nonCompliant).input("notApplicable", sql.Int, summary.notApplicable)
      .input("applicable", sql.Int, summary.applicable).input("percentage", sql.Decimal(5, 2), summary.percentage)
      .input("threshold", sql.Decimal(5, 2), threshold).input("result", sql.NVarChar(20), resultStatus)
      .input("observations", sql.NVarChar(4000), input.generalObservations || "")
      .input("snapshot", sql.NVarChar(sql.MAX), JSON.stringify(snapshot)).input("actorId", sql.UniqueIdentifier, actor.id)
      .query(`INSERT INTO dbo.inspections (id,code,vehicle_sequence,client_id,company_id,project_id,vehicle_id,driver_id,inspector_user_id,
        inspection_date,inspection_time,device_recorded_at,mileage,compliant_count,non_compliant_count,not_applicable_count,
        applicable_count,compliance_percentage,threshold_percentage,result,general_observations,snapshot_json,created_by,updated_by)
        VALUES (@id,@code,@sequence,@clientId,@companyId,@projectId,@vehicleId,@driverId,@inspectorId,@inspectionDate,
        CONVERT(time(0),@inspectionTime,108),CONVERT(datetime2(0),@deviceRecordedAt,126),@mileage,@compliant,@nonCompliant,
        @notApplicable,@applicable,@percentage,@threshold,@result,@observations,@snapshot,@actorId,@actorId)`);

    const official = new Map<string, { key: string; label: string; categoryKey: string; categoryLabel: string; displayOrder: number }>(CHECKLIST_ITEMS.map((item, index) => [item.key, { ...item, displayOrder: index + 1 }]));
    for (const item of input.items) {
      const definition = official.get(item.key)!;
      await dependencies.createRequest(transaction)
        .input("inspectionId", sql.UniqueIdentifier, id).input("key", sql.NVarChar(80), definition.key)
        .input("categoryKey", sql.NVarChar(80), definition.categoryKey).input("categoryLabel", sql.NVarChar(100), definition.categoryLabel)
        .input("label", sql.NVarChar(200), definition.label).input("status", sql.NVarChar(30), item.status)
        .input("observation", sql.NVarChar(500), item.observation || "").input("displayOrder", sql.Int, definition.displayOrder)
        .query(`INSERT INTO dbo.inspection_items (inspection_id,item_key,category_key,category_label,item_label,status,observation,display_order)
                VALUES (@inspectionId,@key,@categoryKey,@categoryLabel,@label,@status,@observation,@displayOrder)`);
    }
    await dependencies.createRequest(transaction).input("vehicleId", sql.UniqueIdentifier, input.vehicleId).input("sequence", sql.Int, sequence)
      .input("mileage", sql.Int, input.mileage).input("actorId", sql.UniqueIdentifier, actor.id)
      .query("UPDATE dbo.vehicles SET inspection_sequence=@sequence,mileage=@mileage,updated_at=SYSUTCDATETIME(),updated_by=@actorId WHERE id=@vehicleId");
    return { id, code, vehicleSequence: sequence, result: resultStatus, compliancePercentage: summary.percentage, summary, snapshot };
  });
}
