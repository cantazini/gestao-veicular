import { getPool, sql } from "../services/sql";
import type { AppUser } from "../types/auth";
import type { FileKind } from "../validation/files";
import { forbidden, notFound } from "../utils/errors";

export interface FileRecord {
  id: string;
  kind: FileKind;
  entityId: string;
  companyId: string | null;
  blobPath: string;
}

export async function assertFileEntityAccess(kind: FileKind, entityId: string, user: AppUser, write: boolean): Promise<void> {
  if (kind === "client-branding") {
    if (user.role !== "admin") throw forbidden();
    return;
  }
  if (kind === "inspection-photo") {
    const pool = await getPool();
    const request = pool.request().input("id", sql.UniqueIdentifier, entityId).input("userId", sql.UniqueIdentifier, user.id);
    if (user.companyId) request.input("companyId", sql.UniqueIdentifier, user.companyId);
    const result = await request.query(`SELECT id,created_by,company_id FROM dbo.inspections WHERE id=@id`);
    const inspection = result.recordset[0];
    if (!inspection) throw notFound();
    if (user.role === "supplier" && (!user.companyId || String(inspection.company_id) !== user.companyId)) throw forbidden();
    if (write && user.role !== "admin" && (user.role !== "inspector" || String(inspection.created_by) !== user.id)) throw forbidden("A fotografia só pode ser alterada pelo fiscalizador responsável ou administrador.");
    return;
  }
  const table = kind === "company-document" ? "companies" : kind === "driver-document" ? "drivers" : "vehicles";
  const companyExpression = kind === "company-document" ? "id" : "company_id";
  const pool = await getPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, entityId).query(`SELECT ${companyExpression} AS company_id FROM dbo.${table} WHERE id=@id`);
  if (!result.recordset[0]) throw notFound();
  const companyId = String(result.recordset[0].company_id);
  if (user.role === "supplier" && user.companyId !== companyId) throw forbidden("O fornecedor só pode acessar arquivos da própria empresa.");
  if (write && user.role === "inspector") throw forbidden();
}

export async function getClientLogoPath(clientId: string, user: AppUser): Promise<string | null> {
  const pool = await getPool();
  const request = pool.request().input("id", sql.UniqueIdentifier, clientId);
  if (user.companyId) request.input("companyId", sql.UniqueIdentifier, user.companyId);
  const scope = user.role === "supplier" ? "AND EXISTS(SELECT 1 FROM dbo.companies c WHERE c.client_id=cl.id AND c.id=@companyId)" : "";
  const result = await request.query(`SELECT logo_blob_path FROM dbo.clients cl WHERE cl.id=@id ${scope}`);
  return result.recordset[0]?.logo_blob_path || null;
}

export async function saveFileMetadata(input: {
  kind: FileKind; entityId: string; blobPath: string; fileName: string; mimeType: string; size: number;
  documentType?: string; label?: string; expiryDate?: string | null; photoType?: string; description?: string;
  width?: number; height?: number; originalSize?: number;
}, actorId: string): Promise<string> {
  const id = crypto.randomUUID();
  const pool = await getPool();
  if (input.kind === "client-branding") {
    await pool.request().input("id", sql.UniqueIdentifier, input.entityId).input("path", sql.NVarChar(700), input.blobPath).input("actorId", sql.UniqueIdentifier, actorId)
      .query("UPDATE dbo.clients SET logo_blob_path=@path,updated_at=SYSUTCDATETIME(),updated_by=@actorId WHERE id=@id");
    return input.entityId;
  }
  if (input.kind === "inspection-photo") {
    await pool.request().input("id", sql.UniqueIdentifier, id).input("entityId", sql.UniqueIdentifier, input.entityId)
      .input("photoType", sql.NVarChar(60), input.photoType || "additional").input("label", sql.NVarChar(120), input.label || "Fotografia")
      .input("description", sql.NVarChar(300), input.description || "").input("fileName", sql.NVarChar(220), input.fileName)
      .input("path", sql.NVarChar(700), input.blobPath).input("mime", sql.NVarChar(120), input.mimeType)
      .input("originalSize", sql.BigInt, input.originalSize || input.size).input("storedSize", sql.BigInt, input.size)
      .input("width", sql.Int, input.width || null).input("height", sql.Int, input.height || null).input("actorId", sql.UniqueIdentifier, actorId)
      .query(`INSERT INTO dbo.inspection_photos (id,inspection_id,photo_type,label,description,original_filename,blob_path,mime_type,original_size,stored_size,width,height,created_by)
              VALUES (@id,@entityId,@photoType,@label,@description,@fileName,@path,@mime,@originalSize,@storedSize,@width,@height,@actorId)`);
    return id;
  }
  const table = input.kind === "company-document" ? "company_documents" : input.kind === "driver-document" ? "driver_documents" : "vehicle_documents";
  const foreignKey = input.kind === "company-document" ? "company_id" : input.kind === "driver-document" ? "driver_id" : "vehicle_id";
  await pool.request().input("id", sql.UniqueIdentifier, id).input("entityId", sql.UniqueIdentifier, input.entityId)
    .input("type", sql.NVarChar(60), input.documentType || "other").input("label", sql.NVarChar(140), input.label || input.fileName)
    .input("fileName", sql.NVarChar(220), input.fileName).input("path", sql.NVarChar(700), input.blobPath)
    .input("mime", sql.NVarChar(120), input.mimeType).input("size", sql.BigInt, input.size)
    .input("expiry", sql.Date, input.expiryDate || null).input("actorId", sql.UniqueIdentifier, actorId)
    .query(`INSERT INTO dbo.${table} (id,${foreignKey},document_type,label,original_filename,blob_path,mime_type,file_size,expiry_date,created_by,updated_by)
            VALUES (@id,@entityId,@type,@label,@fileName,@path,@mime,@size,@expiry,@actorId,@actorId)`);
  return id;
}

export async function findFile(id: string): Promise<FileRecord | null> {
  const pool = await getPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
    SELECT cd.id,'company-document' AS kind,cd.company_id AS entity_id,cd.company_id,cd.blob_path FROM dbo.company_documents cd WHERE cd.id=@id
    UNION ALL SELECT dd.id,'driver-document',dd.driver_id,d.company_id,dd.blob_path FROM dbo.driver_documents dd JOIN dbo.drivers d ON d.id=dd.driver_id WHERE dd.id=@id
    UNION ALL SELECT vd.id,'vehicle-document',vd.vehicle_id,v.company_id,vd.blob_path FROM dbo.vehicle_documents vd JOIN dbo.vehicles v ON v.id=vd.vehicle_id WHERE vd.id=@id
    UNION ALL SELECT ip.id,'inspection-photo',ip.inspection_id,NULL,ip.blob_path FROM dbo.inspection_photos ip WHERE ip.id=@id
  `);
  const row = result.recordset[0];
  return row ? { id: String(row.id), kind: row.kind, entityId: String(row.entity_id), companyId: row.company_id ? String(row.company_id) : null, blobPath: row.blob_path } : null;
}

export async function deleteFileMetadata(record: FileRecord): Promise<void> {
  const table = record.kind === "company-document" ? "company_documents" : record.kind === "driver-document" ? "driver_documents" : record.kind === "vehicle-document" ? "vehicle_documents" : "inspection_photos";
  const pool = await getPool();
  await pool.request().input("id", sql.UniqueIdentifier, record.id).query(`DELETE FROM dbo.${table} WHERE id=@id`);
}
