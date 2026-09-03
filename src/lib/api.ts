import { mockRequest } from "./mockApi";

const useMock = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === "true" && import.meta.env.VITE_DEV_API === "true";
const backend = import.meta.env.VITE_DATA_BACKEND === "azure" ? "azure" : "firebase";
export class ApiError extends Error { constructor(message: string, public status: number, public details?: unknown) { super(message); } }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (useMock) return mockRequest<T>(path, init);
  if (backend === "firebase") {
    const { firebaseRequest } = await import("./firebaseApi");
    return firebaseRequest<T>(path, init);
  }
  const response = await fetch(`/api${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers }, credentials: "same-origin" });
  if (!response.ok) { let body: { message?: string; details?: unknown; error?: { message?: string; details?: unknown } } = {}; try { body = await response.json(); } catch { /* corpo vazio */ } throw new ApiError(body.error?.message || body.message || "Não foi possível concluir a operação.", response.status, body.error?.details || body.details); }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const mockMode = useMock;
export const firebaseMode = !useMock && backend === "firebase";
