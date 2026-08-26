import { getPool, sql } from "../services/sql";
import type { AppUser } from "../types/auth";
import type { CredentialQuery } from "../validation/credentials";

export async function listCredentialEligibility(user: AppUser, filters: CredentialQuery = {}): Promise<Record<string, unknown>[]> {
  const pool = await getPool();
  const request = pool.request();
  if (user.companyId) request.input("companyId", sql.UniqueIdentifier, user.companyId);
  const where = ["v.active=1", "d.active=1", "co.active=1", "ap.active=1"];
  if (user.role === "supplier") where.push("v.company_id=@companyId");
  const identifiers: [keyof CredentialQuery, string][] = [
    ["clientId", "cl.id=@clientId"], ["companyId", "v.company_id=@filterCompanyId"],
    ["vehicleId", "v.id=@vehicleId"], ["accessProfileId", "ap.id=@accessProfileId"]
  ];
  identifiers.forEach(([key, clause]) => {
    const value = filters[key];
    if (!value) return;
    const parameter = key === "companyId" ? "filterCompanyId" : key;
    request.input(parameter, sql.UniqueIdentifier, value);
    where.push(clause);
  });
  const result = await request.query(`
    SELECT v.id AS vehicleId,v.plate,v.brand,v.model,v.year,v.type AS vehicleType,v.company_id AS companyId,
      d.id AS driverId,d.name AS driverName,d.registration,d.license_category AS licenseCategory,d.license_expiry AS licenseExpiry,
      d.provisional_license AS provisionalLicense,co.legal_name AS companyName,cl.id AS clientId,cl.name AS clientName,
      cl.logo_blob_path AS clientLogoBlobPath,ap.id AS accessProfileId,ap.name AS accessProfileName,ap.description AS accessProfileDescription,ap.color AS accessProfileColor,
      CONCAT('MGV-',v.plate,'-',LEFT(CONVERT(varchar(36),v.id),8),'-',LEFT(CONVERT(varchar(36),d.id),4)) AS credentialCode,
      s.maximum_fleet_age AS maximumFleetAge,s.allow_provisional_license AS allowProvisionalLicense,
      s.block_vehicle_for_any_irregular_driver AS blockAnyDriver,s.credential_maximum_days AS credentialMaximumDays,
      (SELECT COUNT(*) FROM dbo.document_requirements r WHERE r.entity_type='company' AND r.required=1 AND NOT EXISTS(
        SELECT 1 FROM dbo.company_documents cd WHERE cd.company_id=co.id AND cd.document_type=r.document_type AND (cd.expiry_date IS NULL OR cd.expiry_date>=CAST(GETUTCDATE() AS date)))) AS missingCompanyDocuments,
      (SELECT COUNT(*) FROM dbo.document_requirements r WHERE r.entity_type='driver' AND r.required=1 AND NOT EXISTS(
        SELECT 1 FROM dbo.driver_documents dd WHERE dd.driver_id=d.id AND dd.document_type=r.document_type AND (dd.expiry_date IS NULL OR dd.expiry_date>=CAST(GETUTCDATE() AS date)))) AS missingDriverDocuments,
      (SELECT COUNT(*) FROM dbo.document_requirements r WHERE r.entity_type='vehicle' AND r.required=1 AND NOT EXISTS(
        SELECT 1 FROM dbo.vehicle_documents vd WHERE vd.vehicle_id=v.id AND vd.document_type=r.document_type AND (vd.expiry_date IS NULL OR vd.expiry_date>=CAST(GETUTCDATE() AS date)))) AS missingVehicleDocuments,
      (SELECT MIN(expiry_date) FROM (
        SELECT expiry_date FROM dbo.company_documents WHERE company_id=co.id UNION ALL
        SELECT expiry_date FROM dbo.driver_documents WHERE driver_id=d.id UNION ALL
        SELECT expiry_date FROM dbo.vehicle_documents WHERE vehicle_id=v.id
      ) expiries WHERE expiry_date>=CAST(GETUTCDATE() AS date)) AS nearestDocumentExpiry
    FROM dbo.vehicle_drivers link
    JOIN dbo.vehicles v ON v.id=link.vehicle_id JOIN dbo.drivers d ON d.id=link.driver_id
    JOIN dbo.companies co ON co.id=v.company_id JOIN dbo.clients cl ON cl.id=co.client_id JOIN dbo.access_profiles ap ON ap.id=v.access_profile_id
    CROSS JOIN dbo.system_settings s
    WHERE ${where.join(" AND ")}
    ORDER BY co.legal_name,v.plate,d.name
  `);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const mapped = result.recordset.map((row) => {
    const reasons: string[] = [];
    const expiry = new Date(`${String(row.licenseExpiry).slice(0, 10)}T00:00:00Z`);
    if (expiry < today) reasons.push("CNH vencida");
    if (row.provisionalLicense && !row.allowProvisionalLicense) reasons.push("CNH provisória não permitida");
    if (new Date().getUTCFullYear() - Number(row.year) > Number(row.maximumFleetAge)) reasons.push("Veículo acima da idade máxima");
    if (Number(row.missingCompanyDocuments)) reasons.push("Documento obrigatório da empresa ausente ou vencido");
    if (Number(row.missingDriverDocuments)) reasons.push("Documento obrigatório do motorista ausente ou vencido");
    if (Number(row.missingVehicleDocuments)) reasons.push("Documento obrigatório do veículo ausente ou vencido");
    return { ...row, eligible: reasons.length === 0, reasons };
  });
  if (mapped.some((row) => row.blockAnyDriver)) {
    const irregularVehicles = new Set(mapped.filter((row) => !row.eligible).map((row) => String(row.vehicleId)));
    mapped.forEach((row) => { if (row.blockAnyDriver && irregularVehicles.has(String(row.vehicleId)) && row.eligible) { row.eligible = false; (row.reasons as string[]).push("Outro motorista vinculado ao veículo está irregular"); } });
  }
  return mapped.map((row) => {
    const candidates = [new Date(today.getTime() + Number(row.credentialMaximumDays) * 86_400_000), new Date(`${String(row.licenseExpiry).slice(0, 10)}T00:00:00Z`)];
    if (row.nearestDocumentExpiry) candidates.push(new Date(`${String(row.nearestDocumentExpiry).slice(0, 10)}T00:00:00Z`));
    return { ...row, credentialValidUntil: new Date(Math.min(...candidates.map((date) => date.getTime()))).toISOString().slice(0, 10) };
  });
}
