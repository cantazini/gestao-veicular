import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { loadOrganizationRecords } from "./loadOrganizationRecords";

vi.mock("./api", () => ({ api: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
describe("carga completa dos diretórios", () => {
  it("usa uma única resposta quando o adaptador retorna todo o conjunto", async () => {
    const items = Array.from({ length: 150 }, (_, i) => ({ id: String(i) }));
    vi.mocked(api).mockResolvedValueOnce({ items, total: 150, page: 1, pageSize: 150 });
    expect((await loadOrganizationRecords("companies")).items).toHaveLength(150);
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("segue as páginas do fallback sem truncar empresas ou vínculos", async () => {
    vi.mocked(api).mockResolvedValueOnce({ items: [{ id: "a" }], total: 2, page: 1, pageSize: 1 }).mockResolvedValueOnce({ items: [{ id: "b" }], total: 2, page: 2, pageSize: 1 });
    expect((await loadOrganizationRecords("companies")).items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(api).toHaveBeenLastCalledWith("/companies?directory=true&pageSize=100&page=2");
  });
  it("sinaliza carga incompleta em vez de mostrar uma árvore parcial", async () => {
    vi.mocked(api).mockResolvedValueOnce({ items: [{ id: "a" }], total: 2, page: 1, pageSize: 1 }).mockResolvedValueOnce({ items: [], total: 2, page: 2, pageSize: 1 });
    await expect(loadOrganizationRecords("companies")).rejects.toThrow("todos os cadastros");
  });
});
