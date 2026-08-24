import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { getDashboard } from "../repositories/dashboardRepository";
import { json } from "../utils/response";

app.http("dashboard", { methods: ["GET"], authLevel: "anonymous", route: "dashboard", handler: withApi(async (_request, _context, auth) => json(await getDashboard(auth.user))) });
