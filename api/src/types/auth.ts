export type UserRole = "admin" | "inspector" | "supplier";

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

export interface AppUser {
  id: string;
  identityProviderId: string;
  email: string;
  name: string;
  role: UserRole;
  companyId: string | null;
  active: boolean;
}

export interface RequestContext {
  principal: ClientPrincipal;
  user: AppUser;
}
