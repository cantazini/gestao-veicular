import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Building2, Car, ClipboardCheck, FileCheck2, FileWarning, FileX2, UsersRound } from "lucide-react";
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
    { label: "Veículos pendentes", value: metrics?.pendingVehicles, icon: AlertTriangle, tone: "warning" }
  ];
  // Classificação mutuamente exclusiva: cada documento ativo entra em exatamente um card.
  const documentCards = [
    { status: "VALID", label: "Documentos válidos", value: data?.alerts.validDocuments, icon: FileCheck2, tone: "success" },
    { status: "EXPIRING", label: "Documentos a vencer", value: data?.alerts.expiringDocuments, icon: FileWarning, tone: "warning" },
    { status: "EXPIRED", label: "Vencidos/inválidos", value: data?.alerts.expiredDocuments, icon: FileX2, tone: "danger" }
  ];

  return <>
    <PageHeader eyebrow="Visão geral" title="Dashboard" description="Acompanhe a operação e os principais indicadores de conformidade." actions={<Link className="button primary" to="/vistorias/nova">Nova vistoria</Link>}/>
    {isError ? <div className="alert error dashboard-error" role="alert"><span><strong>Não foi possível atualizar o painel.</strong>{error instanceof Error ? error.message : "Tente novamente em alguns instantes."}</span><button className="button ghost" onClick={() => void refetch()}>Tentar novamente</button></div> : <>
      <section className="metrics-grid" aria-label="Indicadores principais">{cards.map(({ label, value, icon: Icon, tone }) => <article className={`metric-card ${tone || ""}`} key={label}><div className="metric-icon"><Icon/></div><div><span>{label}</span><strong className={isLoading ? "skeleton-value" : ""}>{isLoading ? "" : formatNumber(value)}</strong></div></article>)}</section>
      <section className="dashboard-grid">
        <article className="card table-card"><div className="card-heading"><div><h2>Últimas vistorias</h2><p>Registros mais recentes da operação.</p></div><Link to="/vistorias">Ver histórico</Link></div>{isLoading ? <div className="table-skeleton" aria-label="Carregando últimas vistorias"><i/><i/><i/><i/></div> : data?.recentInspections.length ? <div className="table-scroll"><table><thead><tr><th>Data</th><th>Código</th><th>Sequência</th><th>Veículo</th><th>Empresa</th><th>Conformidade</th><th>Resultado</th></tr></thead><tbody>{data.recentInspections.map((item) => <tr key={item.id}><td>{formatDate(item.inspectionDate)}</td><td><Link to={`/vistorias/${item.id}`}>{item.code}</Link></td><td><strong>{item.sequence}ª vistoria</strong></td><td><strong>{item.plate}</strong></td><td>{item.companyName}</td><td>{item.compliancePercentage}%</td><td><StatusBadge value={item.result}/></td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma vistoria realizada" text="Os registros mais recentes aparecerão neste painel."/>}</article>
        <aside className="document-alerts" aria-label="Indicadores de documentos">{documentCards.map(({ status, label, value, icon: Icon, tone }) => <Link className={`card alert-card document-alert ${tone}`} key={status} to={`/documentos?status=${status}`} aria-label={`${label}: ${isLoading || value === undefined ? "carregando" : formatNumber(value)}. Revisar documentos`}><div className="alert-icon"><Icon/></div><h2>{label}</h2><strong className={isLoading ? "skeleton-value" : ""}>{isLoading ? "" : value === undefined ? "—" : formatNumber(value)}</strong></Link>)}</aside>
      </section>
    </>}
  </>;
}
