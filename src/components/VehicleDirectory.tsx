import { useMemo, useState, type ComponentType } from "react";
import { Bike, Building2, Bus, BusFront, CarFront, ChevronDown, Edit3, Shapes, Van } from "lucide-react";
import { companyInitials } from "../lib/driverGroups";
import { formatVehicleMileage, groupVehiclesByTypeAndCompany, hasVehicleFilters, vehicleCountLabel, type VehicleCategoryGroup, type VehicleCategoryGroupId, type VehicleCompanyGroup, type VehicleFilters } from "../lib/vehicleGroups";
import type { Entity } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

type Props = {
  vehicles: Entity[];
  companies: Entity[];
  filters: VehicleFilters;
  canWrite: boolean;
  onEdit: (vehicle: Entity) => void;
};

type IconComponent = ComponentType<{ "aria-hidden"?: boolean }>;

const categoryIcons: Record<VehicleCategoryGroupId, IconComponent> = {
  light_vehicle: CarFront,
  microbus: BusFront,
  motorcycle: Bike,
  bus: Bus,
  van: Van,
  legacy: Shapes
};

function CategoryIcon({ id }: { id: VehicleCategoryGroupId }) {
  const Icon = categoryIcons[id];
  return <Icon aria-hidden={true}/>;
}

function CompanyBrand({ company, name }: { company?: Entity; name: string }) {
  const logo = String(company?.logoBlobPath || "");
  return <span className="vehicle-company-brand" aria-label={logo ? `Logo ${name}` : `Identificação ${name}`}>
    <span aria-hidden="true">{companyInitials(name)}</span>
    {logo && <img
      src={logo}
      alt={`Logo ${name}`}
      onError={(event) => { event.currentTarget.hidden = true; }}
    />}
  </span>;
}

function VehicleCard({ vehicle, categoryId, canWrite, onEdit }: { vehicle: Entity; categoryId: VehicleCategoryGroupId; canWrite: boolean; onEdit: (vehicle: Entity) => void }) {
  const cover = String(vehicle.coverBlobPath || "");
  return <article className="vehicle-card">
    <div className="vehicle-card-media">
      <div className="vehicle-card-placeholder"><CategoryIcon id={categoryId}/></div>
      {cover && <img
        src={cover}
        alt={`Foto do veículo ${String(vehicle.plate || "")}`}
        onError={(event) => { event.currentTarget.hidden = true; }}
      />}
    </div>
    <div className="vehicle-card-body">
      <header><span className="plate">{String(vehicle.plate || "—")}</span><StatusBadge value={Boolean(vehicle.active)}/></header>
      <div className="vehicle-card-model"><strong>{String(vehicle.brand || "—")} {String(vehicle.model || "")}</strong><span>{String(vehicle.year || "—")}</span></div>
      <footer><strong>{formatVehicleMileage(vehicle.mileage)}</strong>{canWrite && <button type="button" className="table-action" onClick={() => onEdit(vehicle)}><Edit3/> Editar</button>}</footer>
    </div>
  </article>;
}

function CompanyCard({ group, category, open, onToggle, canWrite, onEdit }: { group: VehicleCompanyGroup; category: VehicleCategoryGroup; open: boolean; onToggle: () => void; canWrite: boolean; onEdit: (vehicle: Entity) => void }) {
  const contentId = `vehicle-company-${category.id}-${group.id}`;
  return <article className={`vehicle-company-card${open ? " is-expanded" : ""}`}>
    <button type="button" className="vehicle-company-toggle" aria-expanded={open} aria-controls={contentId} onClick={onToggle}>
      <span className="vehicle-company-icon" aria-hidden="true"><Building2/></span>
      <span className="vehicle-company-copy"><strong>{group.name}</strong><span>{vehicleCountLabel(group.vehicles.length)}</span></span>
      <CompanyBrand company={group.company} name={group.name}/>
      <ChevronDown className="vehicle-company-chevron" aria-hidden="true"/>
    </button>
    <div id={contentId} className="vehicle-company-collapse" aria-hidden={!open} inert={!open}>
      <div><div className="vehicle-card-grid">
        {group.vehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} categoryId={category.id} canWrite={canWrite} onEdit={onEdit}/>)}
      </div></div>
    </div>
  </article>;
}

export function VehicleDirectory({ vehicles, companies, filters, canWrite, onEdit }: Props) {
  const groups = useMemo(() => groupVehiclesByTypeAndCompany(vehicles, companies, filters), [vehicles, companies, filters]);
  const filtering = hasVehicleFilters(filters);
  const [manualCategory, setManualCategory] = useState<VehicleCategoryGroupId | null>(null);
  const [manualCompany, setManualCompany] = useState<string | null>(null);
  const [filteredCategory, setFilteredCategory] = useState<VehicleCategoryGroupId | null>(null);
  const [filteredCompany, setFilteredCompany] = useState<string | null>(null);
  const nonEmpty = groups.filter((group) => group.count > 0);
  const requestedCategory = filtering ? (nonEmpty.length === 1 ? nonEmpty[0].id : filteredCategory) : manualCategory;
  const openCategory = groups.some((group) => group.id === requestedCategory && group.count > 0) ? requestedCategory : null;
  const selectedGroup = groups.find((group) => group.id === openCategory);
  const requestedCompany = filtering ? (selectedGroup?.companies.length === 1 ? selectedGroup.companies[0].id : filteredCompany) : manualCompany;
  const openCompany = selectedGroup?.companies.some((group) => group.id === requestedCompany) ? requestedCompany : null;
  const filteredCount = groups.reduce((sum, group) => sum + group.count, 0);

  const toggleCategory = (group: VehicleCategoryGroup) => {
    if (!group.count) return;
    if (filtering) {
      setFilteredCategory((current) => current === group.id ? null : group.id);
      setFilteredCompany(null);
    } else {
      setManualCategory((current) => current === group.id ? null : group.id);
      setManualCompany(null);
    }
  };

  const toggleCompany = (companyId: string) => {
    if (filtering) setFilteredCompany((current) => current === companyId ? null : companyId);
    else setManualCompany((current) => current === companyId ? null : companyId);
  };

  return <div className="vehicle-directory">
    <div className="vehicle-category-grid">
      {groups.map((group) => <button
        type="button"
        key={group.id}
        className={`vehicle-category-card vehicle-category-card--${group.id}${openCategory === group.id ? " is-expanded" : ""}`}
        disabled={!group.count}
        aria-expanded={openCategory === group.id}
        aria-controls={`vehicle-category-${group.id}`}
        onClick={() => toggleCategory(group)}
      >
        <span className="vehicle-category-icon"><CategoryIcon id={group.id}/></span>
        <span className="vehicle-category-copy"><strong>{group.label}</strong><span>{vehicleCountLabel(group.count)}</span></span>
        <ChevronDown className="vehicle-category-chevron" aria-hidden="true"/>
      </button>)}
    </div>

    {selectedGroup && <section id={`vehicle-category-${selectedGroup.id}`} className="vehicle-category-content" aria-label={selectedGroup.label}>
      <header><div><span>Categoria selecionada</span><h2>{selectedGroup.label}</h2></div><strong>{vehicleCountLabel(selectedGroup.count)}</strong></header>
      <div className="vehicle-company-grid">
        {selectedGroup.companies.map((group) => <CompanyCard key={group.id} group={group} category={selectedGroup} open={openCompany === group.id} onToggle={() => toggleCompany(group.id)} canWrite={canWrite} onEdit={onEdit}/>)}
      </div>
    </section>}

    {!filteredCount && <EmptyState
      title={filtering ? "Nenhum veículo encontrado com os filtros selecionados." : "Nenhum veículo cadastrado."}
      text={filtering ? "Revise os filtros ou limpe a seleção para visualizar outros veículos." : "As cinco categorias oficiais permanecerão disponíveis para novos cadastros."}
    />}
  </div>;
}
