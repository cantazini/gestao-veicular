import { getStorage } from "firebase-admin/storage";
import { defineString } from "firebase-functions/params";
import "./firebase.js";

// Bucket da aplicação (target "app" do .firebaserc). O bucket default do projeto é deny-all e não guarda arquivos.
export const appStorageBucket = defineString("APP_STORAGE_BUCKET", {
  default: "gestaoveicular-47777-files-sp",
  description: "Bucket do Firebase Storage com os arquivos da aplicação (fotos de vistoria, documentos e logos)."
});

export async function removeAppStorageFiles(prefix: string) {
  const bucketName = appStorageBucket.value();
  if (!bucketName) throw new Error("APP_STORAGE_BUCKET não configurado.");
  if (!prefix || !prefix.endsWith("/")) throw new Error("Prefixo de Storage inválido.");
  await getStorage().bucket(bucketName).deleteFiles({ prefix, force: true });
}
