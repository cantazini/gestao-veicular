import { app } from "@azure/functions";
import { withApi } from "../middleware/withApi";
import { assertFileEntityAccess, findFile } from "../repositories/fileRepository";
import { listDocuments, updateDocumentMetadata } from "../repositories/documentRepository";
import { notFound } from "../utils/errors";
import { json, noContent } from "../utils/response";
import { documentQuerySchema, documentUpdateSchema } from "../validation/documents";
import { sqlGuid } from "../validation/sqlFields";

app.http("documents", {
  methods: ["GET", "PUT"], authLevel: "anonymous", route: "documents/{id?}",
  handler: withApi(async (request, _context, auth) => {
    if (request.method === "GET") {
      const query = documentQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
      return json(await listDocuments(query, auth.user));
    }
    const id = sqlGuid.parse(request.params.id);
    const record = await findFile(id);
    if (!record || record.kind === "inspection-photo") throw notFound("Documento não encontrado.");
    await assertFileEntityAccess(record.kind, record.entityId, auth.user, true);
    await updateDocumentMetadata(record, documentUpdateSchema.parse(await request.json()), auth.user.id);
    return noContent();
  })
});
