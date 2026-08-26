import { api, mockMode } from "./api";

export type ManagedFileKind = "company-document" | "driver-document" | "vehicle-document" | "inspection-photo" | "client-branding";

export interface ManagedFileInput {
  kind: ManagedFileKind;
  entityId: string;
  documentType?: string;
  label?: string;
  issueDate?: string | null;
  expiryDate?: string | null;
  observation?: string;
  photoType?: string;
  description?: string;
  width?: number;
  height?: number;
  originalSize?: number;
}

export async function uploadManagedFile(input: ManagedFileInput, file: File | Blob, fileName?: string): Promise<{ id: string; blobPath: string }> {
  const name = fileName || (file instanceof File ? file.name : "arquivo.bin");
  const mimeType = file.type;
  const common = { ...input, fileName: name, mimeType, size: file.size };
  if (mockMode) {
    const blobPath = `mock/${input.entityId}/${crypto.randomUUID()}-${name}`;
    const completed = await api<{ id: string }>("/files/complete", { method: "POST", body: JSON.stringify({ ...common, blobPath }) });
    return { id: completed.id, blobPath: input.kind === "client-branding" ? "/assets/logo-klabin.png" : blobPath };
  }
  const ticket = await api<{ blobPath: string; uploadUrl: string }>("/files/upload-url", { method: "POST", body: JSON.stringify(common) });
  const upload = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": mimeType }, body: file });
  if (!upload.ok) throw new Error("Não foi possível enviar o arquivo ao armazenamento.");
  const completed = await api<{ id: string }>("/files/complete", { method: "POST", body: JSON.stringify({ ...common, blobPath: ticket.blobPath }) });
  return { id: completed.id, blobPath: ticket.blobPath };
}

export function validateLocalFile(file: File, imageOnly = false): string | null {
  const allowed = imageOnly ? ["image/png", "image/jpeg"] : ["application/pdf", "image/png", "image/jpeg"];
  if (!allowed.includes(file.type)) return imageOnly ? "Use uma imagem PNG ou JPG." : "Use um arquivo PDF, PNG ou JPG.";
  const limit = imageOnly ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > limit) return `O arquivo deve ter no máximo ${limit / 1024 / 1024} MB.`;
  return null;
}
