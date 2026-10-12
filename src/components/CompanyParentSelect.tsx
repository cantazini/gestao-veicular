import { useState } from "react";
import type { Entity } from "../types";
import { normalizeSearch } from "../lib/organizationDirectory";

export function CompanyParentSelect({ id, value, options, disabled, onChange }: { id: string; value: string; options: Entity[]; disabled: boolean; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const visible = options.filter((item) => item.id === value || normalizeSearch(`${item.legalName} ${item.tradeName || ""}`).includes(normalizeSearch(search)));
  return <div className="company-parent-select"><input type="search" aria-label="Buscar empresa contratante" value={search} disabled={disabled} placeholder="Filtrar empresas por nome" onChange={(event) => setSearch(event.target.value)}/><select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Hierarquia não informada</option>{visible.map((item) => <option key={item.id} value={item.id}>{String(item.legalName)}{item.active !== true ? " (inativa)" : ""}</option>)}</select><small className="field-help">{visible.length} empresa(s) disponível(is). A seleção usa o identificador do cadastro.</small></div>;
}
