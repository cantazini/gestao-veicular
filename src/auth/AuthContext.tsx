import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, mockMode } from "../lib/api";
import type { User } from "../types";

interface AuthState { user: User | null; loading: boolean; error: string; signIn: () => void; signOut: () => void }
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => {
    api<{user:User}>("/auth/me")
      .then((result) => setUser(result.user))
      .catch((reason: Error) => {
        if (reason instanceof ApiError && reason.status === 401) return;
        setError(reason.message);
      })
      .finally(() => setLoading(false));
  }, []);
  const value = useMemo(() => ({ user, loading, error, signIn: () => { window.location.href = mockMode ? "/" : "/.auth/login/aad?post_login_redirect_uri=/"; }, signOut: () => { window.location.href = mockMode ? "/" : "/.auth/logout?post_logout_redirect_uri=/"; } }), [user, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const state = useContext(AuthContext); if (!state) throw new Error("AuthProvider ausente"); return state; }
