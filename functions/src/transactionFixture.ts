// Utilitário exclusivo de testes: substitui toda a E/S do Firestore por dados em memória.
// Nenhum teste que o utiliza acessa um projeto Firebase real.
import { vi } from "vitest";
import { DocumentReference, type Query, type Transaction } from "firebase-admin/firestore";
import { firestore } from "./firebase.js";

export type FixtureRow = Record<string, unknown>;
export interface FixtureWrite { type: "set" | "update" | "delete"; path: string; value?: FixtureRow; options?: unknown }

/**
 * `rows`: documentos por caminho (ex.: "inspections/a").
 * `queries`: resultado de cada consulta, casado por `Query.isEqual` e expresso como lista de caminhos em `rows`.
 */
export function transactionFixture(rows: Record<string, FixtureRow>, queries: Array<{ query: Query; paths: string[] }> = []) {
  const writes: FixtureWrite[] = [];
  const readPaths: string[] = [];
  const snapshotOf = (path: string) => ({ exists: Boolean(rows[path]), id: path.split("/").at(-1), ref: firestore.doc(path), data: () => rows[path] });
  const transaction = {
    get: vi.fn(async (target: DocumentReference | Query) => {
      if (writes.length) throw new Error("Leitura depois de gravação na transação");
      if (target instanceof DocumentReference) {
        readPaths.push(target.path);
        return snapshotOf(target.path);
      }
      const match = queries.find((candidate) => candidate.query.isEqual(target));
      const docs = (match?.paths ?? []).filter((path) => rows[path]).map(snapshotOf);
      return { docs, size: docs.length, empty: docs.length === 0, forEach: (callback: (doc: unknown) => void) => docs.forEach(callback) };
    }),
    set: vi.fn((reference: DocumentReference, value: FixtureRow, options?: unknown) => { writes.push({ type: "set", path: reference.path, value, options }); }),
    update: vi.fn((reference: DocumentReference, value: FixtureRow) => { writes.push({ type: "update", path: reference.path, value }); }),
    delete: vi.fn((reference: DocumentReference) => { writes.push({ type: "delete", path: reference.path }); })
  };
  vi.spyOn(firestore, "runTransaction").mockImplementation(async (work) => work(transaction as unknown as Transaction));
  const written = (path: string) => writes.filter((write) => write.path === path);
  return { writes, readPaths, transaction, written };
}
