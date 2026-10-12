import type { Entity } from "../types";
import { entityCompanyIds } from "./companyLinks";

export const UNASSIGNED_COMPANY_ID = "unassigned";

export interface DriverCompanyGroup {
  id: string;
  name: string;
  company?: Entity;
  drivers: Entity[];
}

export type DriverStatusFilter = "all" | "active" | "inactive";

export interface DriverFilters {
  company: string;
  name: string;
  registration: string;
  license: string;
  status: DriverStatusFilter;
}

export const EMPTY_DRIVER_FILTERS: DriverFilters = {
  company: "",
  name: "",
  registration: "",
  license: "",
  status: "all"
};

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

const normalized = (value: unknown) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();

export const companyName = (company?: Entity) => String(company?.tradeName || company?.legalName || "Sem empresa vinculada");

export function companyInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words.at(-1)?.[0] || ""}`).toLocaleUpperCase("pt-BR");
}

export const driverCountLabel = (count: number) => `${count} ${count === 1 ? "motorista" : "motoristas"}`;

export const hasDriverFilters = (filters: DriverFilters) => Boolean(
  filters.company.trim() ||
  filters.name.trim() ||
  filters.registration.trim() ||
  filters.license.trim() ||
  filters.status !== "all"
);

export function groupDriversByCompany(drivers: Entity[], companies: Entity[], filters: DriverFilters = EMPTY_DRIVER_FILTERS): DriverCompanyGroup[] {
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const grouped = new Map<string, { company?: Entity; drivers: Entity[] }>();

  // Um motorista que atende várias empresas aparece no grupo de cada empresa vinculada.
  for (const driver of drivers) {
    const companies = entityCompanyIds(driver).map((id) => companyById.get(id)).filter((company): company is Entity => Boolean(company));
    for (const company of companies.length ? companies : [undefined]) {
      const id = company?.id || UNASSIGNED_COMPANY_ID;
      const current = grouped.get(id) || { company, drivers: [] };
      current.drivers.push(driver);
      grouped.set(id, current);
    }
  }

  const companyTerm = normalized(filters.company);
  const nameTerm = normalized(filters.name);
  const registrationTerm = normalized(filters.registration);
  const licenseTerm = normalized(filters.license);
  return [...grouped.entries()].map(([id, group]) => {
    const name = companyName(group.company);
    const companyMatches = !companyTerm || normalized([
      group.company?.legalName,
      group.company?.tradeName,
      name
    ].join(" ")).includes(companyTerm);
    const driversInView = group.drivers.filter((driver) => companyMatches &&
      (!nameTerm || normalized(driver.name).includes(nameTerm)) &&
      (!registrationTerm || normalized(driver.registration).includes(registrationTerm)) &&
      (!licenseTerm || normalized([driver.licenseCategory, driver.licenseNumber].join(" ")).includes(licenseTerm)) &&
      (filters.status === "all" || Boolean(driver.active) === (filters.status === "active"))
    );
    return { id, name, company: group.company, drivers: driversInView.sort((a, b) => collator.compare(String(a.name || ""), String(b.name || ""))) };
  }).filter((group) => group.drivers.length)
    .sort((a, b) => {
      if (a.id === UNASSIGNED_COMPANY_ID) return 1;
      if (b.id === UNASSIGNED_COMPANY_ID) return -1;
      return collator.compare(a.name, b.name);
    });
}

export function toggleExpandedCompany(current: ReadonlySet<string>, companyId: string) {
  const next = new Set(current);
  if (next.has(companyId)) next.delete(companyId);
  else next.add(companyId);
  return next;
}
