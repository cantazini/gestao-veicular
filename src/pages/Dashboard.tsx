import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Car, ClipboardCheck, FileWarning, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatDate, formatNumber } from "../lib/format";
import type { DashboardData } from "../types";

export function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<DashboardData>("/dashboard") });
  const metrics = data?.metrics;
  const cards = [
    { label: "Vistorias realizadas", value: metrics?.inspections, icon: ClipboardCheck },
    { label: "Veículos ativos", value: metrics?.vehicles, icon: Car },
    { label: "Motoristas ativos", value: metrics?.drivers, icon: UsersRound },
    { label: "Empresas ativas", value: metrics?.companies, icon: Building2 },
    { label: "Vistorias reprovadas", value: metrics?.rejected, icon: AlertTriangle, tone: "warning" }
  ];

  return <>
    <PageHeader eyebrow="Visão geral" title="Dashboard" description="Acompanhe a operação e os principais indicadores de conformidade." actions={<Link className="button primary" to="/vistorias/nova">Nova vistoria</Link>}/>
    {isError ? <div className="alert error dashboard-error" role="alert"><span><strong>Não foi possível atualizar o painel.</strong>{error instanceof Error ? error.message : "Tente novamente em alguns instantes."}</span><button className="button ghost" onClick={() => void refetch()}>Tentar novamente</button></div> : <>
      <section className="metrics-grid" aria-label="Indicadores principais">{cards.map(({ label, value, icon: Icon, tone }) => <article className={`metric-card ${tone || ""}`} key={label}><div className="metric-icon"><Icon/></div><div><span>{label}</span><strong className={isLoading ? "skeleton-value" : ""}>{isLoading ? "" : formatNumber(value)}</strong></div></article>)}</section>
      <section className="dashboard-grid">
        <article className="card table-card"><div className="card-heading"><div><h2>Últimas vistorias</h2><p>Registros mais recentes da operação.</p></div><Link to="/vistorias">Ver histórico</Link></div>{isLoading ? <div className="table-skeleton" aria-label="Carregando últimas vistorias"><i/><i/><i/><i/></div> : data?.recentInspections.length ? <div className="table-scroll"><table><thead><tr><th>Data</th><th>Código</th><th>Veículo</th><th>Empresa</th><th>Conformidade</th><th>Resultado</th></tr></thead><tbody>{data.recentInspections.map((item) => <tr key={item.id}><td>{formatDate(item.inspectionDate)}</td><td><Link to={`/vistorias/${item.id}`}>{item.code}</Link></td><td><strong>{item.plate}</strong></td><td>{item.companyName}</td><td>{item.compliancePercentage}%</td><td><StatusBadge value={item.result}/></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma vistoria realizada" text="Os registros mais recentes aparecerão neste painel."/>}</article>
        <aside className="card alert-card"><div className="alert-icon"><FileWarning/></div><h2>Documentos a vencer</h2><strong className={isLoading ? "skeleton-value" : ""}>{isLoading ? "" : formatNumber(data?.alerts.expiringDocuments)}</strong><p>Documento(s) vencem dentro do período configurado.</p><Link className="button secondary wide" to="/documentos">Revisar documentos</Link></aside>
      </section>
    </>}
  </>;
}
