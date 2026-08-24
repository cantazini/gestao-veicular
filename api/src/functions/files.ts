import { app } from "@azure/functions";
import { z } from "zod";
import { withApi } from "../middleware/withApi";
import { assertFileEntityAccess, deleteFileMetadata, findFile, getClientLogoPath, saveFileMetadata } from "../repositories/fileRepository";
import { createBlobPath, createDownloadUrl, createUploadUrl, deleteBlob, expectedPrefix, validateFile } from "../services/storage";
import { completeUploadSchema, uploadRequestSchema } from "../validation/files";
import { badRequest, forbidden, notFound } from "../utils/errors";
import { json, noContent } from "../utils/response";

app.http("fileUploadUrl", {
  methods: ["POST"], authLevel: "anonymous", route: "files/upload-url",
  handler: withApi(async (request, _context, auth) => {
    const input = uploadRequestSchema.parse(await request.json());
    validateFile(input.kind, input.mimeType, input.size);
    await assertFileEntityAccess(input.kind, input.entityId, auth.user, true);
    const blobPath = createBlobPath(input.kind, input.entityId, input.fileName, input.mimeType);
    return json({ blobPath, uploadUrl: await createUploadUrl(blobPath), expiresInSeconds: 600 });
  })
});

app.http("fileComplete", {
  methods: ["POST"], authLevel: "anonymous", route: "files/complete",
  handler: withApi(async (request, _context, auth) => {
    const input = completeUploadSchema.parse(await request.json());
    validateFile(input.kind, input.mimeType, input.size);
    await assertFileEntityAccess(input.kind, input.entityId, auth.user, true);
    if (!input.blobPath.startsWith(expectedPrefix(input.kind, input.entityId))) throw badRequest("Caminho de arquivo inválido.");
    const id = await saveFileMetadata(input, auth.user.id);
    return json({ id }, 201);
  })
});

app.http("fileById", {
  methods: ["GET", "DELETE"], authLevel: "anonymous", route: "files/{id}",
  handler: withApi(async (request, _context, auth) => {
    const id = z.string().uuid().parse(request.params.id);
    const record = await findFile(id);
    if (!record) throw notFound("Arquivo não encontrado.");
    await assertFileEntityAccess(record.kind, record.entityId, auth.user, request.method === "DELETE");
    if (request.method === "GET") {
      const url = await createDownloadUrl(record.blobPath);
      return { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } };
    }
    if (auth.user.role === "inspector" && record.kind !== "inspection-photo") throw forbidden();
    await deleteBlob(record.blobPath);
    await deleteFileMetadata(record);
    return noContent();
  })
});

app.http("clientLogo", {
  methods: ["GET"], authLevel: "anonymous", route: "clients/{id}/logo",
  handler: withApi(async (request, _context, auth) => {
    const id = z.string().uuid().parse(request.params.id);
    const path = await getClientLogoPath(id, auth.user);
    if (!path) throw notFound("Este cliente não possui logotipo cadastrado.");
    return { status: 302, headers: { Location: await createDownloadUrl(path), "Cache-Control": "private, no-store" } };
  })
});
