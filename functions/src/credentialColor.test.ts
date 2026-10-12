import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCredentialEligibility } from "./credentials.js";

const state = vi.hoisted(() => ({ issuedProfile: "", selectedColor: "#0056A4", reads: [] as string[] }));
vi.mock("./auth.js", () => ({ requireActiveUser: vi.fn(async () => ({ id: "admin" })) }));
vi.mock("./firebase.js", () => {
  const snap = (id: string, data?: Record<string, unknown>) => ({ id, exists: Boolean(data), data: () => data });
  return { serverTimestamp: vi.fn(), firestore: { collection: (name: string) => {
    const collection = {
      doc: (id: string) => ({ get: async () => {
        state.reads.push(`${name}/${id}`);
        if (name === "vehicles") return snap(id, { companyId: "company", driverIds: ["driver"], active: true });
        if (name === "accessProfiles") return snap(id, id === "missing" ? undefined : { color: id === "selected" ? state.selectedColor : "#fafd44" });
        if (name === "companies") return snap(id, { active: true, clientId: "client" });
        if (name === "drivers") return snap(id, { active: true, licenseExpiry: "2999-01-01" });
        return snap(id, {});
      } }),
      where: () => collection, orderBy: () => collection,
      get: async () => ({ docs: name === "credentials" && state.issuedProfile ? [snap("issued", { driverId: "driver", accessProfileId: state.issuedProfile, status: "active", code: "CRD-EXISTING", validUntil: "2999-01-01" })] : [] })
    };
    return collection;
  } } };
});

const run = () => getCredentialEligibility.run({ data: { vehicleId: "vehicle", accessProfileId: "selected", clientId: "client" } } as Parameters<typeof getCredentialEligibility.run>[0]);
beforeEach(() => { state.issuedProfile = ""; state.selectedColor = "#0056A4"; state.reads = []; });
describe("origem oficial da cor da credencial", () => {
  it.each(["#0056A4", "#292929", "#fda50d", "#fafd44"])("transporta %s do perfil consultado para preview", async (color) => {
    state.selectedColor = color;
    expect((await run())[0].accessProfileColor).toBe(color);
  });
  it("usa o perfil da credencial emitida, não o select atual", async () => {
    state.issuedProfile = "original";
    const card = (await run())[0];
    expect(card.accessProfileColor).toBe("#fafd44");
    expect(card.credentialCode).toBe("CRD-EXISTING");
    expect(state.reads).toContain("accessProfiles/original");
  });
  it("não repete a consulta quando o perfil emitido é o mesmo", async () => {
    state.issuedProfile = "selected";
    await run();
    expect(state.reads.filter((path) => path === "accessProfiles/selected")).toHaveLength(1);
  });
  it("deixa o frontend usar fallback se o perfil emitido não existir", async () => {
    state.issuedProfile = "missing";
    expect((await run())[0].accessProfileColor).toBeNull();
  });
});
