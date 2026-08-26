import { z } from "zod";
import { optionalSqlGuid } from "./sqlFields";

export const credentialQuerySchema = z.object({
  clientId: optionalSqlGuid,
  companyId: optionalSqlGuid,
  vehicleId: optionalSqlGuid,
  accessProfileId: optionalSqlGuid
});

export type CredentialQuery = z.infer<typeof credentialQuerySchema>;
