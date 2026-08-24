import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { listCredentialEligibility } from "../repositories/credentialRepository";
import { json } from "../utils/response";

app.http("credentialEligibility", { methods: ["GET"], authLevel: "anonymous", route: "credentials/eligibility", handler: withApi(async (_request, _context, auth) => json(await listCredentialEligibility(auth.user))) });
