import { app } from "@azure/functions";
import { z } from "zod";
import { withApi } from "../middleware/withApi";
import { listDocuments } from "../repositories/documentRepository";
import { json } from "../utils/response";

app.http("documents", { methods: ["GET"], authLevel: "anonymous", route: "documents", handler: withApi(async (request, _context, auth) => {
  const url = new URL(request.url);
  const entityType = z.enum(["company", "driver", "vehicle"]).parse(url.searchParams.get("entityType"));
  const entityId = z.string().uuid().parse(url.searchParams.get("entityId"));
  return json(await listDocuments(entityType, entityId, auth.user));
}) });
