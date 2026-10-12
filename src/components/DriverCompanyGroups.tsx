import { useMemo, useState } from "react";
import { ChevronDown, Edit3, UserRound } from "lucide-react";
import { formatDate, text } from "../lib/format";
import { companyInitials, driverCountLabel, groupDriversByCompany, hasDriverFilters, toggleExpandedCompany, type DriverFilters } from "../lib/driverGroups";
import type { Entity } from "../types";
import { EmptyState } from "./EmptyState";
import { StatusBadge } from "./StatusBadge";

type Props = {
  drivers: Entity[];
  companies: Entity[];
  filters: DriverFilters;
  canWrite: boolean;
  onEdit: (driver: Entity) => void;
};

function CompanyBrand({ company, name }: { company?: Entity; name: string }) {
  const logo = String(company?.logoBlobPath || "");
  return <span className="driver-company-brand" aria-label={logo ? `Logo ${name}` : `Identificação ${name}`}>
    <span aria-hidden="true">{companyInitials(name)}</span>
    {logo && <img
      src={logo}
      alt={`Logo ${name}`}
      onError={(event) => { event.currentTarget.hidden = true; }}
    />}
  </span>;
}

export function DriverCompanyGroups({ drivers, companies, filters, canWrite, onEdit }: Props) {
  const groups = useMemo(() => groupDriversByCompany(drivers, companies, filters), [drivers, companies, filters]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const filtering = hasDriverFilters(filters);

  if (!groups.length) return <EmptyState title="Nenhum motorista encontrado com os filtros selecionados." text="Revise os filtros ou limpe a seleção para visualizar outros motoristas."/>;

  return <div className="driver-company-grid">
    {groups.map((group) => {
      const open = filtering || expanded.has(group.id);
      const contentId = `driver-company-${group.id}`;
      return <article className={`driver-company-card${open ? " is-expanded" : ""}`} key={group.id}>
        <button
          type="button"
          className="driver-company-toggle"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => {
            if (!filtering) setExpanded((current) => toggleExpandedCompany(current, group.id));
          }}
        >
          <span className="driver-company-icon" aria-hidden="true"><UserRound/></span>
          <span className="driver-company-copy"><strong>{group.name}</strong><span>{driverCountLabel(group.drivers.length)}</span></span>
          <CompanyBrand company={group.company} name={group.name}/>
          <ChevronDown className="driver-company-chevron" aria-hidden="true"/>
        </button>
        <div id={contentId} className="driver-company-collapse" aria-hidden={!open} inert={!open}>
          <div>
            <div className="driver-mini-grid">
              {group.drivers.map((driver) => <article className="driver-mini-card" key={driver.id}>
                <header><span aria-hidden="true"><UserRound/></span><strong>{text(driver.name)}</strong></header>
                <dl>
                  <div><dt>Matrícula</dt><dd>{text(driver.registration)}</dd></div>
                  <div><dt>CNH</dt><dd>{text(driver.licenseCategory)}</dd></div>
                  <div><dt>Validade</dt><dd>{formatDate(driver.licenseExpiry)}</dd></div>
                </dl>
                <footer><StatusBadge value={Boolean(driver.active)}/>{canWrite && <button type="button" className="table-action" onClick={() => onEdit(driver)}><Edit3/> Editar</button>}</footer>
              </article>)}
            </div>
          </div>
        </div>
      </article>;
    })}
  </div>;
}
