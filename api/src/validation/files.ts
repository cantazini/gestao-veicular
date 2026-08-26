import { z } from "zod";
import { validateDocumentDateRange } from "./documents";
import { optionalSqlDate, sqlGuid } from "./sqlFields";

export const fileKindSchema = z.enum(["company-document", "driver-document", "vehicle-document", "inspection-photo", "client-branding"]);
export type FileKind = z.infer<typeof fileKindSchema>;

const uploadRequestFields = {
  kind: fileKindSchema,
  entityId: sqlGuid,
  fileName: z.string().trim().min(1).max(220),
  mimeType: z.string().trim().min(1).max(120),
  size: z.number().int().positive().max(20 * 1024 * 1024),
  documentType: z.string().trim().max(60).optional(),
  label: z.string().trim().max(140).optional(),
  issueDate: optionalSqlDate,
  expiryDate: optionalSqlDate,
  observation: z.string().trim().max(500).optional(),
  photoType: z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).optional(),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
  originalSize: z.number().int().positive().optional()
};

export const uploadRequestSchema = z.object(uploadRequestFields).superRefine(validateDocumentDateRange);

export const completeUploadSchema = z.object({
  ...uploadRequestFields,
  blobPath: z.string().min(10).max(700)
}).superRefine(validateDocumentDateRange);
