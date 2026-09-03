import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Login } from "./components/Login";
import { AppLayout } from "./components/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { Inspections } from "./pages/Inspections";
import { NewInspection } from "./pages/NewInspection";
import { InspectionReport } from "./pages/InspectionReport";
import { EntityPage } from "./pages/EntityPage";
import { Documents } from "./pages/Documents";
import { Credentials } from "./pages/Credentials";
import { ExportData } from "./pages/ExportData";
import { Administration } from "./pages/Administration";
import { SettingsPage } from "./pages/SettingsPage";
import { ImportData } from "./pages/ImportData";

function Admin({ children }: { children: ReactNode }) { const { user } = useAuth(); return user?.role === "admin" ? children : <Navigate to="/" replace/>; }
function Inspector({ children }: { children: ReactNode }) { const { user } = useAuth(); return user && ["admin", "inspector"].includes(user.role) ? children : <Navigate to="/" replace/>; }

export default function App() {
  const { user, loading, phase } = useAuth();
  if (loading) return <div className="splash"><img src="/assets/logo-meta-azul.png" alt="Meta"/><span>{phase === "validating" ? "Validando sua sessão…" : "Carregando ambiente seguro…"}</span></div>;
  if (!user) return <Login/>;
  return <Routes><Route element={<AppLayout/>}>
    <Route index element={<Dashboard/>}/>
    <Route path="vistorias" element={<Inspections/>}/>
    <Route path="vistorias/nova" element={<Inspector><NewInspection/></Inspector>}/>
    <Route path="vistorias/:id" element={<InspectionReport/>}/>
    <Route path="vistorias/:id/editar" element={<Inspector><NewInspection/></Inspector>}/>
    <Route path="reprovacoes" element={<Inspections rejectedOnly/>}/>
    <Route path="veiculos" element={<EntityPage entity="vehicles"/>}/>
    <Route path="motoristas" element={<EntityPage entity="drivers"/>}/>
    <Route path="empresas" element={<EntityPage entity="companies"/>}/>
    <Route path="clientes" element={<Admin><EntityPage entity="clients"/></Admin>}/>
    <Route path="projetos" element={<Admin><EntityPage entity="projects"/></Admin>}/>
    <Route path="documentos" element={<Documents/>}/>
    <Route path="credenciais" element={<Credentials/>}/>
    <Route path="exportar" element={<ExportData/>}/>
    <Route path="administracao" element={<Admin><Administration/></Admin>}/>
    <Route path="importar" element={<Admin><ImportData/></Admin>}/>
    <Route path="configuracoes" element={<Admin><SettingsPage/></Admin>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Route></Routes>;
}
