import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FilePlus2, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { documentStatusLabel, documentTypeLabel, documentTypeOptions, normalizeDocumentDates, validateDocumentDates } from "../lib/documents";
import { uploadManagedFile, validateLocalFile } from "../lib/files";
import { formatDate } from "../lib/format";
import type { DocumentEntityType, DocumentRecord } from "../types";

export interface PendingDocument {
  localId: string;
  file: File;
  documentType: string;
  label: string;
  issueDate: string;
  expiryDate: string;
  observation: string;
}

interface Props {
  entityType: DocumentEntityType;
  entityId?: string;
  pending: PendingDocument[];
  onPendingChange: (documents: PendingDocument[]) => void;
  canWrite: boolean;
}

const blankDraft = (entityType: DocumentEntityType) => ({ documentType: documentTypeOptions[entityType][0][0], label: "", issueDate: "", expiryDate: "", observation: "" });

export function EntityDocumentsPanel({ entityType, entityId, pending, onPendingChange, canWrite }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => blankDraft(entityType));
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const documents = useQuery({
    queryKey: ["documents", entityType, entityId],
    queryFn: () => api<DocumentRecord[]>(`/documents?entityType=${entityType}&entityId=${entityId}`),
    enabled: Boolean(entityId)
  });

  const addPending = () => {
    if (!file) { setMessage("Selecione um arquivo para adicionar."); return; }
    const validation = validateLocalFile(file);
    if (validation) { setMessage(validation); return; }
    const dateError = validateDocumentDates(draft);
    if (dateError) { setMessage(dateError); return; }
    onPendingChange([...pending, { localId: crypto.randomUUID(), file, ...draft, label: draft.label || file.name }]);
    setFile(null); setDraft(blankDraft(entityType)); setMessage("");
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["documents"] });
  const removeExisting = async (document: DocumentRecord) => {
    if (!window.confirm(`Remover o documento “${document.label}”?`)) return;
    try { setBusyId(document.id); await api(`/files/${document.id}`, { method: "DELETE" }); await refresh(); }
    catch (reason) { setMessage((reason as Error).message); }
    finally { setBusyId(""); }
  };
  const replaceExisting = async (document: DocumentRecord, replacement?: File) => {
    if (!replacement) return;
    const validation = validateLocalFile(replacement);
    if (validation) { setMessage(validation); return; }
    try {
      setBusyId(document.id);
      await uploadManagedFile({ kind: `${entityType}-document`, entityId: document.entityId, documentType: document.documentType, label: document.label, issueDate: document.issueDate, expiryDate: document.expiryDate, observation: document.observation }, replacement);
      await api(`/files/${document.id}`, { method: "DELETE" });
      await refresh(); setMessage("Documento substituído com sucesso.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusyId(""); }
  };
  const saveMetadata = async () => {
    if (!editing) return;
    const dateError = validateDocumentDates(editing);
    if (dateError) { setMessage(dateError); return; }
    try {
      setBusyId(editing.id);
      await api(`/documents/${editing.id}`, { method: "PUT", body: JSON.stringify({
        documentType: editing.documentType, label: editing.label, ...normalizeDocumentDates(editing, "null"),
        observation: editing.observation || ""
      }) });
      await refresh(); setEditing(null); setMessage("Dados do documento atualizados.");
    } catch (reason) { setMessage((reason as Error).message); }
    finally { setBusyId(""); }
  };

  return <section className="form-attachment-section field-full">
    <div className="form-section-title"><span>Documentos</span></div>
    <p className="attachment-intro">Anexe os documentos agora. Em um novo cadastro, os arquivos serão enviados logo após os dados principais serem salvos.</p>
    {canWrite && <div className="document-draft-grid">
      <label className="field"><span>Tipo</span><select value={draft.documentType} onChange={(event) => setDraft({ ...draft, documentType: event.target.value })}>{documentTypeOptions[entityType].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field"><span>Data de emissão</span><input type="date" value={draft.issueDate} onChange={(event) => setDraft({ ...draft, issueDate: event.target.value })}/></label>
      <label className="field"><span>Validade</span><input type="date" value={draft.expiryDate} onChange={(event) => setDraft({ ...draft, expiryDate: event.target.value })}/></label>
      <label className="field field-full"><span>Observação</span><input value={draft.observation} maxLength={500} onChange={(event) => setDraft({ ...draft, observation: event.target.value })} placeholder="Informação complementar, se necessária"/></label>
      <div className="document-file-picker field-full"><label className="button ghost"><FilePlus2 size={17}/>{file?.name || "Escolher PDF ou imagem"}<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => { const selected = event.target.files?.[0] || null; setFile(selected); if (selected) setDraft({ ...draft, label: selected.name }); }}/></label><button type="button" className="button secondary" disabled={!file} onClick={addPending}>Adicionar documento</button></div>
    </div>}
    {pending.length > 0 && <div className="pending-document-list">{pending.map((document) => <article key={document.localId}><FilePlus2/><div><strong>{document.label}</strong><span>{documentTypeLabel(entityType, document.documentType)} · aguardando salvamento</span></div><button type="button" className="icon-button danger" aria-label={`Remover ${document.label}`} onClick={() => onPendingChange(pending.filter((item) => item.localId !== document.localId))}><Trash2 size={16}/></button></article>)}</div>}
    {message && <div className="alert info" role="status">{message}</div>}
    {entityId && (documents.isLoading ? <div className="compact-loading">Carregando documentos…</div> : documents.data?.length ? <div className="entity-document-list">{documents.data.map((document) => <article key={document.id}>
      {editing?.id === document.id ? <div className="document-inline-editor">
        <label className="field"><span>Tipo</span><select value={editing.documentType} onChange={(event) => setEditing({ ...editing, documentType: event.target.value })}>{documentTypeOptions[entityType].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field"><span>Nome</span><input value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })}/></label>
        <label className="field"><span>Emissão</span><input type="date" value={String(editing.issueDate || "").slice(0, 10)} onChange={(event) => setEditing({ ...editing, issueDate: event.target.value })}/></label>
        <label className="field"><span>Validade</span><input type="date" value={String(editing.expiryDate || "").slice(0, 10)} onChange={(event) => setEditing({ ...editing, expiryDate: event.target.value })}/></label>
        <label className="field field-full"><span>Observação</span><input value={editing.observation || ""} onChange={(event) => setEditing({ ...editing, observation: event.target.value })}/></label>
        <div className="inline-actions field-full"><button type="button" className="button ghost" onClick={() => setEditing(null)}>Cancelar</button><button type="button" className="button primary" disabled={busyId === document.id} onClick={() => void saveMetadata()}><Save size={16}/> Salvar documento</button></div>
      </div> : <>
        <div className="document-main"><strong>{document.label}</strong><span>{documentTypeLabel(entityType, document.documentType)} · {document.fileName}</span>{document.observation && <small>{document.observation}</small>}</div>
        <div className="document-dates"><span>Emissão: {formatDate(document.issueDate)}</span><span>Validade: {formatDate(document.expiryDate)}</span></div>
        <span className={`document-status ${document.documentStatus.toLowerCase()}`}>{documentStatusLabel[document.documentStatus]}</span>
        <div className="inline-actions"><a className="icon-button" href={document.url} target="_blank" rel="noreferrer" aria-label={`Abrir ${document.label}`}><ExternalLink size={16}/></a>{canWrite && <><button type="button" className="icon-button" aria-label={`Editar ${document.label}`} onClick={() => setEditing(document)}><Pencil size={16}/></button><label className="icon-button" aria-label={`Substituir ${document.label}`}><RefreshCw size={16}/><input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={(event) => void replaceExisting(document, event.target.files?.[0])}/></label><button type="button" className="icon-button danger" disabled={busyId === document.id} aria-label={`Remover ${document.label}`} onClick={() => void removeExisting(document)}><Trash2 size={16}/></button></>}</div>
      </>}
    </article>)}</div> : <p className="attachment-empty">Nenhum documento cadastrado para este registro.</p>)}
  </section>;
}
