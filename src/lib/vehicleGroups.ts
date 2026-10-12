import type { Entity } from "../types";
import { entityCompanyIds } from "./companyLinks";

export const VEHICLE_TYPES = [
  { id: "light_vehicle", label: "Carros Leves", storedValue: "Carros Leves" },
  { id: "microbus", label: "Micro-Ônibus", storedValue: "Micro-Ônibus" },
  { id: "motorcycle", label: "Motocicleta", storedValue: "Motocicleta" },
  { id: "bus", label: "Ônibus", storedValue: "Ônibus" },
  { id: "van", label: "Van", storedValue: "Van" }
] as const;

export type VehicleCategoryId = typeof VEHICLE_TYPES[number]["id"];
export type VehicleCategoryGroupId = VehicleCategoryId | "legacy";
export type VehicleStatusFilter = "all" | "active" | "inactive";
export type VehicleTypeFilter = "all" | VehicleCategoryId;

export interface VehicleFilters {
  company: string;
  plate: string;
  brand: string;
  model: string;
  type: VehicleTypeFilter;
  status: VehicleStatusFilter;
}

export interface VehicleCompanyGroup {
  id: string;
  name: string;
  company?: Entity;
  vehicles: Entity[];
}

export interface VehicleCategoryGroup {
  id: VehicleCategoryGroupId;
  label: string;
  count: number;
  companies: VehicleCompanyGroup[];
}

export const EMPTY_VEHICLE_FILTERS: VehicleFilters = {
  company: "",
  plate: "",
  brand: "",
  model: "",
  type: "all",
  status: "all"
};

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const UNASSIGNED_COMPANY_ID = "unassigned";

const normalized = (value: unknown) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();

export function normalizeVehicleType(value: unknown): VehicleCategoryId | null {
  const type = normalized(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (["carro", "carros leves", "light vehicle"].includes(type)) return "light_vehicle";
  if (["micro onibus", "microonibus", "microbus"].includes(type)) return "microbus";
  if (["moto", "motocicleta", "motorcycle"].includes(type)) return "motorcycle";
  if (["onibus", "bus"].includes(type)) return "bus";
  if (type === "van") return "van";
  return null;
}

export const vehicleCountLabel = (count: number) => `${count} ${count === 1 ? "veículo" : "veículos"}`;

export const hasVehicleFilters = (filters: VehicleFilters) => Boolean(
  filters.company.trim() ||
  filters.plate.trim() ||
  filters.brand.trim() ||
  filters.model.trim() ||
  filters.type !== "all" ||
  filters.status !== "all"
);

export function vehicleTypeLabel(value: unknown) {
  const category = normalizeVehicleType(value);
  return category ? VEHICLE_TYPES.find((item) => item.id === category)!.label : String(value || "Tipo não informado");
}

export function formatVehicleMileage(value: unknown) {
  const mileage = Number(value);
  return `${Number.isFinite(mileage) ? Math.max(0, mileage).toLocaleString("pt-BR") : "0"} km`;
}

function companyName(company?: Entity) {
  return String(company?.legalName || company?.tradeName || "Sem empresa vinculada");
}

function linkedCompanies(vehicle: Entity, companyById: Map<string, Entity>) {
  return entityCompanyIds(vehicle).map((id) => companyById.get(id)).filter((company): company is Entity => Boolean(company));
}

function companyMatchesTerm(company: Entity | undefined, term: string) {
  return !term || normalized([company?.legalName, company?.tradeName, companyName(company)].join(" ")).includes(term);
}

// Um veículo que atende várias empresas aparece no grupo de cada empresa vinculada; a contagem da categoria segue única.
function companyGroups(vehicles: Entity[], companyById: Map<string, Entity>, companyTerm = ""): VehicleCompanyGroup[] {
  const grouped = new Map<string, { company?: Entity; vehicles: Entity[] }>();
  for (const vehicle of vehicles) {
    const companies = linkedCompanies(vehicle, companyById);
    const targets: Array<Entity | undefined> = companies.length ? companies.filter((company) => companyMatchesTerm(company, companyTerm)) : [undefined];
    for (const company of targets) {
      const id = company?.id || UNASSIGNED_COMPANY_ID;
      const current = grouped.get(id) || { company, vehicles: [] };
      current.vehicles.push(vehicle);
      grouped.set(id, current);
    }
  }
  return [...grouped.entries()].map(([id, group]) => ({
    id,
    name: companyName(group.company),
    company: group.company,
    vehicles: group.vehicles.sort((a, b) => collator.compare(String(a.plate || ""), String(b.plate || "")))
  })).sort((a, b) => {
    if (a.id === UNASSIGNED_COMPANY_ID) return 1;
    if (b.id === UNASSIGNED_COMPANY_ID) return -1;
    return collator.compare(a.name, b.name);
  });
}

export function groupVehiclesByTypeAndCompany(vehicles: Entity[], companies: Entity[], filters: VehicleFilters = EMPTY_VEHICLE_FILTERS): VehicleCategoryGroup[] {
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const companyTerm = normalized(filters.company);
  const plateTerm = normalized(filters.plate);
  const brandTerm = normalized(filters.brand);
  const modelTerm = normalized(filters.model);
  const filtered = vehicles.filter((vehicle) => {
    const companies = linkedCompanies(vehicle, companyById);
    const category = normalizeVehicleType(vehicle.type);
    const matchesCompany = !companyTerm || (companies.length ? companies.some((company) => companyMatchesTerm(company, companyTerm)) : companyMatchesTerm(undefined, companyTerm));
    return matchesCompany &&
      (!plateTerm || normalized(vehicle.plate).includes(plateTerm)) &&
      (!brandTerm || normalized(vehicle.brand).includes(brandTerm)) &&
      (!modelTerm || normalized(vehicle.model).includes(modelTerm)) &&
      (filters.type === "all" || category === filters.type) &&
      (filters.status === "all" || Boolean(vehicle.active) === (filters.status === "active"));
  });

  const groups: VehicleCategoryGroup[] = VEHICLE_TYPES.map((definition) => {
    const categoryVehicles = filtered.filter((vehicle) => normalizeVehicleType(vehicle.type) === definition.id);
    return { id: definition.id, label: definition.label, count: categoryVehicles.length, companies: companyGroups(categoryVehicles, companyById, companyTerm) };
  });
  const legacyVehicles = filtered.filter((vehicle) => normalizeVehicleType(vehicle.type) === null);
  if (legacyVehicles.length) groups.push({
    id: "legacy",
    label: "Outros tipos cadastrados",
    count: legacyVehicles.length,
    companies: companyGroups(legacyVehicles, companyById, companyTerm)
  });
  return groups;
}
