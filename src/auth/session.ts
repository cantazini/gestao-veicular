import type { User } from "../types";

export type AuthPhase = "initializing" | "validating" | "ready";

export interface PlatformSession {
  clientPrincipal: { userId?: string; userDetails?: string; identityProvider?: string } | null;
}

interface SessionDependencies {
  mockMode: boolean;
  callback: boolean;
  getPlatformSession: () => Promise<PlatformSession>;
  getApplicationUser: () => Promise<User>;
  wait?: (milliseconds: number) => Promise<void>;
  onPhase?: (phase: AuthPhase) => void;
}

const defaultWait = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const statusOf = (error: unknown) => typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : 0;

export async function resolveAuthSession(dependencies: SessionDependencies): Promise<User | null> {
  const wait = dependencies.wait || defaultWait;
  if (dependencies.mockMode) {
    dependencies.onPhase?.("validating");
    return dependencies.getApplicationUser();
  }

  const platformDelays = dependencies.callback ? [0, 250, 750] : [0];
  let platformSession: PlatformSession = { clientPrincipal: null };
  for (const delay of platformDelays) {
    if (delay) await wait(delay);
    platformSession = await dependencies.getPlatformSession();
    if (platformSession.clientPrincipal) break;
  }
  if (!platformSession.clientPrincipal) return null;

  dependencies.onPhase?.("validating");
  const apiDelays = [0, 250, 750];
  for (let attempt = 0; attempt < apiDelays.length; attempt += 1) {
    if (apiDelays[attempt]) await wait(apiDelays[attempt]);
    try {
      return await dependencies.getApplicationUser();
    } catch (error) {
      if (statusOf(error) !== 401 || attempt === apiDelays.length - 1) throw error;
    }
  }
  return null;
}

export function microsoftSignInUrl(): string {
  return `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent("/?auth=callback")}`;
}
