import {
  BlobSASPermissions, BlobServiceClient, generateBlobSASQueryParameters, SASProtocol,
  StorageSharedKeyCredential
} from "@azure/storage-blob";
import { getConfig } from "../config";
import type { FileKind } from "../validation/files";
import { badRequest } from "../utils/errors";

const DOCUMENT_MIMES = new Set([
  "application/pdf", "image/jpeg", "image/png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);
const PATH_PREFIX: Record<FileKind, string> = {
  "company-document": "companies", "driver-document": "drivers", "vehicle-document": "vehicles",
  "inspection-photo": "inspections", "client-branding": "clients"
};

type ParsedStorageConnection = {
  accountName: string;
  accountKey: string;
  serviceUrl: string;
};

export function parseStorageConnectionString(connectionString: string): ParsedStorageConnection {
  const values = new Map<string, string>();
  for (const part of connectionString.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) values.set(part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim());
  }
  const accountName = values.get("accountname");
  const accountKey = values.get("accountkey");
  if (!accountName || !accountKey) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING deve conter AccountName e AccountKey.");
  }
  const protocol = values.get("defaultendpointsprotocol") || "https";
  const endpointSuffix = values.get("endpointsuffix") || "core.windows.net";
  const serviceUrl = values.get("blobendpoint") || `${protocol}://${accountName}.blob.${endpointSuffix}`;
  return { accountName, accountKey, serviceUrl };
}

let client: BlobServiceClient | undefined;
let sharedKey: StorageSharedKeyCredential | undefined;
function blobService(): BlobServiceClient {
  if (client) return client;
  const config = getConfig();
  const storage = parseStorageConnectionString(config.storageConnectionString);
  sharedKey = new StorageSharedKeyCredential(storage.accountName, storage.accountKey);
  client = new BlobServiceClient(storage.serviceUrl, sharedKey);
  return client;
}

export function validateFile(kind: FileKind, mimeType: string, size: number): void {
  const image = kind === "inspection-photo" || kind === "client-branding";
  if (!(image ? IMAGE_MIMES : DOCUMENT_MIMES).has(mimeType)) throw badRequest(image ? "Use uma imagem JPG ou PNG." : "Formato não permitido. Use PDF, JPG, PNG, DOCX ou XLSX.");
  const limit = image ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
  if (size > limit) throw badRequest(`O arquivo deve ter no máximo ${limit / 1024 / 1024} MB.`);
}

function extension(fileName: string, mimeType: string): string {
  const candidate = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  if (candidate && candidate.length <= 5) return candidate;
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  return "jpg";
}

export function createBlobPath(kind: FileKind, entityId: string, fileName: string, mimeType: string): string {
  const folder = kind === "inspection-photo" ? "photos" : kind === "client-branding" ? "branding" : "documents";
  return `${PATH_PREFIX[kind]}/${entityId}/${folder}/${crypto.randomUUID()}.${extension(fileName, mimeType)}`;
}

export function expectedPrefix(kind: FileKind, entityId: string): string {
  const folder = kind === "inspection-photo" ? "photos" : kind === "client-branding" ? "branding" : "documents";
  return `${PATH_PREFIX[kind]}/${entityId}/${folder}/`;
}

async function sasUrl(blobPath: string, permission: "cw" | "r", minutes: number): Promise<string> {
  const config = getConfig();
  const service = blobService();
  if (!sharedKey) throw new Error("Credencial do Blob Storage não inicializada.");
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const expiresOn = new Date(Date.now() + minutes * 60 * 1000);
  const query = generateBlobSASQueryParameters({
    containerName: config.storageContainer,
    blobName: blobPath,
    permissions: BlobSASPermissions.parse(permission),
    startsOn,
    expiresOn,
    protocol: SASProtocol.Https
  }, sharedKey).toString();
  return `${service.getContainerClient(config.storageContainer).getBlobClient(blobPath).url}?${query}`;
}

export const createUploadUrl = (blobPath: string) => sasUrl(blobPath, "cw", 10);
export const createDownloadUrl = (blobPath: string) => sasUrl(blobPath, "r", 5);

export async function deleteBlob(blobPath: string): Promise<void> {
  const config = getConfig();
  await blobService().getContainerClient(config.storageContainer).deleteBlob(blobPath, { deleteSnapshots: "include" }).catch((error: unknown) => {
    const statusCode = typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode: number }).statusCode) : 0;
    if (statusCode !== 404) throw error;
  });
}
