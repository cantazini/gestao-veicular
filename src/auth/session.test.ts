import { describe, expect, it, vi } from "vitest";
import type { User } from "../types";
import { microsoftSignInUrl, resolveAuthSession } from "./session";

const user: User = { id: "1", name: "Usuário", email: "u@empresa.com", role: "admin" };
const platform = { clientPrincipal: { userId: "entra-1", identityProvider: "aad" } };
const wait = async () => undefined;

describe("sessão Microsoft Entra", () => {
  it("não chama a API da aplicação para usuário não autenticado", async () => {
    const getApplicationUser = vi.fn(async () => user);
    await expect(resolveAuthSession({ mockMode: false, callback: false, getPlatformSession: async () => ({ clientPrincipal: null }), getApplicationUser, wait })).resolves.toBeNull();
    expect(getApplicationUser).not.toHaveBeenCalled();
  });

  it("conclui autenticação e autorização em um único fluxo", async () => {
    await expect(resolveAuthSession({ mockMode: false, callback: false, getPlatformSession: async () => platform, getApplicationUser: async () => user, wait })).resolves.toEqual(user);
  });

  it("aguarda brevemente a sessão do callback sem polling agressivo", async () => {
    const getPlatformSession = vi.fn()
      .mockResolvedValueOnce({ clientPrincipal: null })
      .mockResolvedValueOnce(platform);
    await expect(resolveAuthSession({ mockMode: false, callback: true, getPlatformSession, getApplicationUser: async () => user, wait })).resolves.toEqual(user);
    expect(getPlatformSession).toHaveBeenCalledTimes(2);
  });

  it("repete somente o 401 transitório entre o Static Web Apps e a API", async () => {
    const getApplicationUser = vi.fn()
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValueOnce(user);
    await expect(resolveAuthSession({ mockMode: false, callback: true, getPlatformSession: async () => platform, getApplicationUser, wait })).resolves.toEqual(user);
    expect(getApplicationUser).toHaveBeenCalledTimes(2);
  });

  it.each([["usuário sem app_user", 403], ["usuário inativo", 403]])("não esconde erro de %s", async (_name, status) => {
    const error = Object.assign(new Error("Acesso não autorizado"), { status });
    await expect(resolveAuthSession({ mockMode: false, callback: true, getPlatformSession: async () => platform, getApplicationUser: async () => { throw error; }, wait })).rejects.toBe(error);
  });

  it("retorna do login para um callback explícito", () => {
    expect(decodeURIComponent(microsoftSignInUrl())).toContain("post_login_redirect_uri=/?auth=callback");
  });
});
