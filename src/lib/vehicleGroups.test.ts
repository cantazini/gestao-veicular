import { describe, expect, it } from "vitest";
import type { Entity } from "../types";
import { EMPTY_VEHICLE_FILTERS, formatVehicleMileage, groupVehiclesByTypeAndCompany, hasVehicleFilters, normalizeVehicleType, VEHICLE_TYPES, vehicleCountLabel, type VehicleFilters } from "./vehicleGroups";

const companies: Entity[] = [
  { id: "company-z", legalName: "Zeta Logística", tradeName: "Zeta", active: true },
  { id: "company-a", legalName: "Alfa Transportes S.A.", tradeName: "Alfa", active: true }
];

const vehicles: Entity[] = [
  { id: "car-2", companyId: "company-a", plate: "ZZZ9Z99", brand: "Toyota", model: "Corolla", year: 2023, mileage: 25000, type: "Carros Leves", active: false },
  { id: "car-1", companyId: "company-a", plate: "AAA1A11", brand: "Fiat", model: "Cronos", year: 2025, mileage: 9000, type: "Carro", active: true },
  { id: "micro-1", companyId: "company-z", plate: "MIC2B22", brand: "Mercedes", model: "Sprinter", year: 2024, mileage: 50000, type: "Micro-Ônibus", active: true },
  { id: "moto-1", companyId: "company-z", plate: "MOT3C33", brand: "Honda", model: "CG 160", year: 2022, mileage: 12000, type: "Moto", active: true },
  { id: "bus-1", companyId: "company-a", plate: "BUS4D44", brand: "Volvo", model: "B270F", year: 2021, mileage: 100000, type: "Ônibus", active: true },
  { id: "van-1", companyId: "company-z", plate: "VAN5E55", brand: "Renault", model: "Master", year: 2020, mileage: 700000, type: "Van", active: true },
  { id: "legacy-1", companyId: "company-a", plate: "LEG6F66", brand: "Ford", model: "Cargo", year: 2019, mileage: 80000, type: "Caminhão", active: true }
];

const filters = (changes: Partial<VehicleFilters> = {}): VehicleFilters => ({ ...EMPTY_VEHICLE_FILTERS, ...changes });
const groupedVehicles = (changes: Partial<VehicleFilters> = {}) => groupVehiclesByTypeAndCompany(vehicles, companies, filters(changes));
const visibleIds = (changes: Partial<VehicleFilters> = {}) => groupedVehicles(changes).flatMap((category) => category.companies.flatMap((company) => company.vehicles.map((vehicle) => vehicle.id)));

describe("tipos e agrupamento de veículos", () => {
  it("mantém os cinco tipos oficiais na ordem operacional", () => {
    expect(VEHICLE_TYPES.map((type) => type.label)).toEqual(["Carros Leves", "Micro-Ônibus", "Motocicleta", "Ônibus", "Van"]);
    expect(groupedVehicles().slice(0, 5).map((group) => group.id)).toEqual(VEHICLE_TYPES.map((type) => type.id));
  });

  it("normaliza somente tipos legados inequívocos", () => {
    expect(normalizeVehicleType("Carro")).toBe("light_vehicle");
    expect(normalizeVehicleType("Moto")).toBe("motorcycle");
    expect(normalizeVehicleType("Van")).toBe("van");
    expect(normalizeVehicleType("Caminhão")).toBeNull();
    expect(normalizeVehicleType("Utilitário")).toBeNull();
    expect(normalizeVehicleType("Outro")).toBeNull();
  });

  it("agrupa tipo, empresa e veículos com contagens e ordenação", () => {
    const groups = groupedVehicles();
    const cars = groups[0];
    expect(cars.count).toBe(2);
    expect(cars.companies[0].name).toBe("Alfa Transportes S.A.");
    expect(cars.companies[0].vehicles.map((vehicle) => vehicle.plate)).toEqual(["AAA1A11", "ZZZ9Z99"]);
    expect(groups.find((group) => group.id === "legacy")?.companies[0].vehicles[0].id).toBe("legacy-1");
  });

  it("filtra parcialmente por razão social, placa, marca e modelo", () => {
    expect(visibleIds({ company: "alfa transp" })).toEqual(["car-1", "car-2", "bus-1", "legacy-1"]);
    expect(visibleIds({ plate: "5e5" })).toEqual(["van-1"]);
    expect(visibleIds({ brand: "toy" })).toEqual(["car-2"]);
    expect(visibleIds({ model: "cor" })).toEqual(["car-2"]);
  });

  it("filtra por tipo, status e combina todos os critérios", () => {
    expect(visibleIds({ type: "motorcycle" })).toEqual(["moto-1"]);
    expect(visibleIds({ status: "inactive" })).toEqual(["car-2"]);
    expect(visibleIds({ company: "Alfa", brand: "fi", model: "cro", type: "light_vehicle", status: "active" })).toEqual(["car-1"]);
  });

  it("recalcula categorias vazias sem ocultá-las e reconhece filtros limpos", () => {
    const groups = groupedVehicles({ plate: "inexistente" });
    expect(groups).toHaveLength(5);
    expect(groups.every((group) => group.count === 0)).toBe(true);
    expect(hasVehicleFilters(filters())).toBe(false);
    expect(hasVehicleFilters(filters({ type: "van" }))).toBe(true);
    expect(visibleIds()).toHaveLength(vehicles.length);
  });

  it("formata singular, plural e quilometragem sem alterar os dados", () => {
    expect(vehicleCountLabel(1)).toBe("1 veículo");
    expect(vehicleCountLabel(12)).toBe("12 veículos");
    expect(formatVehicleMileage(25000)).toBe("25.000 km");
    expect(formatVehicleMileage(700000)).toBe("700.000 km");
  });
});

describe("veículo que atende várias empresas", () => {
  const shared: Entity = { id: "shared-1", companyId: "company-a", companyIds: ["company-a", "company-z"], plate: "WIN1A23", brand: "Mercedes", model: "Sprinter", year: 2024, mileage: 1000, type: "Van", active: true };
  it("aparece no grupo de cada empresa vinculada sem duplicar a contagem da categoria", () => {
    const vans = groupVehiclesByTypeAndCompany([shared], companies).find((group) => group.id === "van")!;
    expect(vans.count).toBe(1);
    expect(vans.companies.map((company) => company.id).sort()).toEqual(["company-a", "company-z"]);
  });
  it("filtra pela empresa e mostra somente o grupo correspondente", () => {
    const vans = groupVehiclesByTypeAndCompany([shared], companies, filters({ company: "zeta" })).find((group) => group.id === "van")!;
    expect(vans.companies.map((company) => company.id)).toEqual(["company-z"]);
  });
});