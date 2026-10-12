import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FilterX, Plus, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { FormModal } from "../components/FormModal";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { isLinkedToCompany } from "../lib/companyLinks";
import { formatDate } from "../lib/format";
import { buildInspectionSearch, emptyInspectionFilters, hasInspectionFilters, type InspectionFilters } from "../lib/inspectionFilters";
import type { Entity, Inspection, PageResult } from "../types";

const optionNames = ["clients", "companies", "projects", "vehicles", "drivers"] as const;
const entityLabel = (item: Entity) => String(item.name || item.legalName || item.plate || item.code || item.id);
export const inspectionTableColumns = ["Data", "Código", "Sequência", "Empresa", "Projeto", "Motorista", "Veículo", "Conformidade", "Resultado", "Ações"] as const;
export const canDeleteInspections = (role: string | undefined) => role === "admin";

export function Inspections({ rejectedOnly = false }: { rejectedOnly?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<InspectionFilters>(() => emptyInspectionFilters());
  const [selectedForDeletion, setSelectedForDeletion] = useState<Inspection | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const search = buildInspectionSearch(filters, rejectedOnly);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["inspections", rejectedOnly ? "rejected" : "history", search],
    queryFn: () => api<PageResult<Inspection>>(`/inspections?${search}`)
  });
  const optionQueries = useQueries({ queries: optionNames.map((name) => ({
    queryKey: [name, "inspection-filters"],
    queryFn: () => api<PageResult<Entity>>(`/${name}?pageSize=100&active=true`)
  })) });
  const [clients, companies, projects, vehicles, drivers] = optionQueries.map((query) => query.data?.items || []);
  const selectedCompany = companies.find((item) => item.id === filters.companyId);
  const availableCompanies = companies.filter((item) => !filters.clientId || item.clientId === filters.clientId);
  const availableProjects = projects.filter((item) => {
    if (filters.companyId) return Array.isArray(selectedCompany?.projectIds) && selectedCompany.projectIds.includes(item.id);
    return !filters.clientId || item.clientId === filters.clientId;
  });
  const availableVehicles = vehicles.filter((item) => (!filters.companyId || isLinkedToCompany(item, filters.companyId)) && (!filters.projectId || item.projectId === filters.projectId));
  const availableDrivers = drivers.filter((item) => !filters.companyId || isLinkedToCompany(item, filters.companyId));
  const rows = useMemo(() => data?.items || [], [data]);
  const deletion = useMutation({
    mutationFn: ({ id }: { id: string }) => api<{ id: string; code: string; purged: true; pendingStoragePaths?: string[] }>(`/inspections/${id}`, { method: "DELETE" }),
    onSuccess: async (result, variables) => {
      setSelectedForDeletion(null);
      setSuccessMessage(result?.pendingStoragePaths?.length
        ? `Vistoria ${result.code} excluída definitivamente. ${result.pendingStoragePaths.length} arquivo(s) de foto não puderam ser removidos do armazenamento; informe o administrador do sistema.`
        : `Vistoria${result?.code ? ` ${result.code}` : ""} excluída definitivamente.`);
      queryClient.removeQueries({ queryKey: ["inspection", variables.id], exact: true });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inspections"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["credentials"] })
      ]);
    }
  });

  const update = (key: keyof InspectionFilters, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "clientId") Object.assign(next, { companyId: "", projectId: "", vehicleId: "", driverId: "" });
      if (key === "companyId") Object.assign(next, { projectId: "", vehicleId: "", driverId: "" });
      if (key === "projectId") next.vehicleId = "";
      return next;
    });
  };

  const openDeletion = (inspection: Inspection) => {
    deletion.reset(); setSuccessMessage(""); setSelectedForDeletion(inspection);
  };
  const closeDeletion = () => {
    if (!deletion.isPending) { deletion.reset(); setSelectedForDeletion(null); }
  };
  const confirmDelete = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedForDeletion) return;
    deletion.mutate({ id: selectedForDeletion.id });
  };

  return <>
    <PageHeader eyebrow="Vistorias" title={rejectedOnly ? "Reprovações" : "Histórico de vistorias"} description={rejectedOnly ? "Somente vistorias persistidas como reprovadas, prontas para tratamento." : "Consulte, filtre e abra o relatório completo de cada vistoria."} actions={<Link className="button primary" to="/vistorias/nova"><Plus size={18}/> Nova vistoria</Link>}/>
    {successMessage && <div className="alert success" role="status">{successMessage}</div>}
    <section className="card">
      <div className="inspection-filter-grid">
        <label className="field"><span>Data inicial</span><input type="date" value={filters.startDate} onChange={(event) => update("startDate", event.target.value)}/></label>
        <label className="field"><span>Data final</span><input type="date" value={filters.endDate} onChange={(event) => update("endDate", event.target.value)}/></label>
        <label className="field"><span>Cliente</span><select value={filters.clientId} onChange={(event) => update("clientId", event.target.value)}><option value="">Todos os clientes</option>{clients.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}</select></label>
        <label className="field"><span>Empresa</span><select value={filters.companyId} onChange={(event) => update("companyId", event.target.value)}><option value="">Todas as empresas</option>{availableCompanies.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}</select></label>
        <label className="field"><span>Projeto</span><select value={filters.projectId} onChange={(event) => update("projectId", event.target.value)}><option value="">Todos os projetos</option>{availableProjects.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}</select></label>
        <label className="field"><span>Veículo</span><select value={filters.vehicleId} onChange={(event) => update("vehicleId", event.target.value)}><option value="">Todos os veículos</option>{availableVehicles.map((item) => <option key={item.id} value={item.id}>{item.plate} · {item.brand} {item.model}</option>)}</select></label>
        <label className="field"><span>Motorista</span><select value={filters.driverId} onChange={(event) => update("driverId", event.target.value)}><option value="">Todos os motoristas</option>{availableDrivers.map((item) => <option key={item.id} value={item.id}>{entityLabel(item)}</option>)}</select></label>
        {!rejectedOnly && <label className="field"><span>Resultado</span><select value={filters.result} onChange={(event) => update("result", event.target.value)}><option value="">Todos os resultados</option><option value="APROVADO">Aprovado</option><option value="REPROVADO">Reprovado</option></select></label>}
      </div>
      <div className="toolbar inspection-filter-actions">
        <label className="search"><Search size={18}/><input value={filters.plate} onChange={(event) => update("plate", event.target.value.toUpperCase())} placeholder="Filtrar por placa" aria-label="Filtrar por placa"/></label>
        <button className="button ghost" type="button" disabled={!hasInspectionFilters(filters, rejectedOnly)} onClick={() => setFilters(emptyInspectionFilters())}><FilterX size={17}/> Limpar filtros</button>
      </div>
      {isLoading
        ? <div className="loading">Carregando vistorias…</div>
        : isError
          ? <EmptyState title="Não foi possível carregar as vistorias" text={error instanceof Error ? error.message : "Tente novamente em alguns instantes."} action={<button className="button secondary" onClick={() => void refetch()}>Tentar novamente</button>}/>
          : rows.length
            ? <div className="table-scroll"><table><thead><tr>{inspectionTableColumns.map((label) => <th key={label}>{label === "Ações" ? <span className="sr-only">{label}</span> : label}</th>)}</tr></thead><tbody>{rows.map((inspection) => <tr key={inspection.id}><td>{formatDate(inspection.inspectionDate)}<small>{inspection.inspectionTime}</small></td><td><strong>{inspection.code}</strong></td><td><strong>{inspection.sequence}ª vistoria</strong></td><td>{inspection.companyName}</td><td>{inspection.projectName}</td><td>{inspection.driverName}</td><td><span className="plate">{inspection.plate}</span></td><td><strong>{inspection.compliancePercentage}%</strong></td><td><StatusBadge value={inspection.result}/></td><td><div className="table-actions"><Link className="table-action" to={`/vistorias/${inspection.id}`}><Eye size={17}/> Relatório</Link>{canDeleteInspections(user?.role) && <button className="table-action danger-text" type="button" title="Excluir vistoria" aria-label={`Excluir vistoria ${inspection.code}`} onClick={() => openDeletion(inspection)}><Trash2 size={16}/> Excluir</button>}</div></td></tr>)}</tbody></table></div>
            : <EmptyState title={rejectedOnly ? "Nenhuma reprovação encontrada" : "Nenhuma vistoria encontrada"} text={hasInspectionFilters(filters, rejectedOnly) ? "Revise os filtros para encontrar outros registros." : rejectedOnly ? "As vistorias aprovadas não aparecem nesta área." : "As vistorias realizadas aparecerão aqui."}/>}
    </section>
    {selectedForDeletion && <FormModal eyebrow="Exclusão definitiva" title="Excluir vistoria?" onClose={closeDeletion} onSubmit={confirmDelete} pending={deletion.isPending} submitLabel="Excluir definitivamente" pendingLabel="Excluindo…" submitTone="danger" feedback={deletion.isError ? <div className="alert error" role="alert">{deletion.error instanceof Error ? deletion.error.message : "Não foi possível excluir a vistoria. Tente novamente."}</div> : undefined}>
      <p className="inspection-delete-warning"><strong>Esta ação é definitiva e não pode ser desfeita.</strong> Serão removidas a vistoria, suas fotos e as aprovações e credenciais vinculadas a ela. Um registro mínimo da operação fica na auditoria.</p>
      <div className="inspection-delete-summary">
        <div><span>Código</span><strong>{selectedForDeletion.code}</strong></div>
        <div><span>Veículo</span><strong>{selectedForDeletion.plate || "—"}</strong></div>
        <div><span>Empresa</span><strong>{selectedForDeletion.companyName || "—"}</strong></div>
        <div><span>Data</span><strong>{formatDate(selectedForDeletion.inspectionDate)}</strong></div>
        <div><span>Sequência</span><strong>{selectedForDeletion.sequence ? `${selectedForDeletion.sequence}ª vistoria` : "—"}</strong></div>
      </div>
    </FormModal>}
  </>;
}
