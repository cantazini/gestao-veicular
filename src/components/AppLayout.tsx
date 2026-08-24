import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { BarChart3, Building2, Car, ChevronDown, ClipboardCheck, FileBadge, FileClock, FileSpreadsheet, FolderKanban, Gauge, KeyRound, Menu, Settings, ShieldAlert, ShieldCheck, Truck, UserRound, Users, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import type { Role } from "../types";

const items: { to: string; label: string; icon: typeof Gauge; roles?: Role[] }[] = [
  { to: "/", label: "Dashboard", icon: BarChart3 }, { to: "/vistorias/nova", label: "Nova vistoria", icon: ClipboardCheck, roles: ["admin","inspector"] },
  { to: "/vistorias", label: "Histórico", icon: FileClock }, { to: "/reprovacoes", label: "Reprovações", icon: ShieldAlert },
  { to: "/veiculos", label: "Veículos", icon: Car }, { to: "/motoristas", label: "Motoristas", icon: UserRound },
  { to: "/empresas", label: "Empresas", icon: Truck }, { to: "/clientes", label: "Clientes", icon: Building2, roles: ["admin"] },
  { to: "/projetos", label: "Projetos", icon: FolderKanban, roles: ["admin"] }, { to: "/documentos", label: "Documentos", icon: FileBadge },
  { to: "/credenciais", label: "Credenciais", icon: KeyRound }, { to: "/exportar", label: "Exportar dados", icon: FileSpreadsheet },
  { to: "/administracao", label: "Administração", icon: Users, roles: ["admin"] }, { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] }
];
export function AppLayout() {
  const { user, signOut } = useAuth(); const [open, setOpen] = useState(false); const [profileOpen, setProfileOpen] = useState(false);
  return <div className="app-shell">
    <aside className={`sidebar ${open ? "open" : ""}`}><div className="sidebar-brand"><img src="/assets/logo-meta-branca.png" alt="Meta Central de Serviços"/><button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X/></button></div><nav>{items.filter((item) => !item.roles || item.roles.includes(user!.role)).map(({to,label,icon:Icon}) => <NavLink key={to} to={to} end={to==="/"} onClick={() => setOpen(false)}><Icon size={19}/><span>{label}</span></NavLink>)}</nav><div className="sidebar-foot"><ShieldCheck size={17}/><span>Ambiente corporativo seguro</span></div></aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Fechar menu"/>}
    <div className="app-main"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu/></button><div className="topbar-title"><strong>Meta Gestão Veicular</strong><span>Controle operacional e conformidade</span></div><div className="user-menu"><button onClick={() => setProfileOpen(!profileOpen)}><span className="avatar">{user!.name.slice(0,1)}</span><span className="user-copy"><strong>{user!.name}</strong><small>{({admin:"Administrador",inspector:"Fiscalizador",supplier:"Fornecedor"})[user!.role]}</small></span><ChevronDown size={16}/></button>{profileOpen && <div className="user-popover"><span>{user!.email}</span><button onClick={signOut}>Sair</button></div>}</div></header><main className="page"><Outlet/></main></div>
  </div>;
}
