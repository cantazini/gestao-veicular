import type { UserRole } from "../types/auth";
import type { EntityName } from "../validation/entities";

export type SqlFieldType = "text" | "int" | "decimal" | "bit" | "date" | "uuid";
export interface FieldDefinition { column: string; type: SqlFieldType; writable?: boolean }
export interface EntityDefinition {
  table: string;
  fields: Record<string, FieldDefinition>;
  searchColumns: string[];
  orderBy: string;
  readRoles: UserRole[];
  writeRoles: UserRole[];
  supplierScope?: "id" | "company_id" | "project_company" | "client_company";
}

const auditFields = {
  createdAt: { column: "created_at", type: "date" as const },
  updatedAt: { column: "updated_at", type: "date" as const }
};

export const entityDefinitions: Record<EntityName, EntityDefinition> = {
  clients: {
    table: "dbo.clients", searchColumns: ["name", "legal_name", "document_normalized"], orderBy: "name",
    readRoles: ["admin", "inspector", "supplier"], writeRoles: ["admin"], supplierScope: "client_company",
    fields: {
      id: { column: "id", type: "uuid" }, name: { column: "name", type: "text", writable: true },
      legalName: { column: "legal_name", type: "text", writable: true }, document: { column: "document", type: "text", writable: true },
      logoBlobPath: { column: "logo_blob_path", type: "text", writable: true }, active: { column: "active", type: "bit", writable: true }, ...auditFields
    }
  },
  projects: {
    table: "dbo.projects", searchColumns: ["name", "code"], orderBy: "name",
    readRoles: ["admin", "inspector", "supplier"], writeRoles: ["admin"], supplierScope: "project_company",
    fields: {
      id: { column: "id", type: "uuid" }, clientId: { column: "client_id", type: "uuid", writable: true },
      name: { column: "name", type: "text", writable: true }, code: { column: "code", type: "text", writable: true },
      active: { column: "active", type: "bit", writable: true }, ...auditFields
    }
  },
  companies: {
    table: "dbo.companies", searchColumns: ["legal_name", "trade_name", "document_normalized", "contract_number"], orderBy: "legal_name",
    readRoles: ["admin", "inspector", "supplier"], writeRoles: ["admin"], supplierScope: "id",
    fields: {
      id: { column: "id", type: "uuid" }, clientId: { column: "client_id", type: "uuid", writable: true },
      parentCompanyId: { column: "parent_company_id", type: "uuid", writable: true }, legalName: { column: "legal_name", type: "text", writable: true },
      tradeName: { column: "trade_name", type: "text", writable: true }, document: { column: "document", type: "text", writable: true },
      unit: { column: "unit", type: "text", writable: true }, managerName: { column: "manager_name", type: "text", writable: true },
      phone: { column: "phone", type: "text", writable: true }, email: { column: "email", type: "text", writable: true },
      contractNumber: { column: "contract_number", type: "text", writable: true }, contractType: { column: "contract_type", type: "text", writable: true },
      contractStart: { column: "contract_start", type: "date", writable: true }, contractEnd: { column: "contract_end", type: "date", writable: true },
      active: { column: "active", type: "bit", writable: true }, ...auditFields
    }
  },
  drivers: {
    table: "dbo.drivers", searchColumns: ["name", "registration_normalized"], orderBy: "name",
    readRoles: ["admin", "inspector", "supplier"], writeRoles: ["admin", "supplier"], supplierScope: "company_id",
    fields: {
      id: { column: "id", type: "uuid" }, companyId: { column: "company_id", type: "uuid", writable: true },
      name: { column: "name", type: "text", writable: true }, registration: { column: "registration", type: "text", writable: true },
      jobTitle: { column: "job_title", type: "text", writable: true }, licenseCategory: { column: "license_category", type: "text", writable: true },
      licenseNumber: { column: "license_number", type: "text", writable: true }, licenseExpiry: { column: "license_expiry", type: "date", writable: true },
      provisionalLicense: { column: "provisional_license", type: "bit", writable: true }, active: { column: "active", type: "bit", writable: true }, ...auditFields
    }
  },
  vehicles: {
    table: "dbo.vehicles", searchColumns: ["plate_normalized", "brand", "model"], orderBy: "plate_normalized",
    readRoles: ["admin", "inspector", "supplier"], writeRoles: ["admin", "supplier"], supplierScope: "company_id",
    fields: {
      id: { column: "id", type: "uuid" }, companyId: { column: "company_id", type: "uuid", writable: true },
      projectId: { column: "project_id", type: "uuid", writable: true }, accessProfileId: { column: "access_profile_id", type: "uuid", writable: true },
      plate: { column: "plate", type: "text", writable: true }, brand: { column: "brand", type: "text", writable: true },
      model: { column: "model", type: "text", writable: true }, year: { column: "year", type: "int", writable: true },
      type: { column: "type", type: "text", writable: true }, color: { column: "color", type: "text", writable: true },
      fuel: { column: "fuel", type: "text", writable: true }, mileage: { column: "mileage", type: "int", writable: true },
      ownership: { column: "ownership", type: "text", writable: true }, rentalCompany: { column: "rental_company", type: "text", writable: true },
      inspectionSequence: { column: "inspection_sequence", type: "int" }, active: { column: "active", type: "bit", writable: true }, ...auditFields
    }
  },
  accessProfiles: {
    table: "dbo.access_profiles", searchColumns: ["name"], orderBy: "name",
    readRoles: ["admin", "inspector", "supplier"], writeRoles: ["admin"],
    fields: {
      id: { column: "id", type: "uuid" }, clientId: { column: "client_id", type: "uuid", writable: true },
      name: { column: "name", type: "text", writable: true }, description: { column: "description", type: "text", writable: true },
      color: { column: "color", type: "text", writable: true }, active: { column: "active", type: "bit", writable: true }, ...auditFields
    }
  },
  users: {
    table: "dbo.app_users", searchColumns: ["name", "email"], orderBy: "name",
    readRoles: ["admin"], writeRoles: ["admin"],
    fields: {
      id: { column: "id", type: "uuid" }, identityProviderId: { column: "identity_provider_id", type: "text", writable: true },
      email: { column: "email", type: "text", writable: true }, name: { column: "name", type: "text", writable: true },
      role: { column: "role", type: "text", writable: true }, companyId: { column: "company_id", type: "uuid", writable: true },
      active: { column: "active", type: "bit", writable: true }, ...auditFields
    }
  }
};
