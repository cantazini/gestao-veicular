import type { HttpRequest } from "@azure/functions";
import { getConfig } from "../config";
import { findUserByIdentity } from "../repositories/userRepository";
import type { AppUser, ClientPrincipal, RequestContext, UserRole } from "../types/auth";
import { forbidden, unauthorized } from "../utils/errors";

export function decodePrincipal(header: string | null): ClientPrincipal | null {
  if (!header) return null;
  try {
    const parsed = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Partial<ClientPrincipal>;
    if (!parsed.userId || !parsed.identityProvider) return null;
    return {
      identityProvider: parsed.identityProvider,
      userId: parsed.userId,
      userDetails: parsed.userDetails || "",
      userRoles: Array.isArray(parsed.userRoles) ? parsed.userRoles : []
    };
  } catch {
    return null;
  }
}

function localPrincipal(request: HttpRequest): ClientPrincipal | null {
  const config = getConfig();
  const hostname = new URL(request.url).hostname;
  if (!config.devAuth || config.environment !== "Development" || !["localhost", "127.0.0.1"].includes(hostname)) return null;
  if (!config.devAuthUserId || !config.devAuthEmail) throw unauthorized("Configure DEV_AUTH_USER_ID e DEV_AUTH_EMAIL para o desenvolvimento local.");
  return {
    identityProvider: "development-only",
    userId: config.devAuthUserId,
    userDetails: config.devAuthEmail,
    userRoles: ["authenticated"]
  };
}

export function assertRoles(user: AppUser, roles: readonly UserRole[]): void {
  if (!roles.includes(user.role)) throw forbidden();
}

export function assertCompanyScope(user: AppUser, companyId: string): void {
  if (user.role === "supplier" && (!user.companyId || user.companyId !== companyId)) {
    throw forbidden("O fornecedor só pode acessar registros da própria empresa.");
  }
}

export async function authenticate(request: HttpRequest, roles?: readonly UserRole[]): Promise<RequestContext> {
  const principal = decodePrincipal(request.headers.get("x-ms-client-principal")) || localPrincipal(request);
  if (!principal) throw unauthorized();
  const user = await findUserByIdentity(principal.userId);
  if (!user) throw forbidden("Sua identidade corporativa ainda não possui perfil no sistema.");
  if (!user.active) throw forbidden("Seu perfil está inativo. Procure um administrador.");
  if (roles) assertRoles(user, roles);
  return { principal, user };
}
