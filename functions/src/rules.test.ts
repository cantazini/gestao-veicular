import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "..");
const firestoreRules = readFileSync(resolve(root, "firestore.rules"), "utf8");
const storageRules = readFileSync(resolve(root, "storage.rules"), "utf8");
const defaultStorageRules = readFileSync(resolve(root, "storage.default.rules"), "utf8");

describe("invariantes das Rules versionadas", () => {
  it("mantém negação final no Firestore e protege auditoria/unique keys", () => {
    expect(firestoreRules).toContain("match /{document=**}");
    expect(firestoreRules).toContain("match /auditLogs/{logId}");
    expect(firestoreRules).toContain("match /uniqueKeys/{keyId}");
    expect(firestoreRules.match(/allow read, write: if false/g)?.length).toBeGreaterThanOrEqual(2);
    expect(firestoreRules).toContain("allow write: if false");
  });
  it("restringe os papéis atuais a Admin e Fiscalizador", () => {
    expect(firestoreRules).toContain("['admin', 'inspector']");
    expect(firestoreRules).not.toContain("supplier");
  });
  it("limita tipos e tamanhos no bucket da aplicação", () => {
    expect(storageRules).toContain("10 * 1024 * 1024");
    expect(storageRules).toContain("application/pdf");
    expect(storageRules).toContain("image/jpeg");
  });
  it("nega integralmente o bucket default", () => {
    expect(defaultStorageRules).toContain("allow read, write: if false");
  });
});
