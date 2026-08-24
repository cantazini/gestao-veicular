import type { Request } from "mssql";
import { getPool, sql, withTransaction } from "../services/sql";
import type { AppUser } from "../types/auth";
import type { PageResult } from "../types/domain";
import type { EntityName } from "../validation/entities";
import { entityDefinitions, type EntityDefinition, type SqlFieldType } from "./entityDefinitions";
import { digits, normalizePlate } from "../utils/normalize";
import { notFound } from "../utils/errors";

function bind(request: Request, name: string, type: SqlFieldType, value: unknown): void {
  const safe = value === "" || value === undefined ? null : value;
  if (type === "uuid") request.input(name, sql.UniqueIdentifier, safe);
  else if (type === "int") request.input(name, sql.Int, safe);
  else if (type === "decimal") request.input(name, sql.Decimal(12, 2), safe);
  else if (type === "bit") request.input(name, sql.Bit, safe);
  else if (type === "date") request.input(name, sql.Date, safe);
  else request.input(name, sql.NVarChar(sql.MAX), safe);
}

function selectColumns(definition: EntityDefinition): string {
  return Object.entries(definition.fields).map(([api, field]) => `t.${field.column} AS [${api}]`).join(", ");
}

function scopeClause(definition: EntityDefinition, user: AppUser): string {
  if (user.role !== "supplier") return "1=1";
  if (!user.companyId) return "1=0";
  if (definition.supplierScope === "id") return "t.id = @scopeCompanyId";
  if (definition.supplierScope === "company_id") return "t.company_id = @scopeCompanyId";
  if (definition.supplierScope === "project_company") return "EXISTS (SELECT 1 FROM dbo.company_projects cp WHERE cp.project_id=t.id AND cp.company_id=@scopeCompanyId)";
  if (definition.supplierScope === "client_company") return "EXISTS (SELECT 1 FROM dbo.companies c WHERE c.client_id=t.id AND c.id=@scopeCompanyId)";
  return "1=0";
}

function normalizePayload(entity: EntityName, payload: Record<string, unknown>): Record<string, unknown> {
  const result = { ...payload };
  if (entity === "companies" || entity === "clients") result.documentNormalized = digits(String(payload.document || ""));
  if (entity === "vehicles") result.plateNormalized = normalizePlate(String(payload.plate || ""));
  if (entity === "drivers") result.registrationNormalized = String(payload.registration || "").trim().toUpperCase();
  return result;
}

function whereForList(definition: EntityDefinition, request: Request, user: AppUser, query: URLSearchParams): string[] {
  const where = [scopeClause(definition, user)];
  if (user.companyId) request.input("scopeCompanyId", sql.UniqueIdentifier, user.companyId);
  const search = query.get("search")?.trim();
  if (search) {
    request.input("search", sql.NVarChar(220), `%${search}%`);
    where.push(`(${definition.searchColumns.map((column) => `t.${column} LIKE @search`).join(" OR ")})`);
  }
  const active = query.get("active");
  if (active !== null && definition.fields.active) {
    request.input("active", sql.Bit, active === "true");
    where.push("t.active = @active");
  }
  return where;
}

export async function listEntities(entity: EntityName, user: AppUser, query: URLSearchParams): Promise<PageResult<Record<string, unknown>>> {
  const definition = entityDefinitions[entity];
  const page = Math.max(1, Number(query.get("page") || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize") || 25)));
  const pool = await getPool();
  const request = pool.request();
  const where = whereForList(definition, request, user, query).join(" AND ");
  request.input("offset", sql.Int, (page - 1) * pageSize).input("pageSize", sql.Int, pageSize);
  const result = await request.query(`
    SELECT ${selectColumns(definition)}, COUNT(1) OVER() AS [_total]
    FROM ${definition.table} t
    WHERE ${where}
    ORDER BY t.${definition.orderBy}
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
  `);
  const total = Number(result.recordset[0]?._total || 0);
  const items = result.recordset.map((row) => { const { _total, ...item } = row; return item; });
  return { items, page, pageSize, total };
}

export async function getEntity(entity: EntityName, id: string, user: AppUser): Promise<Record<string, unknown> | null> {
  const definition = entityDefinitions[entity];
  const pool = await getPool();
  const request = pool.request().input("id", sql.UniqueIdentifier, id);
  if (user.companyId) request.input("scopeCompanyId", sql.UniqueIdentifier, user.companyId);
  const result = await request.query(`SELECT ${selectColumns(definition)} FROM ${definition.table} t WHERE t.id=@id AND ${scopeClause(definition, user)}`);
  const item = result.recordset[0];
  if (!item) return null;
  if (entity === "companies") {
    const links = await pool.request().input("id", sql.UniqueIdentifier, id).query("SELECT project_id AS projectId FROM dbo.company_projects WHERE company_id=@id");
    item.projectIds = links.recordset.map((row) => row.projectId);
  }
  if (entity === "vehicles") {
    const links = await pool.request().input("id", sql.UniqueIdentifier, id).query("SELECT driver_id AS driverId FROM dbo.vehicle_drivers WHERE vehicle_id=@id");
    item.driverIds = links.recordset.map((row) => row.driverId);
  }
  if (entity === "accessProfiles") {
    const links = await pool.request().input("id", sql.UniqueIdentifier, id).query(`
      SELECT gate_name AS name FROM dbo.access_profile_gates WHERE access_profile_id=@id ORDER BY gate_name;
      SELECT area_name AS name FROM dbo.access_profile_areas WHERE access_profile_id=@id ORDER BY area_name;
    `);
    const sets = links.recordsets as unknown as { name: string }[][];
    item.gates = sets[0].map((row) => row.name);
    item.areas = sets[1].map((row) => row.name);
  }
  return item;
}

async function writeRelationships(entity: EntityName, id: string, payload: Record<string, unknown>, actorId: string): Promise<void> {
  if (!["companies", "vehicles", "accessProfiles"].includes(entity)) return;
  await withTransaction(async (transaction) => {
    if (entity === "companies") {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id).query("DELETE FROM dbo.company_projects WHERE company_id=@id");
      for (const projectId of (payload.projectIds as string[] || [])) {
        await new sql.Request(transaction).input("companyId", sql.UniqueIdentifier, id).input("projectId", sql.UniqueIdentifier, projectId).input("actorId", sql.UniqueIdentifier, actorId)
          .query("INSERT INTO dbo.company_projects (company_id, project_id, created_by) VALUES (@companyId, @projectId, @actorId)");
      }
    }
    if (entity === "vehicles") {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id).query("DELETE FROM dbo.vehicle_drivers WHERE vehicle_id=@id");
      for (const driverId of (payload.driverIds as string[] || [])) {
        await new sql.Request(transaction).input("vehicleId", sql.UniqueIdentifier, id).input("driverId", sql.UniqueIdentifier, driverId).input("actorId", sql.UniqueIdentifier, actorId)
          .query(`INSERT INTO dbo.vehicle_drivers (vehicle_id, driver_id, created_by)
                  SELECT @vehicleId, @driverId, @actorId WHERE EXISTS (
                    SELECT 1 FROM dbo.vehicles v JOIN dbo.drivers d ON d.company_id=v.company_id WHERE v.id=@vehicleId AND d.id=@driverId
                  )`);
      }
    }
    if (entity === "accessProfiles") {
      await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id).query("DELETE FROM dbo.access_profile_gates WHERE access_profile_id=@id; DELETE FROM dbo.access_profile_areas WHERE access_profile_id=@id");
      for (const gate of (payload.gates as string[] || [])) await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id).input("name", sql.NVarChar(100), gate).query("INSERT INTO dbo.access_profile_gates (access_profile_id, gate_name) VALUES (@id,@name)");
      for (const area of (payload.areas as string[] || [])) await new sql.Request(transaction).input("id", sql.UniqueIdentifier, id).input("name", sql.NVarChar(100), area).query("INSERT INTO dbo.access_profile_areas (access_profile_id, area_name) VALUES (@id,@name)");
    }
  });
}

export async function createEntity(entity: EntityName, payloadInput: Record<string, unknown>, actor: AppUser): Promise<Record<string, unknown>> {
  const definition = entityDefinitions[entity];
  const payload = normalizePayload(entity, payloadInput);
  const writable = Object.entries(definition.fields).filter(([api, field]) => field.writable && Object.prototype.hasOwnProperty.call(payload, api));
  const pool = await getPool();
  const request = pool.request().input("actorId", sql.UniqueIdentifier, actor.id);
  writable.forEach(([api, field]) => bind(request, api, field.type, payload[api]));
  if (entity === "companies" || entity === "clients") request.input("documentNormalized", sql.NVarChar(30), payload.documentNormalized);
  if (entity === "vehicles") request.input("plateNormalized", sql.NVarChar(10), payload.plateNormalized);
  if (entity === "drivers") request.input("registrationNormalized", sql.NVarChar(80), payload.registrationNormalized);
  const extraColumns = entity === "companies" ? ["document_normalized"] : entity === "vehicles" ? ["plate_normalized"] : entity === "drivers" ? ["registration_normalized"] : entity === "clients" ? ["document_normalized"] : [];
  const extraValues = extraColumns.map((column) => `@${column === "document_normalized" ? "documentNormalized" : column === "plate_normalized" ? "plateNormalized" : "registrationNormalized"}`);
  const columns = [...writable.map(([, field]) => field.column), ...extraColumns, "created_by", "updated_by"];
  const values = [...writable.map(([api]) => `@${api}`), ...extraValues, "@actorId", "@actorId"];
  const result = await request.query(`INSERT INTO ${definition.table} (${columns.join(",")}) OUTPUT INSERTED.id VALUES (${values.join(",")})`);
  const id = String(result.recordset[0].id);
  await writeRelationships(entity, id, payload, actor.id);
  return (await getEntity(entity, id, actor)) || { id };
}

export async function updateEntity(entity: EntityName, id: string, payloadInput: Record<string, unknown>, actor: AppUser): Promise<Record<string, unknown>> {
  const definition = entityDefinitions[entity];
  const payload = normalizePayload(entity, payloadInput);
  const writable = Object.entries(definition.fields).filter(([api, field]) => field.writable && Object.prototype.hasOwnProperty.call(payload, api));
  const pool = await getPool();
  const request = pool.request().input("id", sql.UniqueIdentifier, id).input("actorId", sql.UniqueIdentifier, actor.id);
  if (actor.companyId) request.input("scopeCompanyId", sql.UniqueIdentifier, actor.companyId);
  writable.forEach(([api, field]) => bind(request, api, field.type, payload[api]));
  const sets = writable.map(([api, field]) => `${field.column}=@${api}`);
  if (entity === "companies" || entity === "clients") { request.input("documentNormalized", sql.NVarChar(30), payload.documentNormalized); sets.push("document_normalized=@documentNormalized"); }
  if (entity === "vehicles") { request.input("plateNormalized", sql.NVarChar(10), payload.plateNormalized); sets.push("plate_normalized=@plateNormalized"); }
  if (entity === "drivers") { request.input("registrationNormalized", sql.NVarChar(80), payload.registrationNormalized); sets.push("registration_normalized=@registrationNormalized"); }
  const result = await request.query(`UPDATE ${definition.table} SET ${sets.join(",")}, updated_at=SYSUTCDATETIME(), updated_by=@actorId WHERE id=@id AND ${scopeClause(definition, actor)}; SELECT @@ROWCOUNT AS affected`);
  if (!Number(result.recordset[0]?.affected)) throw notFound();
  await writeRelationships(entity, id, payload, actor.id);
  return (await getEntity(entity, id, actor)) || { id };
}

export async function deactivateEntity(entity: EntityName, id: string, actor: AppUser): Promise<void> {
  const definition = entityDefinitions[entity];
  if (!definition.fields.active) throw notFound();
  const pool = await getPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, id).input("actorId", sql.UniqueIdentifier, actor.id)
    .query(`UPDATE ${definition.table} SET active=0, updated_at=SYSUTCDATETIME(), updated_by=@actorId WHERE id=@id; SELECT @@ROWCOUNT AS affected`);
  if (!Number(result.recordset[0]?.affected)) throw notFound();
}
