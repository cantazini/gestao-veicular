import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3, Building2, Car, ChevronDown, ClipboardCheck, FileBadge, FileClock,
  FileSpreadsheet, FileUp, FolderKanban, KeyRound, Menu, PanelLeftClose, PanelLeftOpen,
  Settings, ShieldAlert, ShieldCheck, Truck, UserRound, Users, X
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import type { Role } from "../types";

type MenuItem = { to: string; label: string; icon: typeof BarChart3; roles?: Role[] };
type MenuGroup = { key: string; label: string; items: MenuItem[] };

const menuGroups: MenuGroup[] = [
  { key: "operation", label: "Operação", items: [
    { to: "/", label: "Dashboard", icon: BarChart3 },
    { to: "/vistorias/nova", label: "Nova vistoria", icon: ClipboardCheck, roles: ["admin", "inspector"] },
    { to: "/vistorias", label: "Histórico", icon: FileClock },
    { to: "/reprovacoes", label: "Reprovações", icon: ShieldAlert }
  ] },
  { key: "records", label: "Cadastros", items: [
    { to: "/veiculos", label: "Veículos", icon: Car },
    { to: "/motoristas", label: "Motoristas", icon: UserRound },
    { to: "/empresas", label: "Empresas", icon: Truck },
    { to: "/clientes", label: "Clientes", icon: Building2, roles: ["admin"] },
    { to: "/projetos", label: "Projetos", icon: FolderKanban, roles: ["admin"] }
  ] },
  { key: "compliance", label: "Conformidade", items: [
    { to: "/documentos", label: "Documentos", icon: FileBadge },
    { to: "/credenciais", label: "Credenciais", icon: KeyRound }
  ] },
  { key: "reports", label: "Relatórios", items: [
    { to: "/exportar", label: "Exportar dados", icon: FileSpreadsheet }
  ] },
  { key: "import", label: "Importação", items: [
    { to: "/importar", label: "Importar dados", icon: FileUp, roles: ["admin"] }
  ] },
  { key: "admin", label: "Administração", items: [
    { to: "/administracao", label: "Administração", icon: Users, roles: ["admin"] },
    { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] }
  ] }
];

const defaultGroups = Object.fromEntries(menuGroups.map((group) => [group.key, true]));

export function isMenuItemActive(pathname: string, target: string) {
  if (target === "/") return pathname === "/";
  if (target === "/vistorias") return pathname === target || (/^\/vistorias\/[^/]+$/.test(pathname) && pathname !== "/vistorias/nova");
  return pathname === target;
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("meta.sidebar.compact") === "true");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return { ...defaultGroups, ...JSON.parse(localStorage.getItem("meta.sidebar.groups") || "{}") }; }
    catch { return defaultGroups; }
  });

  useEffect(() => localStorage.setItem("meta.sidebar.compact", String(collapsed)), [collapsed]);
  useEffect(() => localStorage.setItem("meta.sidebar.groups", JSON.stringify(openGroups)), [openGroups]);
  useEffect(() => {
    const currentGroup = menuGroups.find((group) => group.items.some((item) => isMenuItemActive(location.pathname, item.to)));
    if (currentGroup) setOpenGroups((current) => current[currentGroup.key] ? current : { ...current, [currentGroup.key]: true });
    setProfileOpen(false);
  }, [location.pathname]);

  const toggleGroup = (key: string) => setOpenGroups((current) => ({ ...current, [key]: !current[key] }));

  return <div className={`app-shell ${collapsed ? "sidebar-compact" : ""}`}>
    <aside className={`sidebar ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebar-brand">
        <img src="/assets/logo-meta-branca.png" alt="Meta Central de Serviços"/>
        <span className="brand-monogram" aria-hidden="true">M</span>
        <button className="icon-button sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}
        </button>
        <button className="icon-button sidebar-close" onClick={() => setOpen(false)} aria-label="Fechar menu"><X/></button>
      </div>
      <nav aria-label="Menu principal">
        {menuGroups.map((group) => {
          const visibleItems = group.items.filter((item) => !item.roles || item.roles.includes(user!.role));
          if (!visibleItems.length) return null;
          const expanded = collapsed || openGroups[group.key];
          return <section className="nav-group" key={group.key}>
            <button className="nav-group-toggle" onClick={() => toggleGroup(group.key)} aria-expanded={expanded}>
              <span>{group.label}</span><ChevronDown className={expanded ? "rotated" : ""}/>
            </button>
            {expanded && <div className="nav-group-links">{visibleItems.map(({ to, label, icon: Icon }) => {
              const active = isMenuItemActive(location.pathname, to);
              return <NavLink key={to} to={to} end title={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={active ? "active" : undefined} onClick={() => setOpen(false)}>
                <Icon size={19}/><span>{label}</span>
              </NavLink>;
            })}</div>}
          </section>;
        })}
      </nav>
      <div className="sidebar-foot"><ShieldCheck size={17}/><span>Ambiente corporativo seguro</span></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Fechar menu"/>}
    <div className="app-main">
      <header className="topbar">
        <button className="icon-button mobile-menu" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu/></button>
        <div className="topbar-title"><strong>Meta Gestão Veicular</strong><span>Controle operacional e conformidade</span></div>
        <div className="user-menu">
          <button onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}>
            <span className="avatar">{user!.name.slice(0, 1)}</span>
            <span className="user-copy"><strong>{user!.name}</strong><small>{({ admin: "Administrador", inspector: "Fiscalizador", supplier: "Fornecedor" })[user!.role]}</small></span>
            <ChevronDown size={16}/>
          </button>
          {profileOpen && <div className="user-popover"><span>{user!.email}</span><button onClick={signOut}>Sair</button></div>}
        </div>
      </header>
      <main className="page"><Outlet/></main>
    </div>
  </div>;
}
