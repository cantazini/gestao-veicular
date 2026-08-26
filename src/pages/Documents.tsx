import { useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileCheck2, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { documentCategoryLabel, documentStatusLabel, documentTypeLabel, documentTypeOptions } from "../lib/documents";
import { uploadManagedFile, validateLocalFile } from "../lib/files";
import { formatDate } from "../lib/format";
import type { DocumentEntityType, DocumentRecord, DocumentStatus, Entity, PageResult } from "../types";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { FormModal } from "../components/FormModal";
import { useAuth } from "../auth/AuthContext";

interface Filters { entityType: "" | DocumentEntityType; clientId: string; companyId: string; documentType: string; status: "" | DocumentStatus; search: string }
const initialFilters: Filters = { entityType: "", clientId: "", companyId: "", documentType: "", status: "", search: "" };

export function Documents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const optionQueries = useQueries({ queries: ["clients", "companies"].map((name) => ({ queryKey: [name, "document-filters"], queryFn: () => api<PageResult<Entity>>(`/${name}?pageSize=100&active=true`) })) });
  const clients = optionQueries[0].data?.items || [];
  const companies = (optionQueries[1].data?.items || []).filter((company) => !filters.clientId || company.clientId === filters.clientId);
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
    return params.toString();
  }, [filters]);
  const documents = useQuery({ queryKey: ["documents", "central", queryString], queryFn: () => api<DocumentRecord[]>(`/documents${queryString ? `?${queryString}` : ""}`) });
  const canWrite = user?.role !== "inspector";
  const types = filters.entityType
    ? documentTypeOptions[filters.entityType]
    : [...new Map(Object.values(documentTypeOptions).flat().map(([value, label]) => [value, label])).entries()];
  const update = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value, ...(key === "clientId" ? { companyId: "" } : {}) } as Filters));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["documents"] });

  const remove = async (document: DocumentRecord) => {
    if (!window.confirm(`Remover o documento “${document.label}”?`)) return;
    try { setBusy(true); await api(`/files/${document.id}`, { method: "DELETE" }); await refresh(); setMessage("Documento removido."); }
    catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  };
  const replace = async (document: DocumentRecord, file?: File) => {
    if (!file) return;
    const validation = validateLocalFile(file);
    if (validation) { setMessage(validation); return; }
    try {
      setBusy(true);
      await uploadManagedFile({ kind: `${document.entityType}-document`, entityId: document.entityId, documentType: document.documentType, label: document.label, issueDate: document.issueDate, expiryDate: document.expiryDate, observation: document.observation }, file);
      await api(`/files/${document.id}`, { method: "DELETE" });
      await refresh(); setMessage("Documento substituído com sucesso.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editing) return;
    try {
      setBusy(true);
      await api(`/documents/${editing.id}`, { method: "PUT", body: JSON.stringify({ documentType: editing.documentType, label: editing.label, issueDate: editing.issueDate || null, expiryDate: editing.expiryDate || null, observation: editing.observation || "" }) });
      await refresh(); setEditing(null); setMessage("Documento atualizado.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader eyebrow="Conformidade documental" title="Central de documentos" description="Acompanhe documentos de empresas, motoristas e veículos em uma única visão."/>
    <section className="card">
      <div className="document-filter-grid">
        <label className="field"><span>Categoria</span><select value={filters.entityType} onChange={(event) => update("entityType", event.target.value)}><option value="">Todas</option><option value="company">Empresa</option><option value="driver">Motorista</option><option value="vehicle">Veículo</option></select></label>
        <label className="field"><span>Cliente</span><select value={filters.clientId} onChange={(event) => update("clientId", event.target.value)}><option value="">Todos</option>{clients.map((client) => <option value={client.id} key={client.id}>{String(client.name || client.legalName)}</option>)}</select></label>
        <label className="field"><span>Empresa</span><select value={filters.companyId} onChange={(event) => update("companyId", event.target.value)}><option value="">Todas</option>{companies.map((company) => <option value={company.id} key={company.id}>{String(company.legalName || company.name)}</option>)}</select></label>
        <label className="field"><span>Tipo</span><select value={filters.documentType} onChange={(event) => update("documentType", event.target.value)}><option value="">Todos</option>{types.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field"><span>Status</span><select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="">Todos</option><option value="VALID">Válidos</option><option value="EXPIRING">Próximos do vencimento</option><option value="EXPIRED">Vencidos</option></select></label>
      </div>
      <div className="toolbar"><label className="search"><Search size={18}/><input placeholder="Buscar documento, entidade ou identificação" value={filters.search} onChange={(event) => update("search", event.target.value)}/></label><button className="button ghost" type="button" disabled={!Object.values(filters).some(Boolean)} onClick={() => setFilters(initialFilters)}>Limpar filtros</button></div>
      {message && <div className="alert info" role="status">{message}</div>}
      {documents.isLoading ? <div className="loading">Consultando documentos…</div> : documents.isError ? <EmptyState title="Não foi possível carregar os documentos" text={documents.error instanceof Error ? documents.error.message : "Tente novamente."}/> : documents.data?.length ? <div className="table-scroll"><table><thead><tr><th>Documento</th><th>Entidade</th><th>Categoria</th><th>Cliente / empresa</th><th>Identificação</th><th>Emissão</th><th>Validade</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{documents.data.map((document) => <tr key={document.id}><td><strong>{document.label}</strong><small>{documentTypeLabel(document.entityType, document.documentType)}</small></td><td>{document.entityName}</td><td>{documentCategoryLabel[document.entityType]}</td><td>{document.clientName}<small>{document.companyName}</small></td><td>{document.entityIdentifier}</td><td>{formatDate(document.issueDate)}</td><td>{formatDate(document.expiryDate)}</td><td><span className={`document-status ${document.documentStatus.toLowerCase()}`}>{documentStatusLabel[document.documentStatus]}</span></td><td><div className="table-actions"><a className="table-action" href={document.url} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Abrir</a>{canWrite && <><button className="table-action" onClick={() => setEditing(document)}><Pencil size={16}/> Editar</button><label className="table-action"><RefreshCw size={16}/> Substituir<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => void replace(document, event.target.files?.[0])}/></label><button className="table-action danger-text" disabled={busy} onClick={() => void remove(document)}><Trash2 size={16}/> Excluir</button></>}</div></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhum documento encontrado" text="Adicione documentos durante o cadastro ou ajuste os filtros desta central."/>}
    </section>
    {editing && <FormModal eyebrow="Documento" title="Atualizar metadados" onClose={() => setEditing(null)} onSubmit={save} pending={busy}>
      <div className="form-grid">
        <label className="field"><span>Tipo</span><select value={editing.documentType} onChange={(event) => setEditing({ ...editing, documentType: event.target.value })}>{documentTypeOptions[editing.entityType].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field"><span>Nome do documento</span><input value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })}/></label>
        <label className="field"><span>Data de emissão</span><input type="date" value={String(editing.issueDate || "").slice(0,10)} onChange={(event) => setEditing({ ...editing, issueDate: event.target.value })}/></label>
        <label className="field"><span>Validade</span><input type="date" value={String(editing.expiryDate || "").slice(0,10)} onChange={(event) => setEditing({ ...editing, expiryDate: event.target.value })}/></label>
        <label className="field field-full"><span>Observação</span><textarea rows={3} value={editing.observation || ""} onChange={(event) => setEditing({ ...editing, observation: event.target.value })}/></label>
      </div>
    </FormModal>}
  </>;
}
