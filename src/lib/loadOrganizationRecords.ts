import { api } from "./api";
import type { Entity, PageResult } from "../types";

/** Firebase returns one dataset; the Azure fallback keeps its existing pagination. */
export async function loadOrganizationRecords(entity: string): Promise<PageResult<Entity>> {
  const first = await api<PageResult<Entity>>(`/${entity}?directory=true&pageSize=100`);
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page++) {
    const next = await api<PageResult<Entity>>(`/${entity}?directory=true&pageSize=100&page=${page}`);
    if (!next.items.length) throw new Error("Não foi possível carregar todos os cadastros. Tente novamente.");
    items.push(...next.items);
  }
  return { ...first, items, page: 1, pageSize: items.length };
}
