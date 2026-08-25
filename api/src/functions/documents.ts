import { app } from "@azure/functions";
import { z } from "zod";
import { withApi } from "../middleware/withApi";
import { listDocuments } from "../repositories/documentRepository";
import { json } from "../utils/response";
import { sqlGuid } from "../validation/sqlFields";

app.http("documents", { methods: ["GET"], authLevel: "anonymous", route: "documents", handler: withApi(async (request, _context, auth) => {
  const url = new URL(request.url);
  const entityType = z.enum(["company", "driver", "vehicle"]).parse(url.searchParams.get("entityType"));
  const entityId = sqlGuid.parse(url.searchParams.get("entityId"));
  return json(await listDocuments(entityType, entityId, auth.user));
}) });
