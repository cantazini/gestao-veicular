import { app } from "@azure/functions";
import { z } from "zod";
import { withApi } from "../middleware/withApi";
import { assertRoles } from "../middleware/auth";
import { createInspection, getInspection, listInspections } from "../repositories/inspectionRepository";
import { inspectionQuerySchema, inspectionSchema } from "../validation/inspection";
import { badRequest, notFound } from "../utils/errors";
import { json } from "../utils/response";

app.http("inspections", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "inspections/{id?}",
  handler: withApi(async (request, _context, auth) => {
    const id = request.params.id;
    if (request.method === "GET") {
      if (id) {
        const inspection = await getInspection(z.string().uuid().parse(id), auth.user);
        if (!inspection) throw notFound("Vistoria não encontrada.");
        return json(inspection);
      }
      const query = Object.fromEntries(new URL(request.url).searchParams.entries());
      const filters = inspectionQuerySchema.parse(query);
      if (auth.user.role === "supplier") filters.companyId = auth.user.companyId || undefined;
      return json(await listInspections(filters));
    }
    assertRoles(auth.user, ["admin", "inspector"]);
    if (id) throw badRequest("Não informe ID para criar uma vistoria.");
    const input = inspectionSchema.parse(await request.json());
    return json(await createInspection(input, auth.user), 201);
  })
});
