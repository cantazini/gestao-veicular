import { describe, expect, it } from "vitest";
import { companyForest, createsCompanyCycle, EMPTY_ORGANIZATION_FILTERS as empty, filterOrganizations, readCompanyView, saveCompanyView, searchCompanyForest } from "./organizationDirectory";
import type { Entity } from "../types";

const clients: Entity[] = [{ id: "c1", name: "Árvore", legalName: "Árvore Serviços", document: "12345678000190", active: true }, { id: "c2", name: "Zeta", legalName: "Zeta Ltda", active: false }];
const map = new Map(clients.map((c) => [c.id, c]));
const companies: Entity[] = [
  { id: "a", clientId: "c1", legalName: "Principal", contractType: "direct", active: true, unit: "Sul", document: "12345678000190" },
  { id: "b", clientId: "c1", legalName: "Filha", parentCompanyId: "a", contractType: "subcontractor", active: true },
  { id: "c", clientId: "c1", legalName: "Neta", parentCompanyId: "b", contractType: "subcontractor", active: false },
  { id: "d", clientId: "c2", legalName: "Legada", contractType: "subcontractor", active: true }
];
describe("diretórios organizacionais", () => {
  it.each(["arvore", "SERVIÇOS", "12.345.678/0001", "12345678"])("busca cliente por %s", (search) => expect(filterOrganizations(clients, "clients", { ...empty, search }, "name-asc", map).map((i) => i.id)).toEqual(["c1"]));
  it("filtra status e ordena clientes sem alterar a origem", () => {
    expect(filterOrganizations(clients, "clients", empty, "name-desc", map).map((i) => i.id)).toEqual(["c2", "c1"]);
    expect(filterOrganizations(clients, "clients", { ...empty, status: "inactive" }, "name-asc", map)).toEqual([clients[1]]);
    expect(clients[0].id).toBe("c1");
  });
  it("filtra projetos por cliente, nome, código e status; ordena códigos numericamente", () => {
    const projects: Entity[] = [{ id: "p1", name: "Viaduto", code: "10", clientId: "c1", active: true }, { id: "p2", name: "Ponte", code: "2", clientId: "c2", active: false }];
    expect(filterOrganizations(projects, "projects", { ...empty, clientId: "c1", name: "viA", code: "1", status: "active" }, "name-asc", map)).toEqual([projects[0]]);
    expect(filterOrganizations(projects, "projects", empty, "code-asc", map).map((i) => i.id)).toEqual(["p2", "p1"]);
    expect(filterOrganizations(projects, "projects", empty, "code-desc", map).map((i) => i.id)).toEqual(["p1", "p2"]);
  });
  it("combina todos os filtros de empresa", () => {
    expect(filterOrganizations(companies, "companies", { ...empty, name: "princi", document: "12.345", clientId: "c1", unit: "sul", contractType: "direct", status: "active" }, "name-asc", map)).toEqual([companies[0]]);
    expect(filterOrganizations(companies, "companies", { ...empty, document: "abc" }, "name-asc", map)).toEqual([]);
    expect(filterOrganizations(companies, "companies", empty, "name-desc", map)[0].id).toBe("a");
  });
  it("preserva três níveis, inativas e subcontratadas sem pai", () => {
    const tree = companyForest(companies);
    expect(tree.find((n) => n.company.id === "a")?.children[0].children[0].company.id).toBe("c");
    expect(tree.find((n) => n.company.id === "d")?.warning).toBe("Hierarquia não informada");
    const found = searchCompanyForest(tree, "neta");
    expect(found[0].company.id).toBe("a");
    expect(found[0].children[0].children[0].company.id).toBe("c");
    expect(searchCompanyForest(tree, "ausente")).toEqual([]);
  });
  it("não oculta ciclos legados, referências ausentes ou de outro cliente", () => {
    const malformed: Entity[] = [{ id: "a", parentCompanyId: "b" }, { id: "b", parentCompanyId: "a" }, { id: "c", parentCompanyId: "missing" }, { id: "d", clientId: "other", parentCompanyId: "c" }];
    const tree = companyForest(malformed);
    expect(tree).toHaveLength(4);
    expect(tree.every((n) => Boolean(n.warning))).toBe(true);
  });
  it("recusa a própria empresa e todos os descendentes como contratantes", () => {
    const byId = new Map(companies.map((c) => [c.id, c]));
    expect(createsCompanyCycle("a", "a", byId)).toBe(true);
    expect(createsCompanyCycle("a", "b", byId)).toBe(true);
    expect(createsCompanyCycle("a", "c", byId)).toBe(true);
    expect(createsCompanyCycle("c", "a", byId)).toBe(false);
  });
  it("persiste somente a preferência local e tolera armazenamento indisponível", () => {
    let value = "";
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
    expect(readCompanyView(storage)).toBe("cards");
    saveCompanyView("list", storage);
    expect(readCompanyView(storage)).toBe("list");
    expect(readCompanyView({ getItem: () => { throw new Error(); } })).toBe("cards");
    expect(() => saveCompanyView("cards", { setItem: () => { throw new Error(); } })).not.toThrow();
  });
});
