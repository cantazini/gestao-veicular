import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanyList, OrganizationCards, OrganizationDirectory, OrganizationLogo } from "./OrganizationDirectory";
import type { Entity } from "../types";

const client: Entity = { id: "c", name: "Cliente de exemplo", legalName: "Razão social extensa de exemplo", document: "12345678000190", logoBlobPath: "/logo.png", active: true };
const clients = new Map([[client.id, client]]);
const base = { clients, canWrite: true, onEdit: () => undefined };
describe("apresentação dos diretórios", () => {
  it("exibe logo protagonista, nome, razão social, CNPJ, status e editar", () => {
    const html = renderToStaticMarkup(createElement(OrganizationCards, { ...base, kind: "clients", items: [client] }));
    for (const value of ["organization-logo--prominent", "/logo.png", String(client.name), String(client.legalName), "12.345.678/0001-90", "Ativo", "Editar"]) expect(html).toContain(value);
  });
  it("usa iniciais sem logo e não sobrepõe fallback na logo transparente", () => {
    expect(renderToStaticMarkup(createElement(OrganizationLogo, { item: { id: "c", name: "Cliente Exemplo" } }))).toContain("CE");
    expect(renderToStaticMarkup(createElement(OrganizationLogo, { item: client }))).not.toContain("Sem logo:");
  });
  it("resolve nome e logo pelo clientId real e tolera cliente ausente", () => {
    const html = renderToStaticMarkup(createElement(OrganizationCards, { ...base, kind: "projects", items: [{ id: "p", clientId: "c", name: "Ponte", code: "0003", active: true }, { id: "q", clientId: "missing", name: "Legado" }] }));
    for (const value of ["folder-open", "/logo.png", "Cliente de exemplo", "Código 0003", "Cliente não disponível"]) expect(html).toContain(value);
  });
  it("preserva metadados de empresas em cards e lista e respeita permissão de edição", () => {
    const items: Entity[] = [{ id: "e", legalName: "Empresa Longa", clientId: "c", document: "12345678000190", unit: "Sul", contractType: "subcontractor", active: false }];
    const cards = renderToStaticMarkup(createElement(OrganizationCards, { ...base, kind: "companies", items, canWrite: false }));
    const list = renderToStaticMarkup(createElement(CompanyList, { ...base, items, canWrite: false }));
    for (const html of [cards, list]) {
      for (const value of ["Empresa Longa", "12.345.678/0001-90", "Cliente de exemplo", "Sul", "Subcontratado", "Inativo"]) expect(html).toContain(value);
      expect(html).not.toContain("Editar");
    }
  });
  it("oferece filtros, ordenação, alternância e hierarquia mesmo sem registros", () => {
    const html = renderToStaticMarkup(createElement(OrganizationDirectory, { kind: "companies", clients: [client], items: [], canWrite: true, onEdit: () => undefined }));
    for (const label of ["Razão social", "CNPJ", "Cliente", "Unidade", "Tipo de contrato", "Status", "Limpar filtros", "Ordenar por", "Cards", "Lista", "Ver hierarquia", "Nenhum registro encontrado"]) expect(html).toContain(label);
  });
});
