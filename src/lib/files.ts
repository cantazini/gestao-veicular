import { api, firebaseMode, mockMode } from "./api";
import { normalizeDocumentDates, validateDocumentDates } from "./documents";

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
  const dateError = validateDocumentDates(input);
  if (dateError) throw new Error(dateError);
  const { issueDate: _issueDate, expiryDate: _expiryDate, ...inputWithoutDates } = input;
  const common = { ...inputWithoutDates, ...normalizeDocumentDates(input), fileName: name, mimeType, size: file.size };
  if (mockMode) {
    const blobPath = `mock/${input.entityId}/${crypto.randomUUID()}-${name}`;
    const completed = await api<{ id: string }>("/files/complete", { method: "POST", body: JSON.stringify({ ...common, blobPath }) });
    return { id: completed.id, blobPath: input.kind === "client-branding" ? "/assets/logo-klabin.png" : blobPath };
  }
  if (firebaseMode) {
    const [{ doc, getDoc, serverTimestamp, setDoc, updateDoc }, { deleteObject, ref, uploadBytes }, { firebaseAuth, firebaseDb, firebaseStorage }] = await Promise.all([
      import("firebase/firestore"), import("firebase/storage"), import("../firebase/config")
    ]);
    const user = firebaseAuth().currentUser;
    if (!user) throw new Error("Sua sessão expirou. Entre novamente.");
    const id = crypto.randomUUID();
    const safeName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
    const entityType = input.kind.replace("-document", "");
    const storagePath = input.kind === "client-branding"
      ? `clients/${input.entityId}/branding/${id}-${safeName}`
      : input.kind === "inspection-photo"
        ? `inspections/${input.entityId}/photos/${id}/${safeName}`
        : `documents/${entityType}/${input.entityId}/${id}/${safeName}`;
    const storageReference = ref(firebaseStorage(), storagePath);
    await uploadBytes(storageReference, file, { contentType: mimeType, customMetadata: { uploadedBy: user.uid } });
    try {
      const stamp = serverTimestamp();
      if (input.kind === "client-branding") {
        const current = await getDoc(doc(firebaseDb(), "clients", input.entityId));
        const oldPath = current.data()?.logoStoragePath;
        await updateDoc(doc(firebaseDb(), "clients", input.entityId), { logoStoragePath: storagePath, updatedAt: stamp, updatedBy: user.uid });
        if (oldPath && oldPath !== storagePath) await deleteObject(ref(firebaseStorage(), String(oldPath))).catch(() => undefined);
      } else if (input.kind === "inspection-photo") {
        await setDoc(doc(firebaseDb(), "inspections", input.entityId, "photos", id), { ...common, storagePath, active: true, createdAt: stamp, createdBy: user.uid, updatedAt: stamp, updatedBy: user.uid });
      } else {
        await setDoc(doc(firebaseDb(), "documents", id), { ...common, entityType, entityId: input.entityId, storagePath, active: true, createdAt: stamp, createdBy: user.uid, updatedAt: stamp, updatedBy: user.uid });
      }
      return { id, blobPath: storagePath };
    } catch (reason) {
      await deleteObject(storageReference).catch(() => undefined);
      throw reason;
    }
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
