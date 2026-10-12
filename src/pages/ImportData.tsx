import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "../lib/api";
import {
  IMPORT_TEMPLATE, analyzeImportRows, executeImport, readWorkbook,
  type ExistingEntities, type ImportCandidate, type ImportEntity, type ImportWorkbookRows
} from "../lib/importWorkbook";
import type { Entity, PageResult } from "../types";
import { PageHeader } from "../components/PageHeader";

const entityNames: ImportEntity[] = ["clients", "projects", "companies", "accessProfiles", "drivers", "vehicles"];
const entityLabels: Record<ImportEntity, string> = { clients: "Cliente", projects: "Projeto", companies: "Empresa", accessProfiles: "Perfil de acesso", drivers: "Motorista", vehicles: "Veículo" };

async function loadAllEntities(): Promise<ExistingEntities> {
  const entries = await Promise.all(entityNames.map(async (entity) => {
    const items: Entity[] = []; let page = 1; let total = 0;
    do {
      const result = await api<PageResult<Entity>>(`/${entity}?page=${page}&pageSize=100&active=true`);
      items.push(...result.items); total = result.total; page += 1;
    } while (items.length < total);
    return [entity, items] as const;
  }));
  return Object.fromEntries(entries) as ExistingEntities;
}

export function ImportData() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<ExistingEntities | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const valid = candidates.filter((item) => item.status === "valid").length;
  const invalid = candidates.filter((item) => item.status === "invalid").length;
  const imported = candidates.filter((item) => item.status === "imported").length;
  const failed = candidates.filter((item) => item.status === "failed").length;
  const processed = imported + failed;
  const grouped = useMemo(() => entityNames.map((entity) => ({ entity, total: candidates.filter((item) => item.entity === entity).length })), [candidates]);

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const instructions = [
      ["META GESTÃO VEICULAR — MODELO DE IMPORTAÇÃO"],
      ["Preencha as abas sem alterar seus nomes ou cabeçalhos."],
      ["Use datas no formato AAAA-MM-DD e separe listas por ponto e vírgula."],
      ["Cadastros são processados nesta ordem: Clientes, Projetos, Empresas, Perfis de acesso, Motoristas e Veículos."],
      ["Para empresas subcontratadas, a contratante deve existir na base ou aparecer antes na aba Empresas."],
      ["A análise não grava dados. Somente linhas válidas serão enviadas após sua confirmação."]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(instructions), "Instrucoes");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Campo", "Exemplo de formato", "Observação"],
      ["CNPJ", "00.000.000/0000-00", "Informe um CNPJ matematicamente válido"],
      ["Validade_CNH", "2028-12-31", "Sempre AAAA-MM-DD"],
      ["Projetos_Codigos", "PRJ-01;PRJ-02", "Separe múltiplos valores por ponto e vírgula"],
      ["Empresa_CNPJ (Motoristas e Veículos)", "00.000.000/0000-00;11.111.111/0001-11", "Um ou mais CNPJs, separados por ponto e vírgula, quando o motorista ou veículo atende várias empresas. A primeira é a principal."],
      ["Ativo", "Sim", "Use Sim ou Não"],
      ["Tipo_Contrato", "Direto", "Use Direto ou Subcontratado"],
      ["Propriedade", "Próprio", "Use Próprio ou Locado"]
    ]), "Exemplos");
    Object.entries(IMPORT_TEMPLATE).forEach(([sheet, headers]) => {
      const worksheet = XLSX.utils.aoa_to_sheet([headers]);
      worksheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet);
    });
    XLSX.writeFile(workbook, "modelo_importacao_meta_gestao_veicular.xlsx");
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true); setMessage(""); setCandidates([]);
    try {
      const [workbook, current] = await Promise.all([readWorkbook(file), loadAllEntities()]);
      const missingSheets = Object.keys(IMPORT_TEMPLATE).filter((sheet) => !(sheet in workbook));
      if (missingSheets.length) throw new Error(`A planilha não contém as abas obrigatórias: ${missingSheets.join(", ")}.`);
      setExisting(current); setCandidates(analyzeImportRows(workbook as ImportWorkbookRows, current));
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Não foi possível analisar a planilha."); }
    finally { setAnalyzing(false); }
  };

  const confirmImport = async () => {
    if (!existing || !valid) return;
    setImporting(true); setMessage("");
    await executeImport(
      candidates, existing,
      (entity, payload) => api<Entity>(`/${entity}`, { method: "POST", body: JSON.stringify(payload) }),
      (id, status, error) => setCandidates((current) => current.map((item) => item.id === id ? { ...item, status, errors: error ? [error] : [] } : item))
    );
    await Promise.all(entityNames.map((entity) => queryClient.invalidateQueries({ queryKey: [entity] })));
    setImporting(false); setMessage("Importação concluída. Confira abaixo o resultado de cada linha.");
  };

  return <>
    <PageHeader eyebrow="Administração" title="Importar dados" description="Valide uma planilha antes de incluir cadastros em massa, preservando os vínculos entre as entidades." actions={<button className="button secondary" onClick={downloadTemplate}><Download/> Baixar modelo XLSX</button>}/>
    <section className="card import-start">
      <div className="import-intro"><FileSpreadsheet/><div><h2>Planilha de cadastros</h2><p>Baixe o modelo, preencha as abas e faça a análise. Nenhum dado é gravado nesta etapa.</p></div></div>
      <div className="import-actions"><label className="button ghost"><Upload/> {file?.name || "Selecionar planilha"}<input type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] || null); setCandidates([]); setMessage(""); }}/></label><button className="button primary" disabled={!file || analyzing || importing} onClick={analyze}>{analyzing ? "Analisando…" : "Analisar planilha"}</button></div>
      {message && <div className={`alert ${failed ? "info" : candidates.length ? "success" : "error"}`} role="status">{message}</div>}
    </section>

    {candidates.length > 0 && <>
      <section className="import-metrics">
        <article><span>Linhas analisadas</span><strong>{candidates.length}</strong></article>
        <article className="valid"><span>Válidas</span><strong>{valid}</strong></article>
        <article className="invalid"><span>Com pendências</span><strong>{invalid}</strong></article>
        <article><span>Importadas</span><strong>{imported}</strong></article>
      </section>
      <section className="card import-review">
        <header><div><h2>Pré-visualização e validação</h2><p>{grouped.filter((item) => item.total).map((item) => `${item.total} ${entityLabels[item.entity].toLowerCase()}(s)`).join(" · ")}</p></div>{valid > 0 && !processed && <button className="button primary" disabled={importing} onClick={confirmImport}><CheckCircle2/>{importing ? `Importando ${processed}/${valid}…` : `Confirmar importação de ${valid} linha(s)`}</button>}</header>
        {invalid > 0 && <div className="alert info"><AlertTriangle/> As {invalid} linha(s) com pendências não serão importadas. Corrija a planilha e analise novamente para incluí-las.</div>}
        <div className="table-scroll"><table><thead><tr><th>Entidade</th><th>Linha</th><th>Registro</th><th>Status</th><th>Detalhes</th></tr></thead><tbody>{candidates.map((item) => <tr key={item.id}><td>{entityLabels[item.entity]}</td><td>{item.sheet} · {item.rowNumber}</td><td>{item.description || "—"}</td><td><span className={`import-status ${item.status}`}>{item.status === "valid" ? "Válida" : item.status === "invalid" ? "Pendente" : item.status === "imported" ? "Importada" : "Falhou"}</span></td><td>{item.errors.join(" ") || "Pronta para importar."}</td></tr>)}</tbody></table></div>
      </section>
    </>}
  </>;
}
