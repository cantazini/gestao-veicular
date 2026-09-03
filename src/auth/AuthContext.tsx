import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, mockMode } from "../lib/api";
import type { User } from "../types";
import { microsoftSignInUrl, resolveAuthSession, type AuthPhase, type PlatformSession } from "./session";

interface AuthState { user: User | null; loading: boolean; phase: AuthPhase; error: string; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>; resetPassword: (email: string) => Promise<void> }
const AuthContext = createContext<AuthState | null>(null);
const provider = import.meta.env.VITE_AUTH_PROVIDER === "azure" ? "azure" : "firebase";

function friendlyAuthError(reason: unknown) {
  const code = typeof reason === "object" && reason && "code" in reason ? String((reason as { code: unknown }).code) : "";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(code)) return "E-mail ou senha inválidos.";
  if (code === "auth/too-many-requests") return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return reason instanceof Error && reason.message.startsWith("Configuração Firebase") ? reason.message : "Não foi possível autenticar. Tente novamente.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [phase, setPhase] = useState<AuthPhase>("initializing"); const [error, setError] = useState("");
  useEffect(() => {
    if (!mockMode && provider === "firebase") {
      let unsubscribe: () => void = () => undefined;
      let active = true;
      void import("../firebase/authService").then(({ observeFirebaseSession }) => {
        if (!active) return;
        unsubscribe = observeFirebaseSession((authenticated) => { setUser(authenticated); setError(""); setPhase("ready"); setLoading(false); }, (reason) => { setUser(null); setError(reason instanceof Error ? reason.message : "Não foi possível validar seu acesso."); setPhase("ready"); setLoading(false); });
      }).catch((reason) => { if (active) { setError(friendlyAuthError(reason)); setPhase("ready"); setLoading(false); } });
      return () => { active = false; unsubscribe(); };
    }
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
  const value = useMemo(() => ({ user, loading, phase, error,
    signIn: async (email: string, password: string) => {
      setError("");
      if (mockMode) { window.location.href = "/"; return; }
      if (provider === "azure") { window.location.href = microsoftSignInUrl(); return; }
      try { const { signInFirebase } = await import("../firebase/authService"); await signInFirebase(email, password); }
      catch (reason) { const message = friendlyAuthError(reason); setError(message); throw new Error(message); }
    },
    signOut: async () => {
      if (mockMode) { window.location.href = "/"; return; }
      if (provider === "azure") { window.location.href = "/.auth/logout?post_logout_redirect_uri=/"; return; }
      const { signOutFirebase } = await import("../firebase/authService"); await signOutFirebase();
    },
    resetPassword: async (email: string) => {
      if (!email.trim()) throw new Error("Informe seu e-mail para redefinir a senha.");
      if (provider === "azure") throw new Error("A redefinição é administrada pela identidade Microsoft.");
      try { const { resetFirebasePassword } = await import("../firebase/authService"); await resetFirebasePassword(email); }
      catch (reason) {
        const code = typeof reason === "object" && reason && "code" in reason ? String((reason as { code: unknown }).code) : "";
        if (["auth/user-not-found", "auth/invalid-email"].includes(code)) return;
        throw new Error(code === "auth/too-many-requests" ? "Muitas tentativas. Aguarde alguns minutos." : "Não foi possível enviar as instruções agora. Tente novamente.");
      }
    }
  }), [user, loading, phase, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const state = useContext(AuthContext); if (!state) throw new Error("AuthProvider ausente"); return state; }
