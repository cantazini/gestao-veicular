import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { EMPTY_DRIVER_FILTERS, hasDriverFilters, type DriverFilters, type DriverStatusFilter } from "../lib/driverGroups";

type Props = {
  value: DriverFilters;
  onChange: (filters: DriverFilters) => void;
};

export function DriverFiltersPanel({ value, onChange }: Props) {
  const active = hasDriverFilters(value);
  const update = (key: keyof DriverFilters, nextValue: string) => onChange({ ...value, [key]: nextValue });

  return <div className="driver-filter-panel" role="search" aria-label="Filtros de motoristas">
    <div className="driver-filter-heading">
      <span><SlidersHorizontal size={17}/> Filtrar motoristas</span>
      <button
        type="button"
        className="driver-filter-clear"
        disabled={!active}
        onClick={() => onChange({ ...EMPTY_DRIVER_FILTERS })}
      >
        <RotateCcw size={15}/> Limpar filtros
      </button>
    </div>
    <div className="driver-filter-grid">
      <label className="driver-filter-field">
        <span>Razão social</span>
        <input value={value.company} onChange={(event) => update("company", event.target.value)} placeholder="Buscar empresa"/>
      </label>
      <label className="driver-filter-field">
        <span>Nome do motorista</span>
        <input value={value.name} onChange={(event) => update("name", event.target.value)} placeholder="Buscar nome"/>
      </label>
      <label className="driver-filter-field">
        <span>Matrícula</span>
        <input value={value.registration} onChange={(event) => update("registration", event.target.value)} placeholder="Buscar matrícula"/>
      </label>
      <label className="driver-filter-field">
        <span>CNH</span>
        <input value={value.license} onChange={(event) => update("license", event.target.value)} placeholder="Categoria ou número"/>
      </label>
      <label className="driver-filter-field">
        <span>Status</span>
        <select value={value.status} onChange={(event) => update("status", event.target.value as DriverStatusFilter)}>
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="inactive">Inativos</option>
        </select>
      </label>
    </div>
  </div>;
}
