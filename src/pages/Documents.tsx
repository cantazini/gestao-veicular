import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileCheck2, Search, Upload } from "lucide-react";
import { api, mockMode } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Entity, PageResult } from "../types";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { useAuth } from "../auth/AuthContext";

interface Document { id: string; documentType: string; label: string; fileName: string; expiryDate?: string; url: string }

export function Documents() {
  const { user } = useAuth();
  const [type, setType] = useState<"company" | "driver" | "vehicle">("company");
  const [entityId, setEntityId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("other");
  const [expiryDate, setExpiryDate] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const entityName = type === "company" ? "companies" : type === "driver" ? "drivers" : "vehicles";
  const { data: entities } = useQuery({ queryKey: [entityName, "document-options"], queryFn: () => api<PageResult<Entity>>(`/${entityName}?pageSize=100&active=true`) });
  const documentQuery = useQuery({ queryKey: ["documents", type, entityId], queryFn: () => api<Document[]>(`/documents?entityType=${type}&entityId=${entityId}`), enabled: Boolean(entityId) });
  const optionLabel = (item: Entity) => String(item.legalName || item.name || `${item.plate} · ${item.model}`);

  const upload = async () => {
    if (!file || !entityId) return;
    try {
      setUploading(true); setMessage("");
      if (!mockMode) {
        const input = { kind: `${type}-document`, entityId, fileName: file.name, mimeType: file.type, size: file.size, documentType, label: file.name, expiryDate: expiryDate || null };
        const ticket = await api<{ blobPath: string; uploadUrl: string }>("/files/upload-url", { method: "POST", body: JSON.stringify(input) });
        const response = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": file.type }, body: file });
        if (!response.ok) throw new Error("Não foi possível enviar o arquivo ao armazenamento.");
        await api("/files/complete", { method: "POST", body: JSON.stringify({ ...input, blobPath: ticket.blobPath }) });
        await documentQuery.refetch();
      }
      setFile(null); setMessage(mockMode ? "Upload simulado no modo de demonstração." : "Documento anexado com sucesso.");
    } catch (reason) { setMessage((reason as Error).message); } finally { setUploading(false); }
  };

  return <><PageHeader eyebrow="Conformidade documental" title="Documentos" description="Consulte documentos de empresas, motoristas e veículos sem expor o armazenamento privado."/><section className="card"><div className="toolbar document-filters"><select value={type} onChange={event => { setType(event.target.value as typeof type); setEntityId(""); }}><option value="company">Empresa</option><option value="driver">Motorista</option><option value="vehicle">Veículo</option></select><label className="search"><Search/><select value={entityId} onChange={event => setEntityId(event.target.value)}><option value="">Selecione um registro</option>{entities?.items.map(item => <option value={item.id} key={item.id}>{optionLabel(item)}</option>)}</select></label></div>
  {entityId && user?.role !== "inspector" && <div className="upload-strip"><select value={documentType} onChange={event => setDocumentType(event.target.value)}><option value="other">Outro documento</option><option value="contract">Contrato</option><option value="license">CNH</option><option value="registration">CRLV</option><option value="insurance">Seguro</option></select><input type="date" value={expiryDate} onChange={event => setExpiryDate(event.target.value)} aria-label="Validade"/><label className="button ghost"><Upload/> {file?.name || "Escolher arquivo"}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)}/></label><button className="button primary" disabled={!file || uploading} onClick={upload}>{uploading ? "Enviando…" : "Anexar"}</button></div>}
  {message && <div className="alert success">{message}</div>}
  {!entityId ? <EmptyState title="Selecione um registro" text="Os arquivos só são carregados depois da seleção."/> : documentQuery.isLoading ? <div className="loading">Consultando documentos…</div> : documentQuery.data?.length ? <div className="document-list">{documentQuery.data.map(document => <article key={document.id}><FileCheck2/><div><strong>{document.label}</strong><span>{document.documentType} · {document.fileName}</span></div><div className="document-expiry"><span>Validade</span><strong>{formatDate(document.expiryDate)}</strong></div><a className="button ghost" href={document.url} target="_blank" rel="noreferrer"><ExternalLink/> Abrir</a></article>)}</div> : <EmptyState title="Nenhum documento anexado" text="Você pode anexar um arquivo acima."/>}</section></>;
}
