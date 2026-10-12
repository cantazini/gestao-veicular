import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_VEHICLE_FILTERS, type VehicleFilters } from "../lib/vehicleGroups";
import type { Entity } from "../types";
import { VehicleDirectory } from "./VehicleDirectory";

const companies: Entity[] = [
  { id: "company-photo", legalName: "Empresa com Foto", logoBlobPath: "/company.png", active: true },
  { id: "company-fallback", legalName: "Empresa sem Logo", active: true }
];
const vehicles: Entity[] = [
  { id: "vehicle-photo", companyId: "company-photo", plate: "FOT1A23", brand: "Toyota", model: "Corolla", year: 2025, mileage: 25000, type: "Carro", coverBlobPath: "/vehicle.jpg", active: true },
  { id: "vehicle-placeholder", companyId: "company-fallback", plate: "MOT2B34", brand: "Honda", model: "CG 160", year: 2024, mileage: 1200, type: "Moto", active: false }
];

const renderDirectory = (filters: VehicleFilters = EMPTY_VEHICLE_FILTERS) => renderToStaticMarkup(createElement(VehicleDirectory, {
  vehicles, companies, filters, canWrite: true, onEdit: () => undefined
}));

describe("diretório visual de veículos", () => {
  it("mantém as cinco categorias, status e ação de edição", () => {
    const html = renderDirectory();
    for (const label of ["Carros Leves", "Micro-Ônibus", "Motocicleta", "Ônibus", "Van"]) expect(html).toContain(label);
    expect(html).toContain("1 veículo");
    expect(html).toContain("0 veículos");
  });

  it("autoexpande categoria e empresa únicas e mostra foto existente", () => {
    const html = renderDirectory({ ...EMPTY_VEHICLE_FILTERS, plate: "FOT1" });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('src="/vehicle.jpg"');
    expect(html).toContain('alt="Foto do veículo FOT1A23"');
    expect(html).toContain("25.000 km");
    expect(html).toContain("Ativo");
    expect(html).toContain("Editar");
  });

  it("usa placeholder correspondente ao tipo e fallback de empresa sem logo", () => {
    const html = renderDirectory({ ...EMPTY_VEHICLE_FILTERS, plate: "MOT2" });
    expect(html).not.toContain('alt="Foto do veículo MOT2B34"');
    expect(html).toContain("lucide-bike");
    expect(html).toContain('aria-label="Identificação Empresa sem Logo"');
    expect(html).toContain("EL");
    expect(html).toContain("Inativo");
  });

  it("não oferece edição para perfil sem permissão de escrita", () => {
    const html = renderToStaticMarkup(createElement(VehicleDirectory, {
      vehicles, companies, filters: { ...EMPTY_VEHICLE_FILTERS, plate: "FOT1" }, canWrite: false, onEdit: () => undefined
    }));
    expect(html).not.toContain("Editar");
  });
});
