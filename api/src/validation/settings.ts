import { z } from "zod";

export const settingsSchema = z.object({
  minimumInspectionCompliance: z.number().min(0).max(100),
  maximumFleetAge: z.number().int().min(1).max(50),
  expiryAlertDays: z.number().int().min(0).max(365),
  allowProvisionalLicense: z.boolean(),
  blockVehicleForAnyIrregularDriver: z.boolean().default(false),
  credentialMaximumDays: z.number().int().min(1).max(730).default(365),
  documentRequirements: z.array(z.object({
    entityType: z.enum(["company", "driver", "vehicle"]),
    documentType: z.string().min(1).max(60),
    label: z.string().min(1).max(100),
    required: z.boolean()
  })),
  credentialDimensions: z.array(z.object({
    vehicleType: z.string().min(1).max(60),
    widthMm: z.number().min(40).max(400),
    heightMm: z.number().min(30).max(300)
  }))
});

export type SettingsInput = z.infer<typeof settingsSchema>;
