import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Inspection, PageResult } from "../types";

export function Inspections({ rejectedOnly = false }: { rejectedOnly?: boolean }) {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["inspections"], queryFn: () => api<PageResult<Inspection>>("/inspections?pageSize=100") });
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(rejectedOnly ? "REPROVADO" : "");
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (data?.items || []).filter((inspection) =>
    (!result || inspection.result === result) &&
    `${inspection.code} ${inspection.plate} ${inspection.companyName} ${inspection.driverName}`.toLowerCase().includes(normalizedSearch)
  );

  return <>
    <PageHeader eyebrow="Vistorias" title={rejectedOnly ? "Reprovações" : "Histórico de vistorias"} description={rejectedOnly ? "Acompanhe os registros que exigem tratamento." : "Consulte, filtre e abra o relatório completo de cada vistoria."} actions={<Link className="button primary" to="/vistorias/nova"><Plus size={18}/> Nova vistoria</Link>}/>
    <section className="card">
      <div className="toolbar">
        <label className="search"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por código, placa, empresa ou motorista" aria-label="Buscar vistorias"/></label>
        <select value={result} onChange={(event) => setResult(event.target.value)} disabled={rejectedOnly} aria-label="Filtrar por resultado"><option value="">Todos os resultados</option><option value="APROVADO">Aprovado</option><option value="REPROVADO">Reprovado</option></select>
      </div>
      {isLoading ? <div className="loading">Carregando vistorias…</div> : isError ? <EmptyState title="Não foi possível carregar as vistorias" text={error instanceof Error ? error.message : "Tente novamente em alguns instantes."} action={<button className="button secondary" onClick={() => void refetch()}>Tentar novamente</button>}/> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>Data</th><th>Código</th><th>Empresa</th><th>Motorista</th><th>Veículo</th><th>Conformidade</th><th>Resultado</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{filtered.map((inspection) => <tr key={inspection.id}><td>{formatDate(inspection.inspectionDate)}<small>{inspection.inspectionTime}</small></td><td><strong>{inspection.code}</strong></td><td>{inspection.companyName}</td><td>{inspection.driverName}</td><td><span className="plate">{inspection.plate}</span></td><td><strong>{inspection.compliancePercentage}%</strong></td><td><StatusBadge value={inspection.result}/></td><td><Link className="table-action" to={`/vistorias/${inspection.id}`}><Eye size={17}/> Relatório</Link></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma vistoria encontrada" text={search || result ? "Revise os filtros para encontrar outros registros." : "As vistorias realizadas aparecerão aqui."}/>} 
    </section>
  </>;
}
