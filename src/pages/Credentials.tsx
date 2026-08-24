import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Printer, Search, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { PageHeader } from "../components/PageHeader";

interface Credential {
  vehicleId: string; driverId: string; plate: string; brand: string; model: string; vehicleType: string;
  companyName: string; driverName: string; registration: string; licenseCategory: string; licenseExpiry: string;
  accessProfileName: string; eligible: boolean; reasons: string[]; credentialValidUntil: string;
}
export function Credentials() {
  const { data = [], isLoading } = useQuery({ queryKey: ["credential-eligibility"], queryFn: () => api<Credential[]>("/credentials/eligibility") });
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState<string[]>([]);
  const cards = useMemo(() => data.filter(card => `${card.plate} ${card.driverName} ${card.companyName}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const key = (card: Credential) => `${card.vehicleId}-${card.driverId}`;
  const toggle = (card: Credential) => { if (!card.eligible) return; const cardKey = key(card); setSelected(current => current.includes(cardKey) ? current.filter(value => value !== cardKey) : [...current, cardKey]); };
  return <><PageHeader eyebrow="Acesso" title="Credenciais veiculares" description="A API valida CNH, frota, documentos e vínculos antes de liberar a impressão." actions={<button className="button primary" disabled={!selected.length} onClick={() => window.print()}><Printer/> Imprimir selecionadas ({selected.length})</button>}/><section className="card no-print"><div className="toolbar"><label className="search"><Search/><input placeholder="Buscar placa, motorista ou empresa" value={search} onChange={event => setSearch(event.target.value)}/></label><button className="button ghost" onClick={() => setSelected(cards.filter(card => card.eligible).map(key))}>Selecionar elegíveis</button></div></section>{isLoading ? <div className="loading">Verificando elegibilidade…</div> : <section className="credential-grid">{cards.map(card => <CredentialCard card={card} selected={selected.includes(key(card))} onClick={() => toggle(card)} key={key(card)}/>)}</section>}<div className="credential-print-only">{cards.filter(card => selected.includes(key(card))).map(card => <CredentialCard card={card} selected={false} key={key(card)}/>)}</div></>;
}
function CredentialCard({ card, selected, onClick }: { card: Credential; selected: boolean; onClick?: () => void }) {
  return <article className={`credential ${selected ? "selected" : ""} ${!card.eligible ? "ineligible" : ""}`} onClick={onClick}><header><img src="/assets/logo-meta-azul.png" alt="Meta"/>{card.eligible ? <ShieldCheck/> : <AlertTriangle/>}</header><p>Credencial de acesso veicular</p><h2>{card.plate}</h2><dl><div><dt>Motorista</dt><dd>{card.driverName}</dd></div><div><dt>Empresa</dt><dd>{card.companyName}</dd></div><div><dt>Veículo</dt><dd>{card.brand} {card.model}</dd></div><div><dt>Perfil</dt><dd>{card.accessProfileName}</dd></div><div><dt>Válida até</dt><dd>{formatDate(card.credentialValidUntil)}</dd></div></dl><footer>{card.eligible ? <span>{selected ? "Selecionada para impressão" : "Elegível · clique para selecionar"}</span> : <span>{card.reasons.join(" · ")}</span>}</footer></article>;
}
