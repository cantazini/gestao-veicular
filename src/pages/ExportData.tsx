import { useState } from "react";
import { Database, Download, FileSpreadsheet } from "lucide-react";
import { api } from "../lib/api";
import { today } from "../lib/format";
import { PageHeader } from "../components/PageHeader";

export function ExportData() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const exportFile = async () => {
    try {
      setBusy(true); setMessage("");
      const XLSX = await import("xlsx");
      const rows = await api<Record<string, unknown>[]>("/exports/inspections");
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!autofilter"] = { ref: sheet["!ref"] || "A1:A1" };
      sheet["!cols"] = Object.keys(rows[0] || { ID_Vistoria: "" }).map(key => ({ wch: Math.min(35, Math.max(14, key.length + 2)) }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Vistorias");
      XLSX.writeFile(book, `vistorias_${today()}.xlsx`);
      setMessage(`${rows.length} vistoria(s) exportada(s) com sucesso.`);
    } catch (reason) { setMessage((reason as Error).message); } finally { setBusy(false); }
  };
  return <><PageHeader eyebrow="Dados" title="Exportar dados" description="Gere uma base achatada e pronta para análise no Excel ou Power BI."/><section className="export-grid"><article className="card export-card"><div className="export-icon"><FileSpreadsheet/></div><h2>Vistorias em XLSX</h2><p>Cada linha representa uma vistoria, com dados de cliente, empresa, projeto, motorista, veículo, conformidade e itens principais.</p><ul><li>Formato compatível com Excel</li><li>Cabeçalhos estáveis para Power BI</li><li>Filtros incluídos na planilha</li></ul><button className="button primary wide" onClick={exportFile} disabled={busy}><Download/>{busy ? "Preparando arquivo…" : "Baixar planilha XLSX"}</button>{message && <div className="alert success">{message}</div>}</article><article className="card data-note"><Database/><h2>Fonte confiável</h2><p>O arquivo é produzido pela API a partir dos registros autorizados para o seu perfil. Fotografias e documentos não são incorporados à planilha.</p></article></section></>;
}
