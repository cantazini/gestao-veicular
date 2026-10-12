import { useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { validateLocalFile } from "../lib/files";

interface Props {
  entityId?: string;
  entityKind: "client" | "company";
  logoBlobPath?: string;
  file: File | null;
  removed: boolean;
  onFileChange: (file: File | null) => void;
  onRemovedChange: (removed: boolean) => void;
}

export function EntityLogoPanel({ entityId, entityKind, logoBlobPath, file, removed, onFileChange, onRemovedChange }: Props) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [failedSource, setFailedSource] = useState("");
  const entityLabel = entityKind === "client" ? "cliente" : "empresa";
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const persisted = !removed && logoBlobPath ? (/^(https?:|\/)/.test(logoBlobPath) ? logoBlobPath : entityId ? `/api/${entityKind === "client" ? "clients" : "companies"}/${entityId}/logo` : "") : "";
  const source = preview || persisted;

  return <section className="form-attachment-section field-full">
    <div className="form-section-title"><span>Identidade visual</span></div>
    <div className="client-logo-editor">
      <div className="client-logo-preview">{source && failedSource !== source ? <img src={source} alt={`Pré-visualização da logo da ${entityLabel}`} onError={() => setFailedSource(source)}/> : <span>{source ? "Não foi possível carregar a logo" : "Nenhuma logo cadastrada"}</span>}</div>
      <div className="client-logo-copy">
        <strong>Logo da {entityLabel}</strong>
        <p>PNG ou JPG, até 5 MB. A imagem é opcional, armazenada de forma privada e usada apenas como apoio visual no sistema.</p>
        <div>
          <label className="button ghost"><ImagePlus size={17}/>{source ? "Substituir logo" : "Selecionar logo"}<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={(event) => {
            const selected = event.target.files?.[0] || null;
            if (!selected) return;
            const validation = validateLocalFile(selected, true);
            if (validation) { setError(validation); return; }
            setError(""); onRemovedChange(false); onFileChange(selected);
          }}/></label>
          {source && <button type="button" className="button ghost danger-text" onClick={() => { onFileChange(null); onRemovedChange(true); }}><Trash2 size={17}/> Remover</button>}
        </div>
        {file && <small>Arquivo selecionado: {file.name}</small>}
        {error && <small className="field-error">{error}</small>}
      </div>
    </div>
  </section>;
}
