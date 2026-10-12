import { useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, Search, X } from "lucide-react";
import type { Entity } from "../types";
import { companyForest, contractLabel, organizationName, searchCompanyForest, type CompanyNode } from "../lib/organizationDirectory";
import { OrganizationLogo } from "./OrganizationDirectory";
import { StatusBadge } from "./StatusBadge";

function Branches({ nodes }: { nodes: CompanyNode[] }) {
  return <ul className="company-tree">{nodes.map((node) => <li key={node.company.id}><div className="company-tree-node"><OrganizationLogo item={node.company} kind="companies"/><div><strong>{String(node.company.legalName)}</strong><small>{contractLabel(node.company.contractType)}</small>{node.warning && <small className="company-tree-warning">{node.warning}</small>}</div><StatusBadge value={node.company.active === true}/></div>{node.children.length > 0 && <Branches nodes={node.children}/>}</li>)}</ul>;
}

export function CompanyHierarchy({ companies, clients, onClose }: { companies: Entity[]; clients: Map<string, Entity>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const forest = useMemo(() => companyForest(companies), [companies]);
  const visible = useMemo(() => searchCompanyForest(forest, search), [forest, search]);
  const groups = new Map<string, CompanyNode[]>();
  for (const node of visible) {
    const key = String(node.company.clientId || "");
    groups.set(key, [...(groups.get(key) || []), node]);
  }
  return <dialog ref={dialog} className="company-hierarchy-dialog" aria-labelledby="company-hierarchy-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="company-hierarchy-shell">
      <header className="modal-header"><div><p className="eyebrow">Organização</p><h2 id="company-hierarchy-title"><GitBranch size={22}/> Hierarquia de empresas</h2></div><button className="icon-button" aria-label="Fechar hierarquia" onClick={onClose}><X/></button></header>
      <div className="company-hierarchy-body"><p className="company-hierarchy-description">Todas as empresas, incluindo inativas. A busca mantém as contratantes acima dos resultados.</p><label className="search"><Search size={18}/><input aria-label="Buscar razão social na hierarquia" placeholder="Buscar razão social" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
        {groups.size ? [...groups].sort(([a], [b]) => organizationName(clients.get(a)).localeCompare(organizationName(clients.get(b)), "pt-BR")).map(([id, nodes]) => <section className="company-tree-client" key={id}><h3>{organizationName(clients.get(id))}</h3><Branches nodes={nodes}/></section>) : <p className="company-hierarchy-description">Nenhuma empresa encontrada.</p>}
      </div>
      <footer className="modal-footer"><button className="button secondary" onClick={onClose}>Fechar</button></footer>
    </div>
  </dialog>;
}
