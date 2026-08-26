import type { QueryClient } from "@tanstack/react-query";
import type { Entity, PageResult } from "../types";

export function upsertPageResult<T extends { id: string }>(current: PageResult<T> | undefined, saved: T): PageResult<T> | undefined {
  if (!current) return current;
  const exists = current.items.some((item) => item.id === saved.id);
  return {
    ...current,
    items: exists ? current.items.map((item) => item.id === saved.id ? saved : item) : [saved, ...current.items],
    total: exists ? current.total : current.total + 1
  };
}

export async function refreshEntityQueries(queryClient: QueryClient, entity: string, saved: Entity): Promise<void> {
  queryClient.setQueriesData<PageResult<Entity>>({ queryKey: [entity] }, (current) => upsertPageResult(current, saved));
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: [entity], refetchType: "all" }),
    queryClient.invalidateQueries({ queryKey: ["credential-eligibility"], refetchType: "all" })
  ]);
}
