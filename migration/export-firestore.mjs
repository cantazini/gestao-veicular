import { writeFile } from "node:fs/promises";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const output = process.env.MIGRATION_EXPORT_FILE || "firebase-export.json";
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) throw new Error("Defina FIREBASE_PROJECT_ID. Use credencial de aplicação fora do repositório.");

const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
const app = initializeApp({ credential: applicationDefault(), projectId, ...(storageBucket ? { storageBucket } : {}) });
const db = getFirestore(app);
const collections = ["companies", "drivers", "vehicles", "inspections", "users", "settings", "projects", "accessProfiles"];
const exportData = { source: "firebase", projectId, exportedAt: new Date().toISOString(), collections: {} };

function serialize(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

async function includePrivateFile(file) {
  if (!storageBucket || !file || typeof file !== "object" || file.dataUrl) return file;
  const path = file.storagePath || file.path;
  if (!path) return file;
  const bucketFile = getStorage(app).bucket().file(path);
  const [content] = await bucketFile.download();
  const [metadata] = await bucketFile.getMetadata();
  return { ...file, dataUrl: `data:${metadata.contentType || file.mimeType || "application/octet-stream"};base64,${content.toString("base64")}` };
}

async function includeFiles(record) {
  const result = { ...record };
  for (const field of ["photos", "documents"]) if (Array.isArray(result[field])) result[field] = await Promise.all(result[field].map(includePrivateFile));
  return result;
}

for (const name of collections) {
  const snapshot = await db.collection(name).get();
  exportData.collections[name] = await Promise.all(snapshot.docs.map(document => includeFiles({ id: document.id, ...serialize(document.data()) })));
  console.log(`${name}: ${snapshot.size}`);
}
await writeFile(output, JSON.stringify(exportData, null, 2), { encoding: "utf8", flag: "wx" });
console.log(`Exportação gravada em ${output}. O arquivo contém dados operacionais e não deve ser versionado.`);
