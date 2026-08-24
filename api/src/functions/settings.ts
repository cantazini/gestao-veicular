import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { assertRoles } from "../middleware/auth";
import { getSettings, saveSettings } from "../repositories/settingsRepository";
import { settingsSchema } from "../validation/settings";
import { json } from "../utils/response";

app.http("settings", {
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  route: "settings",
  handler: withApi(async (request, _context, auth) => {
    if (request.method === "GET") return json(await getSettings());
    assertRoles(auth.user, ["admin"]);
    const settings = settingsSchema.parse(await request.json());
    await saveSettings(settings, auth.user.id);
    return json(await getSettings());
  })
});
