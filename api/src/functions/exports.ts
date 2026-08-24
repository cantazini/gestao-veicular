import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { getInspectionExport } from "../repositories/exportRepository";
import { json } from "../utils/response";

app.http("inspectionExport", { methods: ["GET"], authLevel: "anonymous", route: "exports/inspections", handler: withApi(async (_request, _context, auth) => json(await getInspectionExport(auth.user))) });
