import type { Request } from "mssql";
import { getPool, sql, withTransaction } from "../services/sql";
import type { AppUser } from "../types/auth";
import type { PageResult } from "../types/domain";
import type { EntityName } from "../validation/entities";
import { entityDefinitions, type EntityDefinition, type SqlFieldType } from "./entityDefinitions";
import { digits, normalizePlate } from "../utils/normalize";
import { badRequest, conflict, notFound } from "../utils/errors";

const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function sqlErrorNumber(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { number?: unknown; originalError?: { info?: { number?: unknown } } };
  return Number(candidate.number || candidate.originalError?.info?.number) || undefined;
}

function duplicateEntityError(entity: EntityName): never {
  if (entity === "clients") throw conflict("Já existe um cliente cadastrado com este CNPJ.");
  if (entity === "companies") throw conflict("Já existe uma empresa cadastrada com este CNPJ.");
  if (entity === "vehicles") throw conflict("Já existe um veículo cadastrado com esta placa.");
  if (entity === "drivers") throw conflict("Já existe um motorista com esta matrícula na empresa.");
  throw conflict("Já existe um registro com os mesmos dados únicos.");
}

async function assertUniqueClientDocument(documentNormalized: string, excludeId?: string): Promise<void> {
  const pool = await getPool();
  const request = pool.request().input("documentNormalized", sql.NVarChar(30), documentNormalized);
  if (excludeId) request.input("excludeId", sql.UniqueIdentifier, excludeId);
  const result = await request.query(`SELECT TOP 1 id FROM dbo.clients WHERE document_normalized=@documentNormalized${excludeId ? " AND id<>@excludeId" : ""}`);
  if (result.recordset.length) throw conflict("Já existe um cliente cadastrado com este CNPJ.");
}

async function getActiveReference(table: string, id: string): Promise<Record<string, unknown> | undefined> {
  const pool = await getPool();
  const result = await pool.request().input("id", sql.UniqueIdentifier, id)
    .query(`SELECT TOP 1 * FROM ${table} WHERE id=@id AND active=1`);
  return result.recordset[0];
}

async function assertAllReferences(
  table: string,
  ids: string[],
  extraWhere: string,
  bindExtra: (request: Request) => void,
  message: string
): Promise<void> {
  if (!ids.length) return;
  const pool = await getPool();
  const request = pool.request();
  ids.forEach((id, index) => request.input(`reference${index}`, sql.UniqueIdentifier, id));
  bindExtra(request);
  const parameters = ids.map((_, index) => `@reference${index}`).join(",");
  const result = await request.query(`SELECT COUNT(DISTINCT id) AS total FROM ${table} WHERE id IN (${parameters}) AND active=1 ${extraWhere}`);
  if (Number(result.recordset[0]?.total || 0) !== new Set(ids).size) throw badRequest(message);
}

async function validateEntityRelationships(entity: EntityName, payload: Record<string, unknown>): Promise<void> {
  if (entity === "projects" || entity === "companies") {
    const client = await getActiveReference("dbo.clients", String(payload.clientId || ""));
    if (!client) throw badRequest("Selecione um cliente ativo e válido.");
  }

  if (entity === "companies") {
    const clientId = String(payload.clientId);
    if (payload.contractType === "subcontractor" && !payload.parentCompanyId) throw badRequest("Informe a empresa contratante.");
    if (payload.contractStart && payload.contractEnd && String(payload.contractEnd) < String(payload.contractStart)) throw badRequest("A data final deve ser posterior à inicial.");
    const projectIds = (payload.projectIds as string[] | undefined) || [];
    await assertAllReferences(
      "dbo.projects",
      projectIds,
      "AND client_id=@clientId",
      (request) => { request.input("clientId", sql.UniqueIdentifier, clientId); },
      "Todos os projetos selecionados devem estar ativos e pertencer ao cliente da empresa."
    );
    if (payload.parentCompanyId) {
      const pool = await getPool();
      const parent = await pool.request()
        .input("id", sql.UniqueIdentifier, payload.parentCompanyId)
        .input("clientId", sql.UniqueIdentifier, clientId)
        .query("SELECT TOP 1 id FROM dbo.companies WHERE id=@id AND client_id=@clientId AND active=1");
      if (!parent.recordset.length) throw badRequest("A empresa matriz deve estar ativa e pertencer ao mesmo cliente.");
    }
  }

  if (entity === "drivers" || entity === "vehicles") {
    const company = await getActiveReference("dbo.companies", String(payload.companyId || ""));
    if (!company) throw badRequest("Selecione uma empresa ativa e válida.");

    if (entity === "vehicles") {
      const companyId = String(payload.companyId);
      const clientId = String(company.client_id);
      const pool = await getPool();
      const project = await pool.request()
        .input("projectId", sql.UniqueIdentifier, payload.projectId)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("clientId", sql.UniqueIdentifier, clientId)
        .query(`SELECT TOP 1 p.id FROM dbo.projects p
                INNER JOIN dbo.company_projects cp ON cp.project_id=p.id AND cp.company_id=@companyId
                WHERE p.id=@projectId AND p.client_id=@clientId AND p.active=1`);
      if (!project.recordset.length) throw badRequest("O projeto deve estar ativo e vinculado à empresa selecionada.");

      if (payload.accessProfileId) {
        const profile = await pool.request()
          .input("id", sql.UniqueIdentifier, payload.accessProfileId)
          .input("clientId", sql.UniqueIdentifier, clientId)
          .query("SELECT TOP 1 id FROM dbo.access_profiles WHERE id=@id AND active=1 AND (client_id IS NULL OR client_id=@clientId)");
        if (!profile.recordset.length) throw badRequest("O perfil de acesso selecionado não está disponível para este cliente.");
      }

      const driverIds = (payload.driverIds as string[] | undefined) || [];
      await assertAllReferences(
        "dbo.drivers",
        driverIds,
        "AND company_id=@companyId",
        (request) => { request.input("companyId", sql.UniqueIdentifier, companyId); },
        "Todos os motoristas selecionados devem estar ativos e pertencer à empresa do veículo."
      );
    }
  }
}

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
  if ((entity === "companies" || entity === "clients") && hasOwn(payload, "document")) result.documentNormalized = digits(String(payload.document || ""));
  if (entity === "vehicles" && hasOwn(payload, "plate")) result.plateNormalized = normalizePlate(String(payload.plate || ""));
  if (entity === "drivers" && hasOwn(payload, "registration")) result.registrationNormalized = String(payload.registration || "").trim().toUpperCase();
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
  if (items.length && (entity === "companies" || entity === "vehicles")) {
    const relationshipRequest = pool.request();
    items.forEach((item, index) => relationshipRequest.input(`id${index}`, sql.UniqueIdentifier, item.id));
    const ids = items.map((_, index) => `@id${index}`).join(",");
    const relationshipResult = entity === "companies"
      ? await relationshipRequest.query(`SELECT company_id AS ownerId, project_id AS relatedId FROM dbo.company_projects WHERE company_id IN (${ids})`)
      : await relationshipRequest.query(`SELECT vehicle_id AS ownerId, driver_id AS relatedId FROM dbo.vehicle_drivers WHERE vehicle_id IN (${ids})`);
    const relations = new Map<string, string[]>();
    relationshipResult.recordset.forEach((row) => {
      const ownerId = String(row.ownerId);
      relations.set(ownerId, [...(relations.get(ownerId) || []), String(row.relatedId)]);
    });
    items.forEach((item) => { item[entity === "companies" ? "projectIds" : "driverIds"] = relations.get(String(item.id)) || []; });
  }
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
  if (entity === "clients") await assertUniqueClientDocument(String(payload.documentNormalized));
  await validateEntityRelationships(entity, payload);
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
  let result;
  try {
    result = await request.query(`INSERT INTO ${definition.table} (${columns.join(",")}) OUTPUT INSERTED.id VALUES (${values.join(",")})`);
  } catch (error) {
    if ([2601, 2627].includes(sqlErrorNumber(error) || 0)) duplicateEntityError(entity);
    throw error;
  }
  const id = String(result.recordset[0].id);
  await writeRelationships(entity, id, payload, actor.id);
  return (await getEntity(entity, id, actor)) || { id };
}

export async function updateEntity(entity: EntityName, id: string, payloadInput: Record<string, unknown>, actor: AppUser): Promise<Record<string, unknown>> {
  const definition = entityDefinitions[entity];
  const payload = normalizePayload(entity, payloadInput);
  const current = await getEntity(entity, id, actor);
  if (!current) throw notFound();
  const completePayload = { ...current, ...payload };
  if (entity === "clients" && hasOwn(payload, "documentNormalized")) await assertUniqueClientDocument(String(payload.documentNormalized), id);
  await validateEntityRelationships(entity, completePayload);
  const writable = Object.entries(definition.fields).filter(([api, field]) => field.writable && Object.prototype.hasOwnProperty.call(payload, api));
  const pool = await getPool();
  const request = pool.request().input("id", sql.UniqueIdentifier, id).input("actorId", sql.UniqueIdentifier, actor.id);
  if (actor.companyId) request.input("scopeCompanyId", sql.UniqueIdentifier, actor.companyId);
  writable.forEach(([api, field]) => bind(request, api, field.type, payload[api]));
  const sets = writable.map(([api, field]) => `${field.column}=@${api}`);
  if ((entity === "companies" || entity === "clients") && hasOwn(payload, "documentNormalized")) { request.input("documentNormalized", sql.NVarChar(30), payload.documentNormalized); sets.push("document_normalized=@documentNormalized"); }
  if (entity === "vehicles" && hasOwn(payload, "plateNormalized")) { request.input("plateNormalized", sql.NVarChar(10), payload.plateNormalized); sets.push("plate_normalized=@plateNormalized"); }
  if (entity === "drivers" && hasOwn(payload, "registrationNormalized")) { request.input("registrationNormalized", sql.NVarChar(80), payload.registrationNormalized); sets.push("registration_normalized=@registrationNormalized"); }
  let result;
  try {
    result = await request.query(`UPDATE ${definition.table} SET ${sets.join(",")}, updated_at=SYSUTCDATETIME(), updated_by=@actorId WHERE id=@id AND ${scopeClause(definition, actor)}; SELECT @@ROWCOUNT AS affected`);
  } catch (error) {
    if ([2601, 2627].includes(sqlErrorNumber(error) || 0)) duplicateEntityError(entity);
    throw error;
  }
  if (!Number(result.recordset[0]?.affected)) throw notFound();
  await writeRelationships(entity, id, completePayload, actor.id);
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
