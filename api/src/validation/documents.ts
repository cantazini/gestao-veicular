import { z } from "zod";
import { editableSqlDate, optionalSqlGuid } from "./sqlFields";

export const documentEntityType = z.enum(["company", "driver", "vehicle"]);
export const documentStatus = z.enum(["VALID", "EXPIRING", "EXPIRED"]);

export const documentQuerySchema = z.object({
  entityType: documentEntityType.optional(),
  entityId: optionalSqlGuid,
  clientId: optionalSqlGuid,
  companyId: optionalSqlGuid,
  documentType: z.string().trim().max(60).optional(),
  status: documentStatus.optional(),
  search: z.string().trim().max(180).optional()
});

const validateDocumentDateRange = (
  value: { issueDate?: string | null; expiryDate?: string | null },
  context: z.RefinementCtx
) => {
  if (value.issueDate && value.expiryDate && value.expiryDate < value.issueDate) {
    context.addIssue({
      code: "custom",
      path: ["expiryDate"],
      message: "A data de validade não pode ser anterior à data de emissão."
    });
  }
};

export const documentUpdateSchema = z.object({
  documentType: z.string().trim().min(1).max(60).optional(),
  label: z.string().trim().min(1).max(140).optional(),
  issueDate: editableSqlDate,
  expiryDate: editableSqlDate,
  observation: z.string().trim().max(500).optional()
}).superRefine(validateDocumentDateRange);

export { validateDocumentDateRange };

export type DocumentQuery = z.infer<typeof documentQuerySchema>;
export type DocumentUpdate = z.infer<typeof documentUpdateSchema>;
