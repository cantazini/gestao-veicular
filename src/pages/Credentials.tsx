import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Car, Printer, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { resolveClientLogo } from "../lib/branding";
import { formatDate } from "../lib/format";
import type { Entity, PageResult } from "../types";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";

interface Credential {
  vehicleId: string; driverId: string; plate: string; brand: string; model: string; vehicleType: string;
  clientId: string; clientName: string; clientLogoBlobPath?: string; companyId: string; companyName: string;
  driverName: string; registration: string; licenseCategory: string; licenseExpiry: string;
  accessProfileId: string; accessProfileName: string; accessProfileDescription?: string; accessProfileColor?: string;
  credentialCode: string; eligible: boolean; reasons: string[]; credentialValidUntil: string;
}

const sourceNames = ["clients", "companies", "vehicles", "accessProfiles"] as const;
const label = (item: Entity) => String(item.name || item.legalName || item.plate || item.id);

export function Credentials() {
  const [selection, setSelection] = useState({ clientId: "", companyId: "", vehicleId: "", accessProfileId: "" });
  const [selected, setSelected] = useState<string[]>([]);
  const sources = useQueries({ queries: sourceNames.map((name) => ({ queryKey: [name, "credential-options"], queryFn: () => api<PageResult<Entity>>(`/${name}?pageSize=100&active=true`) })) });
  const [clients, allCompanies, allVehicles, allProfiles] = sources.map((query) => query.data?.items || []);
  const companies = allCompanies.filter((item) => item.clientId === selection.clientId);
  const vehicles = allVehicles.filter((item) => item.companyId === selection.companyId);
  const selectedVehicle = allVehicles.find((item) => item.id === selection.vehicleId);
  const profiles = allProfiles.filter((item) => item.id === selectedVehicle?.accessProfileId);
  const ready = Boolean(selection.clientId && selection.companyId && selection.vehicleId && selection.accessProfileId);
  const queryString = new URLSearchParams(selection).toString();
  const eligibility = useQuery({ queryKey: ["credential-eligibility", queryString], queryFn: () => api<Credential[]>(`/credentials/eligibility?${queryString}`), enabled: ready });
  const cards = eligibility.data || [];
  const key = (card: Credential) => `${card.vehicleId}-${card.driverId}-${card.accessProfileId}`;
  const eligibleKeys = useMemo(() => cards.filter((card) => card.eligible).map(key), [cards]);
  const update = (field: keyof typeof selection, value: string) => {
    setSelected([]);
    setSelection((current) => ({
      ...current, [field]: value,
      ...(field === "clientId" ? { companyId: "", vehicleId: "", accessProfileId: "" } : {}),
      ...(field === "companyId" ? { vehicleId: "", accessProfileId: "" } : {}),
      ...(field === "vehicleId" ? { accessProfileId: "" } : {})
    }));
  };
  const toggle = (card: Credential) => {
    if (!card.eligible) return;
    const cardKey = key(card);
    setSelected((current) => current.includes(cardKey) ? current.filter((value) => value !== cardKey) : [...current, cardKey]);
  };

  return <>
    <PageHeader eyebrow="Acesso" title="Credenciais veiculares" description="Selecione os vínculos cadastrados; a API valida documentos e regras antes de liberar a impressão." actions={<button className="button primary" disabled={!selected.length} onClick={() => window.print()}><Printer/> Imprimir / Salvar PDF ({selected.length})</button>}/>
    <section className="card no-print credential-builder">
      <div className="credential-flow" aria-label="Etapas para gerar a credencial">
        <label className="field"><span>1. Cliente</span><select value={selection.clientId} onChange={(event) => update("clientId", event.target.value)}><option value="">Selecione o cliente</option>{clients.map((item) => <option value={item.id} key={item.id}>{label(item)}</option>)}</select></label>
        <label className="field"><span>2. Empresa</span><select value={selection.companyId} disabled={!selection.clientId} onChange={(event) => update("companyId", event.target.value)}><option value="">Selecione a empresa</option>{companies.map((item) => <option value={item.id} key={item.id}>{label(item)}</option>)}</select></label>
        <label className="field"><span>3. Veículo / placa</span><select value={selection.vehicleId} disabled={!selection.companyId} onChange={(event) => update("vehicleId", event.target.value)}><option value="">Selecione o veículo</option>{vehicles.map((item) => <option value={item.id} key={item.id}>{item.plate} — {item.brand} {item.model}</option>)}</select></label>
        <label className="field"><span>4. Perfil de acesso</span><select value={selection.accessProfileId} disabled={!selection.vehicleId} onChange={(event) => update("accessProfileId", event.target.value)}><option value="">Selecione o perfil</option>{profiles.map((item) => <option value={item.id} key={item.id}>{label(item)}</option>)}</select></label>
      </div>
      <div className="credential-builder-actions"><div><ShieldCheck/><span><strong>Validação automática</strong><small>CNH, frota, documentos e vínculos são conferidos no backend.</small></span></div><button className="button secondary" disabled={!ready || !eligibleKeys.length} onClick={() => setSelected(eligibleKeys)}><Sparkles size={17}/> Gerar credencial{eligibleKeys.length > 1 ? "s" : ""}</button></div>
    </section>
    {!ready ? <EmptyState title="Complete os quatro vínculos" text="A placa e o perfil vêm dos cadastros existentes; nenhum identificador precisa ser digitado manualmente." action={<Car/>}/> : eligibility.isLoading ? <div className="loading">Verificando elegibilidade…</div> : eligibility.isError ? <EmptyState title="Não foi possível validar a credencial" text={eligibility.error instanceof Error ? eligibility.error.message : "Tente novamente."}/> : cards.length ? <section className="credential-grid">{cards.map((card) => <CredentialCard card={card} selected={selected.includes(key(card))} onClick={() => toggle(card)} key={key(card)}/>)}</section> : <EmptyState title="Nenhum motorista vinculado elegível para análise" text="Revise os motoristas associados ao veículo e o perfil de acesso cadastrado."/>}
    <div className="credential-print-only">{cards.filter((card) => selected.includes(key(card))).map((card) => <CredentialCard card={card} selected={false} key={key(card)}/>)}</div>
  </>;
}

function CredentialCard({ card, selected, onClick }: { card: Credential; selected: boolean; onClick?: () => void }) {
  const registeredLogo = card.clientLogoBlobPath ? (card.clientLogoBlobPath.startsWith("/") ? card.clientLogoBlobPath : `/api/clients/${card.clientId}/logo`) : null;
  const clientLogo = resolveClientLogo(card.clientName, registeredLogo);
  return <article className={`credential ${selected ? "selected" : ""} ${!card.eligible ? "ineligible" : ""}`} onClick={onClick} style={{ "--credential-accent": card.accessProfileColor || "#075a9c" } as React.CSSProperties}>
    <header><div className="credential-brands"><img src="/assets/logo-meta-azul.png" alt="Meta"/>{clientLogo && <img src={clientLogo} alt={`Logo ${card.clientName}`} onError={(event) => { event.currentTarget.hidden = true; }}/>}</div>{card.eligible ? <ShieldCheck/> : <AlertTriangle/>}</header>
    <p>Credencial de acesso veicular</p><h2>{card.plate}</h2>
    <dl><div><dt>Cliente</dt><dd>{card.clientName}</dd></div><div><dt>Empresa</dt><dd>{card.companyName}</dd></div><div><dt>Motorista</dt><dd>{card.driverName}</dd></div><div><dt>Veículo</dt><dd>{card.brand} {card.model}</dd></div><div><dt>Perfil</dt><dd>{card.accessProfileName}</dd></div><div><dt>Válida até</dt><dd>{formatDate(card.credentialValidUntil)}</dd></div><div><dt>Código</dt><dd>{card.credentialCode}</dd></div></dl>
    <footer>{card.eligible ? <span>{selected ? "Selecionada para impressão" : "Elegível · clique para selecionar"}</span> : <span>{card.reasons.join(" · ")}</span>}</footer>
  </article>;
}
