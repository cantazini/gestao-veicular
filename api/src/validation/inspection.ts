import { z } from "zod";

export const inspectionSchema = z.object({
  companyId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  projectId: z.string().uuid(),
  inspectionDate: z.iso.date(),
  inspectionTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  mileage: z.number().int().nonnegative(),
  generalObservations: z.string().trim().max(4000).optional().default(""),
  items: z.array(z.object({
    key: z.string().min(1).max(80),
    categoryKey: z.string().min(1).max(80),
    categoryLabel: z.string().min(1).max(100),
    label: z.string().min(1).max(200),
    status: z.enum(["conforme", "nao_conforme", "nao_se_aplica"]),
    observation: z.string().trim().max(500).optional().default("")
  }))
});

export const inspectionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  startDate: z.iso.date().optional(),
  endDate: z.iso.date().optional(),
  clientId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  plate: z.string().max(12).optional(),
  result: z.enum(["APROVADO", "REPROVADO"]).optional(),
  inspector: z.string().max(160).optional()
});
