import { useEffect, useState } from "react";
import { CarFront, ImagePlus, Trash2 } from "lucide-react";
import { validateLocalFile } from "../lib/files";

type Props = {
  entityId?: string;
  coverBlobPath?: string;
  file: File | null;
  removed: boolean;
  onFileChange: (file: File | null) => void;
  onRemovedChange: (removed: boolean) => void;
};

export function VehicleCoverPanel({ entityId, coverBlobPath, file, removed, onFileChange, onRemovedChange }: Props) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const persisted = !removed && coverBlobPath ? (/^(https?:|\/)/.test(coverBlobPath) ? coverBlobPath : entityId ? `/api/vehicles/${entityId}/cover` : "") : "";
  const source = preview || persisted;

  return <section className="form-attachment-section field-full">
    <div className="form-section-title"><span>Identidade visual</span></div>
    <div className="vehicle-cover-editor">
      <div className="vehicle-cover-preview">
        <span><CarFront aria-hidden="true"/> Sem foto de capa</span>
        {source && <img
          src={source}
          alt="Pré-visualização da foto do veículo"
          onError={(event) => { event.currentTarget.hidden = true; }}
        />}
      </div>
      <div className="client-logo-copy">
        <strong>Foto do veículo</strong>
        <p>PNG ou JPG, até 5 MB. A imagem é opcional e será exibida como capa nos cards de veículos.</p>
        <div>
          <label className="button ghost"><ImagePlus size={17}/>{source ? "Substituir foto" : "Selecionar foto"}<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={(event) => {
            const selected = event.target.files?.[0] || null;
            if (!selected) return;
            const validation = validateLocalFile(selected, true);
            if (validation) { setError(validation); event.currentTarget.value = ""; return; }
            setError(""); onRemovedChange(false); onFileChange(selected);
            event.currentTarget.value = "";
          }}/></label>
          {source && <button type="button" className="button ghost danger-text" onClick={() => { setError(""); onFileChange(null); onRemovedChange(true); }}><Trash2 size={17}/> Remover</button>}
        </div>
        {file && <small>Arquivo selecionado: {file.name}</small>}
        {error && <small className="field-error">{error}</small>}
      </div>
    </div>
  </section>;
}
