import { getPool, sql } from "../services/sql";
import type { AppUser } from "../types/auth";
import type { DocumentQuery, DocumentUpdate } from "../validation/documents";
import type { FileRecord } from "./fileRepository";

const tableFor = (record: FileRecord) => record.kind === "company-document" ? "company_documents" : record.kind === "driver-document" ? "driver_documents" : "vehicle_documents";

export async function listDocuments(filters: DocumentQuery, user: AppUser): Promise<unknown[]> {
  const pool = await getPool();
  const request = pool.request();
  const where = ["1=1"];
  if (user.role === "supplier") {
    request.input("scopeCompanyId", sql.UniqueIdentifier, user.companyId);
    where.push("d.companyId=@scopeCompanyId");
  }
  const identifiers: [keyof DocumentQuery, string][] = [
    ["entityId", "d.entityId=@entityId"], ["clientId", "d.clientId=@clientId"], ["companyId", "d.companyId=@companyId"]
  ];
  identifiers.forEach(([key, clause]) => {
    const value = filters[key];
    if (value) { request.input(String(key), sql.UniqueIdentifier, value); where.push(clause); }
  });
  if (filters.entityType) { request.input("entityType", sql.NVarChar(20), filters.entityType); where.push("d.entityType=@entityType"); }
  if (filters.documentType) { request.input("documentType", sql.NVarChar(60), filters.documentType); where.push("d.documentType=@documentType"); }
  if (filters.status) { request.input("status", sql.NVarChar(20), filters.status); where.push("d.documentStatus=@status"); }
  if (filters.search) {
    request.input("search", sql.NVarChar(190), `%${filters.search}%`);
    where.push("(d.label LIKE @search OR d.fileName LIKE @search OR d.entityName LIKE @search OR d.entityIdentifier LIKE @search)");
  }

  const result = await request.query(`
    WITH all_documents AS (
      SELECT cd.id,'company' AS entityType,cd.company_id AS entityId,cl.id AS clientId,cl.name AS clientName,
        co.id AS companyId,co.legal_name AS companyName,co.legal_name AS entityName,co.document AS entityIdentifier,
        cd.document_type AS documentType,cd.label,cd.original_filename AS fileName,cd.mime_type AS mimeType,
        cd.file_size AS size,cd.issue_date AS issueDate,cd.expiry_date AS expiryDate,cd.observation,cd.created_at AS createdAt,cd.updated_at AS updatedAt
      FROM dbo.company_documents cd JOIN dbo.companies co ON co.id=cd.company_id JOIN dbo.clients cl ON cl.id=co.client_id
      UNION ALL
      SELECT dd.id,'driver',dd.driver_id,cl.id,cl.name,co.id,co.legal_name,d.name,d.registration,
        dd.document_type,dd.label,dd.original_filename,dd.mime_type,dd.file_size,dd.issue_date,dd.expiry_date,dd.observation,dd.created_at,dd.updated_at
      FROM dbo.driver_documents dd JOIN dbo.drivers d ON d.id=dd.driver_id JOIN dbo.companies co ON co.id=d.company_id JOIN dbo.clients cl ON cl.id=co.client_id
      UNION ALL
      SELECT vd.id,'vehicle',vd.vehicle_id,cl.id,cl.name,co.id,co.legal_name,CONCAT(v.plate,' · ',v.brand,' ',v.model),v.plate,
        vd.document_type,vd.label,vd.original_filename,vd.mime_type,vd.file_size,vd.issue_date,vd.expiry_date,vd.observation,vd.created_at,vd.updated_at
      FROM dbo.vehicle_documents vd JOIN dbo.vehicles v ON v.id=vd.vehicle_id JOIN dbo.companies co ON co.id=v.company_id JOIN dbo.clients cl ON cl.id=co.client_id
    ), classified AS (
      SELECT documents.*,
        CASE WHEN expiryDate IS NULL THEN 'VALID'
          WHEN expiryDate<CAST(GETUTCDATE() AS date) THEN 'EXPIRED'
          WHEN expiryDate<=DATEADD(day,settings.expiry_alert_days,CAST(GETUTCDATE() AS date)) THEN 'EXPIRING'
          ELSE 'VALID' END AS documentStatus
      FROM all_documents documents CROSS JOIN dbo.system_settings settings
    )
    SELECT d.* FROM classified d WHERE ${where.join(" AND ")}
    ORDER BY CASE d.documentStatus WHEN 'EXPIRED' THEN 1 WHEN 'EXPIRING' THEN 2 ELSE 3 END,d.expiryDate,d.createdAt DESC
  `);
  return result.recordset.map((item) => ({ ...item, url: `/api/files/${item.id}` }));
}

export async function updateDocumentMetadata(record: FileRecord, input: DocumentUpdate, actorId: string): Promise<void> {
  const sets: string[] = [];
  const pool = await getPool();
  const request = pool.request().input("id", sql.UniqueIdentifier, record.id).input("actorId", sql.UniqueIdentifier, actorId);
  if (input.documentType !== undefined) { request.input("documentType", sql.NVarChar(60), input.documentType); sets.push("document_type=@documentType"); }
  if (input.label !== undefined) { request.input("label", sql.NVarChar(140), input.label); sets.push("label=@label"); }
  if (input.issueDate !== undefined) { request.input("issueDate", sql.Date, input.issueDate); sets.push("issue_date=@issueDate"); }
  if (input.expiryDate !== undefined) { request.input("expiryDate", sql.Date, input.expiryDate); sets.push("expiry_date=@expiryDate"); }
  if (input.observation !== undefined) { request.input("observation", sql.NVarChar(500), input.observation); sets.push("observation=@observation"); }
  if (!sets.length) return;
  await request.query(`UPDATE dbo.${tableFor(record)} SET ${sets.join(",")},updated_at=SYSUTCDATETIME(),updated_by=@actorId WHERE id=@id`);
}
