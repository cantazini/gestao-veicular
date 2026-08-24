import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { json } from "../utils/response";

app.http("authMe", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "auth/me",
  handler: withApi(async (_request, _context, auth) => json({
    authenticated: true,
    user: auth.user
  }))
});
