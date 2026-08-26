import { z } from "zod";
import { digits, isValidCnpj } from "../utils/normalize";
import { optionalSqlDate, optionalSqlGuid, sqlGuid } from "./sqlFields";

const active = z.boolean().default(true);
const cnpj = z.string().trim()
  .transform((value) => digits(value))
  .refine((value) => value.length === 14, "Informe um CNPJ com 14 dígitos.")
  .refine(isValidCnpj, "Informe um CNPJ válido.");

export const entitySchemas = {
  clients: z.object({
    name: z.string().trim().min(2).max(140),
    legalName: z.string().trim().min(2).max(180),
    document: cnpj,
    active
  }),
  projects: z.object({
    clientId: sqlGuid,
    name: z.string().trim().min(2).max(140),
    code: z.string().trim().min(1).max(40),
    active
  }),
  companies: z.object({
    clientId: sqlGuid,
    parentCompanyId: optionalSqlGuid,
    legalName: z.string().trim().min(2).max(180),
    tradeName: z.string().trim().max(160).optional().default(""),
    document: z.string().trim().min(14).max(18),
    unit: z.string().trim().max(120).optional().default(""),
    managerName: z.string().trim().max(140).optional().default(""),
    phone: z.string().trim().max(30).optional().default(""),
    email: z.union([z.email(), z.literal("")]).optional().default(""),
    contractNumber: z.string().trim().max(80).optional().default(""),
    contractType: z.enum(["direct", "subcontractor"]),
    contractStart: optionalSqlDate,
    contractEnd: optionalSqlDate,
    projectIds: z.array(sqlGuid).default([]),
    active
  }).superRefine((value, context) => {
    if (value.contractType === "subcontractor" && !value.parentCompanyId) context.addIssue({ code: "custom", path: ["parentCompanyId"], message: "Informe a empresa contratante." });
    if (value.contractStart && value.contractEnd && value.contractEnd < value.contractStart) context.addIssue({ code: "custom", path: ["contractEnd"], message: "A data final deve ser posterior à inicial." });
  }),
  drivers: z.object({
    companyId: sqlGuid,
    name: z.string().trim().min(2).max(160),
    registration: z.string().trim().min(1).max(60),
    jobTitle: z.string().trim().max(100).optional().default(""),
    licenseCategory: z.string().trim().min(1).max(10),
    licenseNumber: z.string().trim().max(40).optional().default(""),
    licenseExpiry: z.iso.date(),
    provisionalLicense: z.boolean().default(false),
    active
  }),
  vehicles: z.object({
    companyId: sqlGuid,
    projectId: sqlGuid,
    accessProfileId: sqlGuid,
    plate: z.string().trim().min(7).max(8),
    brand: z.string().trim().min(1).max(80),
    model: z.string().trim().min(1).max(100),
    year: z.number().int().min(1950).max(2200),
    type: z.string().trim().min(1).max(60),
    color: z.string().trim().max(50).optional().default(""),
    fuel: z.string().trim().max(50).optional().default(""),
    mileage: z.number().int().nonnegative(),
    ownership: z.enum(["owned", "rented"]),
    rentalCompany: z.string().trim().max(160).optional().default(""),
    driverIds: z.array(sqlGuid).default([]),
    active
  }),
  accessProfiles: z.object({
    clientId: optionalSqlGuid,
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional().default(""),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    gates: z.array(z.string().trim().min(1).max(100)).default([]),
    areas: z.array(z.string().trim().min(1).max(100)).default([]),
    active
  }),
  users: z.object({
    identityProviderId: z.string().trim().min(3).max(200),
    email: z.email(),
    name: z.string().trim().min(2).max(160),
    role: z.enum(["admin", "inspector", "supplier"]),
    companyId: optionalSqlGuid,
    active
  }).superRefine((value, context) => {
    if (value.role === "supplier" && !value.companyId) context.addIssue({ code: "custom", path: ["companyId"], message: "Fornecedor deve possuir empresa." });
  })
} as const;

export const entityUpdateSchemas = {
  clients: entitySchemas.clients.partial(),
  projects: entitySchemas.projects.partial(),
  companies: z.object(entitySchemas.companies.shape).partial(),
  drivers: entitySchemas.drivers.partial(),
  vehicles: entitySchemas.vehicles.partial(),
  accessProfiles: entitySchemas.accessProfiles.partial(),
  users: z.object(entitySchemas.users.shape).partial()
} as const;

export type EntityName = keyof typeof entitySchemas;
