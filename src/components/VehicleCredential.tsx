import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { CSSProperties, KeyboardEvent } from "react";
import { credentialPresentation, getCredentialContrastText, normalizeCredentialColor, type Credential } from "../lib/credentialPresentation";

export type { Credential } from "../lib/credentialPresentation";

export type CredentialAction = "request" | "approve" | "reject" | "issue";

const safetyGuidance = [
  "Limite de velocidade: 30 km/h",
  "Tenha em mãos sua CNH",
  "Sempre use o cinto de segurança",
  "Respeite as placas de sinalização",
  "Atenção! Você está dentro do canteiro de obras",
  "Acenda sempre os faróis",
  "Não use o celular e não fume enquanto dirige",
  "Estacione de ré",
  "Respeite as faixas de pedestres"
];

function CredentialLogo({ src, alt, className }: { src: string; alt: string; className: string }) {
  return <img className={className} src={src} alt={alt} onError={(event) => { event.currentTarget.hidden = true; }}/>;
}

export function VehicleCredentialDocument({ card, clientLogoUrl, linkedDriverNames = [] }: { card: Credential; clientLogoUrl?: string | null; linkedDriverNames?: string[] }) {
  const view = credentialPresentation(card, linkedDriverNames);
  const accent = normalizeCredentialColor(card.accessProfileColor);
  return <div className="vehicle-credential-document" style={{
    "--credential-accent": accent,
    "--credential-accent-text": getCredentialContrastText(accent)
  } as CSSProperties}>
    <div className="vehicle-credential-side">
      <span className="credential-side-label no-print">Frente</span>
      <section className="vehicle-credential-face credential-front" aria-label={`Frente da credencial do veículo ${view.plate}`}>
        <header className="credential-front-banner">
          <strong>Liberação veículos: van, micro, ônibus</strong>
          <span>Acesso à área interna</span>
        </header>
        <div className="credential-front-body">
          <h3>{view.companyName}</h3>
          <strong className="credential-main-plate">{view.plate}</strong>
          <time>{view.validUntil}</time>
          <div className="credential-front-logos">
            {clientLogoUrl
              ? <CredentialLogo className="credential-client-logo" src={clientLogoUrl} alt={`Logo ${card.clientName}`}/>
              : <span className="credential-client-fallback">{card.clientName}</span>}
            <CredentialLogo className="credential-meta-logo" src="/assets/logo-meta-azul.png" alt="Meta Central de Serviços"/>
          </div>
        </div>
        <div className="credential-blue-footer" aria-hidden="true"/>
      </section>
    </div>

    <div className="vehicle-credential-side">
      <span className="credential-side-label no-print">Verso</span>
      <section className="vehicle-credential-face credential-back" aria-label={`Verso da credencial do veículo ${view.plate}`}>
        <div className="credential-back-panel">
          <strong className={`credential-number${view.credentialCode.length > 16 ? " is-long" : ""}`}>
            {view.credentialCode}
          </strong>
          <div className="credential-important">
            <strong>Importante:</strong>
            <ul>{safetyGuidance.map((guidance) => <li key={guidance}>{guidance}</li>)}</ul>
          </div>
        </div>
        <div className="credential-back-body">
          <h3>Responsável pelo veículo</h3>
          <dl className="credential-drivers">
            <div><dt>1º condutor:</dt><dd>{view.firstDriver}</dd></div>
            <div><dt>2º condutor:</dt><dd>{view.secondDriver}</dd></div>
            <div><dt>3º condutor:</dt><dd>{view.thirdDriver}</dd></div>
          </dl>
          <p className="credential-inspection-date">Data da inspeção: <strong>{view.inspectionDate}</strong></p>
          <div className="credential-signature"><span/><strong>Meta Central de Serviços</strong></div>
        </div>
        <div className="credential-blue-footer" aria-hidden="true"/>
      </section>
    </div>
  </div>;
}

type VehicleCredentialProps = {
  card: Credential;
  selected?: boolean;
  clientLogoUrl?: string | null;
  linkedDriverNames?: string[];
  onSelect?: () => void;
  onAction?: (action: CredentialAction) => void;
  busy?: boolean;
  printCard?: boolean;
};

export function VehicleCredential({ card, selected = false, clientLogoUrl, linkedDriverNames, onSelect, onAction, busy = false, printCard = false }: VehicleCredentialProps) {
  if (printCard) return <div className="credential-print-sheet"><VehicleCredentialDocument card={card} clientLogoUrl={clientLogoUrl} linkedDriverNames={linkedDriverNames}/></div>;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !onSelect || !card.eligible || !["Enter", " "].includes(event.key)) return;
    event.preventDefault(); onSelect();
  };
  return <article
    className={`credential-record ${selected ? "selected" : ""} ${!card.eligible ? "ineligible" : ""}`}
    onClick={onSelect}
    onKeyDown={handleKeyDown}
    role={onSelect ? "checkbox" : undefined}
    aria-checked={onSelect ? selected : undefined}
    aria-disabled={onSelect ? !card.eligible : undefined}
    tabIndex={onSelect && card.eligible ? 0 : undefined}
  >
    <VehicleCredentialDocument card={card} clientLogoUrl={clientLogoUrl} linkedDriverNames={linkedDriverNames}/>
    <footer className="credential-record-footer">
      <span className="credential-status">{card.eligible ? <ShieldCheck/> : <AlertTriangle/>}<strong>{card.eligible ? (selected ? "Selecionada para impressão" : "Elegível · clique para selecionar") : card.reasons.join(" · ")}</strong></span>
      {onAction && <span className="credential-actions">
        {card.canRequestApproval && <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); onAction("request"); }}>Solicitar aprovação</button>}
        {card.approvalStatus === "pending" && <><button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); onAction("approve"); }}>Aprovar análise</button><button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); onAction("reject"); }}>Rejeitar</button></>}
        {card.canIssue && <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); onAction("issue"); }}>Emitir credencial</button>}
      </span>}
    </footer>
  </article>;
}
