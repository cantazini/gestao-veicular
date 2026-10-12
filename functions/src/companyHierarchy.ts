import { HttpsError } from "firebase-functions/v2/https";

type CompanyReference = { parentCompanyId?: unknown; clientId?: unknown; active?: unknown };

/** The supplied reader must use the same transaction as the company write. */
export async function validateCompanyAncestry(id: string, parentId: unknown, clientId: unknown, read: (id: string) => Promise<CompanyReference | undefined>) {
  const visited = new Set([id]);
  let cursor = String(parentId || "");
  let first = true;
  while (cursor) {
    if (visited.has(cursor)) throw new HttpsError("failed-precondition", "A empresa contratante criaria um ciclo na hierarquia.");
    visited.add(cursor);
    const company = await read(cursor);
    if (!company || company.clientId !== clientId || (first && company.active !== true)) {
      throw new HttpsError("failed-precondition", "A empresa contratante deve estar ativa e sua hierarquia deve pertencer ao mesmo cliente.");
    }
    first = false;
    cursor = String(company.parentCompanyId || "");
  }
}
