import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { listCredentialEligibility } from "../repositories/credentialRepository";
import { json } from "../utils/response";
import { credentialQuerySchema } from "../validation/credentials";

app.http("credentialEligibility", { methods: ["GET"], authLevel: "anonymous", route: "credentials/eligibility", handler: withApi(async (request, _context, auth) => {
  const filters = credentialQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  return json(await listCredentialEligibility(auth.user, filters));
}) });
