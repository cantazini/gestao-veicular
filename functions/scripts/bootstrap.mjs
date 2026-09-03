import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
if (projectId !== "gestaoveicular-47777") throw new Error("Defina GOOGLE_CLOUD_PROJECT=gestaoveicular-47777 e autentique a CLI antes de executar.");
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

await db.collection("systemSettings").doc("default").set({
  minimumInspectionCompliance: 90,
  credentialValidityDays: 30,
  documentExpiryWarningDays: 30,
  updatedAt: FieldValue.serverTimestamp(),
  bootstrapVersion: 1
}, { merge: true });

const types = [
  ["crlv", "CRLV"], ["insurance", "Seguro"], ["cnh", "CNH"], ["aso", "ASO"], ["contract", "Contrato"], ["other", "Outro"]
];
const batch = db.batch();
for (const [id, name] of types) batch.set(db.collection("documentTypes").doc(id), { name, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

const adminUid = process.env.FIREBASE_ADMIN_UID;
if (adminUid) {
  const email = process.env.FIREBASE_ADMIN_EMAIL;
  const name = process.env.FIREBASE_ADMIN_NAME;
  if (!email || !name) throw new Error("Ao informar FIREBASE_ADMIN_UID, informe também FIREBASE_ADMIN_EMAIL e FIREBASE_ADMIN_NAME.");
  batch.set(db.collection("users").doc(adminUid), { email, name, role: "admin", active: true, createdAt: FieldValue.serverTimestamp(), bootstrapVersion: 1 }, { merge: true });
}

await batch.commit();
console.log("Bootstrap seguro concluído para", projectId, adminUid ? "com perfil admin" : "sem perfil admin");
