import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, mockMode } from "../lib/api";
import type { User } from "../types";
import { microsoftSignInUrl, resolveAuthSession, type AuthPhase, type PlatformSession } from "./session";

interface AuthState { user: User | null; loading: boolean; phase: AuthPhase; error: string; signIn: () => void; signOut: () => void }
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [phase, setPhase] = useState<AuthPhase>("initializing"); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const callback = url.searchParams.get("auth") === "callback";
    if (callback) setPhase("validating");
    resolveAuthSession({
      mockMode,
      callback,
      getPlatformSession: async () => {
        const response = await fetch("/.auth/me", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("Não foi possível validar a sessão Microsoft.");
        return response.json() as Promise<PlatformSession>;
      },
      getApplicationUser: async () => (await api<{ user: User }>("/auth/me")).user,
      onPhase: (next) => { if (active) setPhase(next); }
    }).then((authenticatedUser) => {
      if (active) setUser(authenticatedUser);
    }).catch((reason: Error) => {
      if (active) setError(reason.message);
    }).finally(() => {
      if (!active) return;
      if (callback) {
        url.searchParams.delete("auth");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
      setPhase("ready");
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({ user, loading, phase, error, signIn: () => { window.location.href = mockMode ? "/" : microsoftSignInUrl(); }, signOut: () => { window.location.href = mockMode ? "/" : "/.auth/logout?post_logout_redirect_uri=/"; } }), [user, loading, phase, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const state = useContext(AuthContext); if (!state) throw new Error("AuthProvider ausente"); return state; }
