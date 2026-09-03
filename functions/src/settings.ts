import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";
import { requireAdmin } from "./auth.js";
import { auditEntry } from "./audit.js";
import { firestore, serverTimestamp } from "./firebase.js";

export const settingsSchema = z.object({
  minimumInspectionCompliance: z.coerce.number().min(0).max(100),
  maximumFleetAge: z.coerce.number().int().min(0).max(100).default(12),
  expiryAlertDays: z.coerce.number().int().min(1).max(365).default(30),
  allowProvisionalLicense: z.boolean().default(false),
  blockVehicleForAnyIrregularDriver: z.boolean().default(false),
  credentialMaximumDays: z.coerce.number().int().min(1).max(365).default(365),
  documentRequirements: z.array(z.object({ entityType: z.enum(["company", "driver", "vehicle"]), documentType: z.string().min(1).max(80), label: z.string().min(1).max(160), required: z.boolean() })).default([]),
  credentialDimensions: z.array(z.object({ vehicleType: z.string().min(1).max(60), widthMm: z.coerce.number().positive().max(1000), heightMm: z.coerce.number().positive().max(1000) })).default([])
});

export const updateSettings = onCall({ region: "southamerica-east1", enforceAppCheck: false }, async (request) => {
  const actor = await requireAdmin(request);
  const parsed = settingsSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Revise os parâmetros.", { fieldErrors: z.flattenError(parsed.error).fieldErrors });
  const persisted = { ...parsed.data, credentialValidityDays: parsed.data.credentialMaximumDays, documentExpiryWarningDays: parsed.data.expiryAlertDays };
  await firestore.collection("systemSettings").doc("default").set({ ...persisted, updatedAt: serverTimestamp(), updatedBy: actor.id }, { merge: true });
  await firestore.collection("auditLogs").add(auditEntry(actor, "settings.updated", "systemSettings", "default"));
  return persisted;
});
