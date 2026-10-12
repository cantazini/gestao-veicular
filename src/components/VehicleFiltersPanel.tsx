import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { EMPTY_VEHICLE_FILTERS, hasVehicleFilters, VEHICLE_TYPES, type VehicleFilters, type VehicleStatusFilter, type VehicleTypeFilter } from "../lib/vehicleGroups";

type Props = {
  value: VehicleFilters;
  onChange: (filters: VehicleFilters) => void;
};

export function VehicleFiltersPanel({ value, onChange }: Props) {
  const active = hasVehicleFilters(value);
  const update = <Key extends keyof VehicleFilters>(key: Key, nextValue: VehicleFilters[Key]) => onChange({ ...value, [key]: nextValue });

  return <div className="driver-filter-panel vehicle-filter-panel" role="search" aria-label="Filtros de veículos">
    <div className="driver-filter-heading">
      <span><SlidersHorizontal size={17}/> Filtrar veículos</span>
      <button type="button" className="driver-filter-clear" disabled={!active} onClick={() => onChange({ ...EMPTY_VEHICLE_FILTERS })}>
        <RotateCcw size={15}/> Limpar filtros
      </button>
    </div>
    <div className="driver-filter-grid vehicle-filter-grid">
      <label className="driver-filter-field"><span>Razão social</span><input value={value.company} onChange={(event) => update("company", event.target.value)} placeholder="Buscar empresa"/></label>
      <label className="driver-filter-field"><span>Placa</span><input value={value.plate} onChange={(event) => update("plate", event.target.value)} placeholder="Buscar placa"/></label>
      <label className="driver-filter-field"><span>Marca</span><input value={value.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Buscar marca"/></label>
      <label className="driver-filter-field"><span>Modelo</span><input value={value.model} onChange={(event) => update("model", event.target.value)} placeholder="Buscar modelo"/></label>
      <label className="driver-filter-field"><span>Tipo</span><select value={value.type} onChange={(event) => update("type", event.target.value as VehicleTypeFilter)}>
        <option value="all">Todos</option>
        {VEHICLE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
      </select></label>
      <label className="driver-filter-field"><span>Status</span><select value={value.status} onChange={(event) => update("status", event.target.value as VehicleStatusFilter)}>
        <option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option>
      </select></label>
    </div>
  </div>;
}
