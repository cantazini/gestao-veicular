import { getPool, sql } from "../services/sql";
import type { AppUser } from "../types/auth";

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: String(row.id),
    identityProviderId: String(row.identity_provider_id),
    email: String(row.email || ""),
    name: String(row.name || ""),
    role: row.role as AppUser["role"],
    companyId: row.company_id ? String(row.company_id) : null,
    active: Boolean(row.active)
  };
}

export async function findUserByIdentity(identityProviderId: string): Promise<AppUser | null> {
  const pool = await getPool();
  const result = await pool.request()
    .input("identityProviderId", sql.NVarChar(200), identityProviderId)
    .query(`
      SELECT id, identity_provider_id, email, name, role, company_id, active
      FROM dbo.app_users
      WHERE identity_provider_id = @identityProviderId
    `);
  return result.recordset[0] ? mapUser(result.recordset[0]) : null;
}
