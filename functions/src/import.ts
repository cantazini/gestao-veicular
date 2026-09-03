import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireAdmin } from "./auth.js";
import { persistEntity } from "./entities.js";
import { logOperation } from "./observability.js";

const allowedEntities = z.enum(["clients", "projects", "companies", "drivers", "vehicles", "accessProfiles"]);
const inputSchema = z.object({ entity: allowedEntities, rows: z.array(z.record(z.string(), z.unknown())).min(1).max(200) });

export const bulkImport = onCall({ region: "southamerica-east1", enforceAppCheck: false, timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const actor = await requireAdmin(request);
  const parsed = inputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Lote inválido. Envie de 1 a 200 linhas por chamada.");
  const results: Array<{ row: number; id?: string; error?: string }> = [];
  for (let index = 0; index < parsed.data.rows.length; index += 1) {
    try {
      const saved = await persistEntity(parsed.data.entity, undefined, parsed.data.rows[index], actor);
      results.push({ row: index + 1, id: saved.id });
    } catch (error) {
      results.push({ row: index + 1, error: error instanceof Error ? error.message : "Falha de validação" });
    }
  }
  const summary = { processed: results.length, succeeded: results.filter((item) => item.id).length, failed: results.filter((item) => item.error).length, results };
  logOperation("bulk-import.completed", { entity: parsed.data.entity, actorUid: actor.id, processed: summary.processed, succeeded: summary.succeeded, failed: summary.failed });
  return summary;
});
