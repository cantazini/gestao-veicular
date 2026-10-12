import { getPool, sql } from "../services/sql";
import type { AppUser } from "../types/auth";

export async function getDashboard(user: AppUser): Promise<Record<string, unknown>> {
  const pool = await getPool();
  const request = pool.request();
  const supplier = user.role === "supplier";
  if (user.companyId) request.input("companyId", sql.UniqueIdentifier, user.companyId);
  const scope = supplier ? "AND company_id=@companyId" : "";
  const result = await request.query(`
    ;WITH LatestInspections AS (
      SELECT vehicle_id,result,ROW_NUMBER() OVER (PARTITION BY vehicle_id ORDER BY created_at DESC,code DESC,id DESC) AS position
      FROM dbo.inspections WHERE 1=1 ${scope}
    )
    SELECT
      (SELECT COUNT(*) FROM dbo.inspections WHERE 1=1 ${scope}) AS inspections,
      (SELECT COUNT(*) FROM dbo.vehicles WHERE active=1 ${scope}) AS vehicles,
      (SELECT COUNT(*) FROM dbo.drivers WHERE active=1 ${scope}) AS drivers,
      (SELECT COUNT(*) FROM dbo.companies WHERE active=1 ${supplier ? "AND id=@companyId" : ""}) AS companies,
      (SELECT COUNT(*) FROM LatestInspections WHERE position=1 AND result='REPROVADO') AS pendingVehicles;
    ;WITH SequencedInspections AS (
    SELECT i.id,i.code,i.inspection_date AS inspectionDate,CONVERT(varchar(5),i.inspection_time,108) AS inspectionTime,
      i.result,i.compliance_percentage AS compliancePercentage,v.plate,co.legal_name AS companyName,d.name AS driverName,u.name AS inspectorName
      ,i.created_at AS createdAt,ROW_NUMBER() OVER (PARTITION BY i.vehicle_id ORDER BY i.created_at ASC,i.code ASC,i.id ASC) AS sequence
      FROM dbo.inspections i JOIN dbo.vehicles v ON v.id=i.vehicle_id JOIN dbo.companies co ON co.id=i.company_id
      JOIN dbo.drivers d ON d.id=i.driver_id JOIN dbo.app_users u ON u.id=i.inspector_user_id
      WHERE 1=1 ${scope.replaceAll("company_id", "i.company_id")}
    )
    SELECT TOP 8 id,code,inspectionDate,inspectionTime,result,compliancePercentage,plate,companyName,driverName,inspectorName,sequence
      FROM SequencedInspections ORDER BY createdAt DESC,code DESC,id DESC;
    SELECT
      (SELECT COUNT(*) FROM dbo.company_documents cd JOIN dbo.companies c ON c.id=cd.company_id WHERE cd.expiry_date BETWEEN CAST(GETUTCDATE() AS date) AND DATEADD(day,30,CAST(GETUTCDATE() AS date)) ${supplier ? "AND c.id=@companyId" : ""}) +
      (SELECT COUNT(*) FROM dbo.driver_documents dd JOIN dbo.drivers d ON d.id=dd.driver_id WHERE dd.expiry_date BETWEEN CAST(GETUTCDATE() AS date) AND DATEADD(day,30,CAST(GETUTCDATE() AS date)) ${supplier ? "AND d.company_id=@companyId" : ""}) +
      (SELECT COUNT(*) FROM dbo.vehicle_documents vd JOIN dbo.vehicles v ON v.id=vd.vehicle_id WHERE vd.expiry_date BETWEEN CAST(GETUTCDATE() AS date) AND DATEADD(day,30,CAST(GETUTCDATE() AS date)) ${supplier ? "AND v.company_id=@companyId" : ""}) AS expiringDocuments;
  `);
  const sets = result.recordsets as unknown as Record<string, unknown>[][];
  return { metrics: sets[0][0], recentInspections: sets[1], alerts: sets[2][0] };
}
