import { useMemo, useState } from "react";
import { Building2, Edit3, FolderOpen, GitBranch, LayoutGrid, List, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { Entity } from "../types";
import { formatCnpj } from "../lib/format";
import { companyInitials } from "../lib/driverGroups";
import { contractLabel, EMPTY_ORGANIZATION_FILTERS, filterOrganizations, organizationName, readCompanyView, saveCompanyView, type OrganizationFilters, type OrganizationKind } from "../lib/organizationDirectory";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { CompanyHierarchy } from "./CompanyHierarchy";
import "../organizations.css";

export function OrganizationLogo({ item, kind = "clients", prominent = false }: { item?: Entity; kind?: "clients" | "companies"; prominent?: boolean }) {
  const [failedSource, setFailedSource] = useState("");
  const name = String(item?.name || item?.legalName || "Sem identificação");
  const path = String(item?.logoBlobPath || "");
  const source = path && (/^(https?:|\/)/.test(path) ? path : `/api/${kind}/${item?.id}/logo`);
  return <div className={`organization-logo${prominent ? " organization-logo--prominent" : ""}`}>
    {source && failedSource !== source ? <img src={source} alt={`Logo de ${name}`} loading="lazy" onError={() => setFailedSource(source)}/> : <span aria-label={`Sem logo: ${name}`}>{companyInitials(name)}</span>}
  </div>;
}

export function OrganizationCards({ kind, items, clients, canWrite, onEdit }: { kind: OrganizationKind; items: Entity[]; clients: Map<string, Entity>; canWrite: boolean; onEdit: (item: Entity) => void }) {
  return <div className={`organization-grid organization-grid--${kind}`}>{items.map((item) => {
    const client = clients.get(String(item.clientId));
    return <article className={`organization-card organization-card--${kind}`} key={item.id}>
      {kind === "clients" ? <OrganizationLogo item={item} prominent/> : <header className="organization-card-header"><span className="organization-symbol">{kind === "projects" ? <FolderOpen size={26}/> : <Building2 size={24}/>}</span><OrganizationLogo item={kind === "companies" ? item : client} kind={kind === "companies" ? "companies" : "clients"}/></header>}
      <div className="organization-card-body">
        {kind === "projects" && <span className="organization-code">Código {String(item.code || "—")}</span>}
        <h3>{String(kind === "companies" ? item.legalName : item.name)}</h3>
        {kind === "clients" && <p className="organization-legal-name">{String(item.legalName || "—")}</p>}
        {kind !== "projects" && <p className="organization-document">{formatCnpj(item.document)}</p>}
        {kind !== "clients" && <dl className="organization-metadata"><div><dt>Cliente</dt><dd>{organizationName(client)}</dd></div>{kind === "companies" && <><div><dt>Unidade</dt><dd>{String(item.unit || "Não informada")}</dd></div><div><dt>Contrato</dt><dd>{contractLabel(item.contractType)}</dd></div></>}</dl>}
      </div>
      <footer><StatusBadge value={item.active === true}/>{canWrite && <button type="button" className="table-action" onClick={() => onEdit(item)} aria-label={`Editar ${String(item.name || item.legalName)}`}><Edit3 size={15}/> Editar</button>}</footer>
    </article>;
  })}</div>;
}

export function CompanyList({ items, clients, canWrite, onEdit }: { items: Entity[]; clients: Map<string, Entity>; canWrite: boolean; onEdit: (item: Entity) => void }) {
  return <div className="table-scroll organization-table" tabIndex={0} role="region" aria-label="Lista de empresas"><table><thead><tr>{["Razão social", "CNPJ", "Cliente", "Unidade", "Contrato", "Status"].map((label) => <th key={label}>{label}</th>)}{canWrite && <th>Ações</th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}>
    <td><div className="organization-table-identity"><OrganizationLogo item={item} kind="companies"/><strong>{String(item.legalName)}</strong></div></td>
    <td>{formatCnpj(item.document)}</td><td>{organizationName(clients.get(String(item.clientId)))}</td><td>{String(item.unit || "—")}</td><td>{contractLabel(item.contractType)}</td><td><StatusBadge value={item.active === true}/></td>
    {canWrite && <td><button className="table-action" onClick={() => onEdit(item)} aria-label={`Editar ${item.legalName}`}><Edit3 size={15}/> Editar</button></td>}
  </tr>)}</tbody></table></div>;
}

const titles = { clients: "clientes", projects: "projetos", companies: "empresas" };
export function OrganizationDirectory({ kind, items, clients: clientItems, canWrite, onEdit }: { kind: OrganizationKind; items: Entity[]; clients: Entity[]; canWrite: boolean; onEdit: (item: Entity) => void }) {
  const [filters, setFilters] = useState<OrganizationFilters>({ ...EMPTY_ORGANIZATION_FILTERS });
  const [sort, setSort] = useState("name-asc");
  const [view, setView] = useState<"cards" | "list">(() => {
    try { return readCompanyView(window.localStorage); } catch { return "cards"; }
  });
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const clients = useMemo(() => new Map(clientItems.map((item) => [item.id, item])), [clientItems]);
  const orderedClients = useMemo(() => [...clientItems].sort((a, b) => organizationName(a).localeCompare(organizationName(b), "pt-BR")), [clientItems]);
  const visible = useMemo(() => filterOrganizations(items, kind, filters, sort, clients), [items, kind, filters, sort, clients]);
  const update = (key: keyof OrganizationFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const hasFilters = Object.keys(filters).some((key) => filters[key as keyof OrganizationFilters] !== EMPTY_ORGANIZATION_FILTERS[key as keyof OrganizationFilters]);
  const textField = (key: keyof OrganizationFilters, label: string, placeholder: string) => <label className="driver-filter-field"><span>{label}</span><input value={filters[key]} onChange={(event) => update(key, event.target.value)} placeholder={placeholder}/></label>;
  return <div className="organization-directory">
    <div className="driver-filter-panel" role="search" aria-label={`Filtros de ${titles[kind]}`}>
      <div className="driver-filter-heading"><span><SlidersHorizontal size={17}/> Filtrar {titles[kind]}</span><button className="driver-filter-clear" disabled={!hasFilters} onClick={() => setFilters({ ...EMPTY_ORGANIZATION_FILTERS })}><RotateCcw size={15}/> Limpar filtros</button></div>
      <div className="driver-filter-grid">
        {kind === "clients" ? textField("search", "Buscar cliente", "Nome fantasia, razão social ou CNPJ") : <>
          {textField("name", kind === "companies" ? "Razão social" : "Projeto", kind === "companies" ? "Buscar empresa" : "Buscar projeto")}
          {kind === "companies" ? textField("document", "CNPJ", "Com ou sem pontuação") : textField("code", "Código", "Buscar código")}
          <label className="driver-filter-field"><span>Cliente</span><select value={filters.clientId} onChange={(event) => update("clientId", event.target.value)}><option value="">Todos os clientes</option>{orderedClients.map((client) => <option key={client.id} value={client.id}>{organizationName(client)}{client.active !== true ? " (inativo)" : ""}</option>)}</select></label>
          {kind === "companies" && <>{textField("unit", "Unidade", "Buscar unidade")}<label className="driver-filter-field"><span>Tipo de contrato</span><select value={filters.contractType} onChange={(event) => update("contractType", event.target.value)}><option value="">Todos os contratos</option><option value="direct">Direto</option><option value="subcontractor">Subcontratado</option></select></label></>}
        </>}
        <label className="driver-filter-field"><span>Status</span><select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
      </div>
    </div>
    <div className="organization-toolbar">
      <span className="organization-result-count" role="status">{visible.length} de {items.length} {titles[kind]}</span>
      <label className="organization-sort"><span>Ordenar por</span><select value={sort} onChange={(event) => setSort(event.target.value)}>
        <option value="name-asc">{kind === "companies" ? "Razão social" : kind === "projects" ? "Projeto" : "Nome"} A → Z</option><option value="name-desc">{kind === "companies" ? "Razão social" : kind === "projects" ? "Projeto" : "Nome"} Z → A</option>
        {kind === "projects" && <><option value="code-asc">Código crescente</option><option value="code-desc">Código decrescente</option></>}{kind === "companies" && <option value="client">Cliente A → Z</option>}
      </select></label>
      {kind === "companies" && <><div className="organization-view" role="group" aria-label="Visualização de empresas">{(["cards", "list"] as const).map((mode) => <button key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); try { saveCompanyView(mode, window.localStorage); } catch { /* Private browsing. */ } }}>{mode === "cards" ? <LayoutGrid size={16}/> : <List size={16}/>} {mode === "cards" ? "Cards" : "Lista"}</button>)}</div><button className="button secondary" onClick={() => setHierarchyOpen(true)}><GitBranch size={17}/> Ver hierarquia</button></>}
    </div>
    {visible.length ? kind === "companies" && view === "list" ? <CompanyList items={visible} clients={clients} canWrite={canWrite} onEdit={onEdit}/> : <OrganizationCards kind={kind} items={visible} clients={clients} canWrite={canWrite} onEdit={onEdit}/> : <EmptyState title="Nenhum registro encontrado" text={hasFilters ? "Ajuste ou limpe os filtros para encontrar outros registros." : "Os cadastros aparecerão aqui assim que forem adicionados."}/>}
    {hierarchyOpen && <CompanyHierarchy companies={items} clients={clients} onClose={() => setHierarchyOpen(false)}/>}
  </div>;
}
