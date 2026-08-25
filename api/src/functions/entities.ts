import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { assertCompanyScope, assertRoles } from "../middleware/auth";
import { createEntity, deactivateEntity, getEntity, listEntities, updateEntity } from "../repositories/entityRepository";
import { entityDefinitions } from "../repositories/entityDefinitions";
import { entitySchemas, entityUpdateSchemas, type EntityName } from "../validation/entities";
import { sqlGuid } from "../validation/sqlFields";
import { badRequest, forbidden, notFound } from "../utils/errors";
import { json, noContent } from "../utils/response";

function handlerFor(entity: EntityName) {
  const definition = entityDefinitions[entity];
  return withApi(async (request, _context, auth) => {
    const idValue = request.params.id;
    const id = idValue ? sqlGuid.parse(idValue) : "";
    const method = request.method.toUpperCase();
    if (method === "GET") {
      assertRoles(auth.user, definition.readRoles);
      if (!id) return json(await listEntities(entity, auth.user, new URL(request.url).searchParams));
      const item = await getEntity(entity, id, auth.user);
      if (!item) throw notFound();
      return json(item);
    }
    assertRoles(auth.user, definition.writeRoles);
    if (method === "DELETE") {
      if (auth.user.role !== "admin" || !id) throw forbidden();
      await deactivateEntity(entity, id, auth.user);
      return noContent();
    }
    const body = await request.json() as unknown;
    const schema = method === "POST" ? entitySchemas[entity] : entityUpdateSchemas[entity];
    const payload = schema.parse(body) as Record<string, unknown>;
    if (auth.user.role === "supplier") {
      const companyId = String(payload.companyId || auth.user.companyId || "");
      assertCompanyScope(auth.user, companyId);
      payload.companyId = companyId;
    }
    if (method === "POST") return json(await createEntity(entity, payload, auth.user), 201);
    if (method === "PUT" && id) return json(await updateEntity(entity, id, payload, auth.user));
    throw badRequest("Operação inválida.");
  });
}

for (const entity of Object.keys(entityDefinitions) as EntityName[]) {
  app.http(`entity-${entity}`, {
    methods: ["GET", "POST", "PUT", "DELETE"],
    authLevel: "anonymous",
    route: `${entity}/{id?}`,
    handler: handlerFor(entity)
  });
}
