import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_DRIVER_FILTERS, type DriverFilters } from "../lib/driverGroups";
import type { Entity } from "../types";
import { DriverCompanyGroups } from "./DriverCompanyGroups";

const companies: Entity[] = [
  { id: "company-logo", legalName: "Empresa com Logo", logoBlobPath: "/logo.png", active: true },
  { id: "company-fallback", legalName: "Empresa sem Logo", active: true }
];
const drivers: Entity[] = [
  { id: "driver-active", companyId: "company-logo", name: "Motorista Ativo", registration: "M-1", licenseCategory: "D", licenseExpiry: "2029-12-30", active: true },
  { id: "driver-inactive", companyId: "company-fallback", name: "Motorista Inativo", registration: "M-2", licenseCategory: "B", licenseExpiry: "2028-10-20", active: false }
];

const renderGroups = (filters: DriverFilters = EMPTY_DRIVER_FILTERS) => renderToStaticMarkup(createElement(DriverCompanyGroups, {
  drivers, companies, filters, canWrite: true, onEdit: () => undefined
}));

describe("cards de motoristas por empresa", () => {
  it("renderiza logo, fallback, status e ação de edição", () => {
    const html = renderGroups();
    expect(html).toContain('alt="Logo Empresa com Logo"');
    expect(html).toContain('aria-label="Identificação Empresa sem Logo"');
    expect(html).toContain("EL");
    expect(html).toContain("Ativo");
    expect(html).toContain("Inativo");
    expect(html.match(/Editar/g)).toHaveLength(2);
  });

  it("abre automaticamente a empresa correspondente durante a filtragem", () => {
    const html = renderGroups({ ...EMPTY_DRIVER_FILTERS, name: "Motorista Ativo" });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Empresa com Logo");
    expect(html).not.toContain("Empresa sem Logo");
    expect(html).toContain("1 motorista");
  });

  it("mantém o nome completo de empresas longas no conteúdo do card", () => {
    const longCompany = [{ id: "long", legalName: "Meta Central de Serviços Industriais", active: true }];
    const longDriver = [{ ...drivers[0], id: "long-driver", companyId: "long" }];
    const html = renderToStaticMarkup(createElement(DriverCompanyGroups, {
      drivers: longDriver, companies: longCompany, filters: EMPTY_DRIVER_FILTERS, canWrite: true, onEdit: () => undefined
    }));
    expect(html).toContain("Meta Central de Serviços Industriais");
  });
});
