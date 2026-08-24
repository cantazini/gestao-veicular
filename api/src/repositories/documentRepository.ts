import { getPool, sql } from "../services/sql";
import type { AppUser } from "../types/auth";
import { forbidden } from "../utils/errors";

export async function listDocuments(entityType: string, entityId: string, user: AppUser): Promise<unknown[]> {
  const allowed = ["company", "driver", "vehicle"];
  if (!allowed.includes(entityType)) throw forbidden();
  const pool = await getPool();
  const request = pool.request().input("entityId", sql.UniqueIdentifier, entityId);
  if (user.companyId) request.input("companyId", sql.UniqueIdentifier, user.companyId);
  const config = entityType === "company"
    ? { table: "company_documents", fk: "company_id", scope: "@entityId=@companyId" }
    : entityType === "driver"
      ? { table: "driver_documents", fk: "driver_id", scope: "EXISTS(SELECT 1 FROM dbo.drivers d WHERE d.id=@entityId AND d.company_id=@companyId)" }
      : { table: "vehicle_documents", fk: "vehicle_id", scope: "EXISTS(SELECT 1 FROM dbo.vehicles v WHERE v.id=@entityId AND v.company_id=@companyId)" };
  const scope = user.role === "supplier" ? `AND ${config.scope}` : "";
  const result = await request.query(`SELECT id,document_type AS documentType,label,original_filename AS fileName,mime_type AS mimeType,file_size AS size,
    expiry_date AS expiryDate,created_at AS createdAt FROM dbo.${config.table} WHERE ${config.fk}=@entityId ${scope} ORDER BY created_at DESC`);
  return result.recordset.map((item) => ({ ...item, url: `/api/files/${item.id}` }));
}
