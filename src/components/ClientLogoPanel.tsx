import { useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { validateLocalFile } from "../lib/files";

interface Props {
  clientId?: string;
  logoBlobPath?: string;
  file: File | null;
  removed: boolean;
  onFileChange: (file: File | null) => void;
  onRemovedChange: (removed: boolean) => void;
}

export function ClientLogoPanel({ clientId, logoBlobPath, file, removed, onFileChange, onRemovedChange }: Props) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const persisted = !removed && logoBlobPath ? (logoBlobPath.startsWith("/") ? logoBlobPath : clientId ? `/api/clients/${clientId}/logo` : "") : "";
  const source = preview || persisted;

  return <section className="form-attachment-section field-full">
    <div className="form-section-title"><span>Identidade visual</span></div>
    <div className="client-logo-editor">
      <div className="client-logo-preview">{source ? <img src={source} alt="Pré-visualização da logo do cliente"/> : <span>Nenhuma logo cadastrada</span>}</div>
      <div className="client-logo-copy">
        <strong>Logo do cliente</strong>
        <p>PNG ou JPG, até 5 MB. A imagem será armazenada de forma privada e exibida junto à marca Meta nos relatórios.</p>
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
