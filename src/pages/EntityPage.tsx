import { Fragment, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { ClientLogoPanel } from "../components/ClientLogoPanel";
import { EntityDocumentsPanel, type PendingDocument } from "../components/EntityDocumentsPanel";
import { FormModal } from "../components/FormModal";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatCnpj, formatDate, onlyDigits, text } from "../lib/format";
import { uploadManagedFile } from "../lib/files";
import { refreshEntityQueries } from "../lib/queryCache";
import type { Entity, PageResult } from "../types";

type EntityName = "clients" | "projects" | "companies" | "drivers" | "vehicles" | "accessProfiles" | "users";
type FieldType = "text" | "number" | "date" | "email" | "phone" | "select" | "checkbox" | "multiselect" | "cnpj" | "color";
type Field = {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  options?: [string, string][];
  source?: EntityName;
  group?: string;
  help?: string;
  placeholder?: string;
  full?: boolean;
  showWhen?: (form: Record<string, unknown>) => boolean;
};
type PageMeta = { title: string; description: string; singular: string; columns: [string, string][]; fields: Field[] };

const meta: Record<EntityName, PageMeta> = {
  clients: {
    title: "Clientes", description: "Organizações contratantes e identidades visuais atendidas.", singular: "cliente",
    columns: [["name", "Nome fantasia"], ["legalName", "Razão social"], ["document", "CNPJ"], ["active", "Status"]],
    fields: [
      { key: "legalName", label: "Razão social", required: true, group: "Identificação", placeholder: "Nome empresarial completo" },
      { key: "name", label: "Nome fantasia", required: true, group: "Identificação", placeholder: "Nome usado na operação" },
      { key: "document", label: "CNPJ", type: "cnpj", required: true, group: "Identificação" },
      { key: "active", label: "Cliente ativo", type: "checkbox", group: "Disponibilidade" }
    ]
  },
  projects: {
    title: "Projetos", description: "Projetos e contratos vinculados a cada cliente.", singular: "projeto",
    columns: [["code", "Código"], ["name", "Projeto"], ["active", "Status"]],
    fields: [
      { key: "clientId", label: "Cliente", type: "select", source: "clients", required: true, group: "Vínculo", help: "O projeto ficará disponível somente para empresas deste cliente." },
      { key: "name", label: "Nome do projeto", required: true, group: "Identificação", placeholder: "Ex.: Operação Florestal" },
      { key: "code", label: "Código", required: true, group: "Identificação", placeholder: "Código interno do contrato" },
      { key: "active", label: "Projeto ativo", type: "checkbox", group: "Disponibilidade" }
    ]
  },
  companies: {
    title: "Empresas", description: "Fornecedores, contratadas e unidades participantes da operação.", singular: "empresa",
    columns: [["legalName", "Razão social"], ["document", "CNPJ"], ["unit", "Unidade"], ["contractType", "Contrato"], ["active", "Status"]],
    fields: [
      { key: "clientId", label: "Cliente atendido", type: "select", source: "clients", required: true, group: "Vínculo principal", help: "Define quais projetos e perfis de circulação estarão disponíveis." },
      { key: "legalName", label: "Razão social", required: true, group: "Identificação", placeholder: "Nome empresarial completo" },
      { key: "tradeName", label: "Nome fantasia", group: "Identificação" },
      { key: "document", label: "CNPJ", type: "cnpj", required: true, group: "Identificação" },
      { key: "unit", label: "Unidade", group: "Contato e operação", placeholder: "Ex.: Unidade Monte Alegre" },
      { key: "managerName", label: "Responsável", group: "Contato e operação" },
      { key: "phone", label: "Telefone", type: "phone", group: "Contato e operação", placeholder: "(00) 00000-0000" },
      { key: "email", label: "E-mail", type: "email", group: "Contato e operação", placeholder: "responsavel@empresa.com.br" },
      { key: "contractNumber", label: "Número do contrato", group: "Contrato" },
      { key: "contractType", label: "Tipo de contrato", type: "select", options: [["direct", "Direto"], ["subcontractor", "Subcontratado"]], required: true, group: "Contrato" },
      { key: "parentCompanyId", label: "Empresa contratante", type: "select", source: "companies", required: true, group: "Contrato", help: "Obrigatório quando a empresa é subcontratada.", showWhen: (form) => form.contractType === "subcontractor" },
      { key: "contractStart", label: "Início do contrato", type: "date", group: "Contrato" },
      { key: "contractEnd", label: "Fim do contrato", type: "date", group: "Contrato" },
      { key: "projectIds", label: "Projetos autorizados", type: "multiselect", source: "projects", group: "Vínculos operacionais", full: true, help: "Selecione todos os projetos em que esta empresa pode atuar." },
      { key: "active", label: "Empresa ativa", type: "checkbox", group: "Disponibilidade" }
    ]
  },
  drivers: {
    title: "Motoristas", description: "Condutores habilitados e vinculados às empresas.", singular: "motorista",
    columns: [["name", "Nome"], ["registration", "Matrícula"], ["licenseCategory", "CNH"], ["licenseExpiry", "Validade"], ["active", "Status"]],
    fields: [
      { key: "companyId", label: "Empresa", type: "select", source: "companies", required: true, group: "Vínculo" },
      { key: "name", label: "Nome", required: true, group: "Identificação" },
      { key: "registration", label: "Matrícula", required: true, group: "Identificação" },
      { key: "jobTitle", label: "Função", group: "Identificação" },
      { key: "licenseCategory", label: "Categoria da CNH", required: true, group: "Habilitação", placeholder: "Ex.: D" },
      { key: "licenseNumber", label: "Número da CNH", group: "Habilitação" },
      { key: "licenseExpiry", label: "Validade da CNH", type: "date", required: true, group: "Habilitação" },
      { key: "provisionalLicense", label: "CNH provisória", type: "checkbox", group: "Habilitação" },
      { key: "active", label: "Motorista ativo", type: "checkbox", group: "Disponibilidade" }
    ]
  },
  accessProfiles: {
    title: "Perfis de circulação e acesso", description: "Defina portarias e áreas permitidas para veículos na operação.", singular: "perfil de acesso",
    columns: [["name", "Perfil"], ["description", "Descrição"], ["color", "Cor"], ["active", "Status"]],
    fields: [
      { key: "clientId", label: "Cliente", type: "select", source: "clients", group: "Escopo", help: "Sem cliente, o perfil será global e poderá ser usado em qualquer operação." },
      { key: "name", label: "Nome do perfil", required: true, group: "Identificação", placeholder: "Ex.: Acesso industrial completo" },
      { key: "description", label: "Descrição", group: "Identificação", full: true, placeholder: "Explique quando este perfil deve ser utilizado" },
      { key: "color", label: "Cor de identificação", type: "color", group: "Identificação" },
      { key: "gates", label: "Portarias autorizadas", group: "Permissões", full: true, help: "Separe múltiplas portarias por vírgula.", placeholder: "Portaria Norte, Portaria Industrial" },
      { key: "areas", label: "Áreas autorizadas", group: "Permissões", full: true, help: "Separe múltiplas áreas por vírgula.", placeholder: "Pátio, Oficina, Área administrativa" },
      { key: "active", label: "Perfil ativo", type: "checkbox", group: "Disponibilidade" }
    ]
  },
  vehicles: {
    title: "Veículos", description: "Frota, vínculos operacionais e quilometragem atual.", singular: "veículo",
    columns: [["plate", "Placa"], ["brand", "Marca"], ["model", "Modelo"], ["year", "Ano"], ["mileage", "Quilometragem"], ["active", "Status"]],
    fields: [
      { key: "companyId", label: "Empresa responsável", type: "select", source: "companies", required: true, group: "Vínculos operacionais", help: "A empresa define os projetos, motoristas e perfis compatíveis." },
      { key: "projectId", label: "Projeto", type: "select", source: "projects", required: true, group: "Vínculos operacionais" },
      { key: "accessProfileId", label: "Perfil de circulação e acesso", type: "select", source: "accessProfiles", required: true, group: "Vínculos operacionais", help: "Define as portarias e áreas em que o veículo está autorizado a circular.", full: true },
      { key: "plate", label: "Placa", required: true, group: "Identificação do veículo", placeholder: "ABC1D23" },
      { key: "brand", label: "Marca", required: true, group: "Identificação do veículo" },
      { key: "model", label: "Modelo", required: true, group: "Identificação do veículo" },
      { key: "year", label: "Ano", type: "number", required: true, group: "Identificação do veículo" },
      { key: "type", label: "Tipo", type: "select", options: [["Carro", "Carro"], ["Van", "Van"], ["Caminhão", "Caminhão"], ["Utilitário", "Utilitário"], ["Moto", "Moto"], ["Outro", "Outro"]], required: true, group: "Características" },
      { key: "color", label: "Cor", group: "Características" },
      { key: "fuel", label: "Combustível", group: "Características" },
      { key: "mileage", label: "Quilometragem", type: "number", required: true, group: "Características" },
      { key: "ownership", label: "Propriedade", type: "select", options: [["owned", "Próprio"], ["rented", "Locado"]], required: true, group: "Propriedade" },
      { key: "rentalCompany", label: "Locadora", group: "Propriedade", showWhen: (form) => form.ownership === "rented" },
      { key: "driverIds", label: "Motoristas autorizados", type: "multiselect", source: "drivers", group: "Motoristas", full: true, help: "Somente motoristas ativos da empresa selecionada aparecem aqui." },
      { key: "active", label: "Veículo ativo", type: "checkbox", group: "Disponibilidade" }
    ]
  },
  users: {
    title: "Usuários", description: "Perfis internos associados às identidades corporativas do Microsoft Entra ID.", singular: "usuário",
    columns: [["name", "Nome"], ["email", "E-mail"], ["role", "Perfil"], ["active", "Status"]],
    fields: [
      { key: "identityProviderId", label: "ID da identidade Microsoft", required: true, group: "Identidade", help: "Identificador fornecido pelo Microsoft Entra ID; não é uma senha." },
      { key: "name", label: "Nome", required: true, group: "Identidade" },
      { key: "email", label: "E-mail corporativo", type: "email", required: true, group: "Identidade" },
      { key: "role", label: "Papel de acesso", type: "select", options: [["admin", "Administrador"], ["inspector", "Fiscalizador"], ["supplier", "Fornecedor"]], required: true, group: "Permissões" },
      { key: "companyId", label: "Empresa", type: "select", source: "companies", group: "Permissões", help: "Obrigatória para usuários com papel Fornecedor." },
      { key: "active", label: "Usuário ativo", type: "checkbox", group: "Disponibilidade" }
    ]
  }
};

const prerequisites: Partial<Record<EntityName, { source: EntityName; label: string; path: string }>> = {
  projects: { source: "clients", label: "cliente", path: "/clientes" },
  companies: { source: "clients", label: "cliente", path: "/clientes" },
  drivers: { source: "companies", label: "empresa", path: "/empresas" },
  vehicles: { source: "companies", label: "empresa", path: "/empresas" }
};

const labelFor = (entity: Entity) => String(entity.name || entity.legalName || entity.plate || entity.code || entity.id);
const defaults = (fields: Field[]) => Object.fromEntries(fields.map((field) => [field.key, field.type === "checkbox" ? true : field.type === "multiselect" ? [] : field.key === "color" ? "#0056A4" : ""]));
const formatPhone = (value: unknown) => {
  const digits = onlyDigits(value).slice(0, 11);
  return digits.length > 10 ? digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3") : digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
};

export function EntityPage({ entity }: { entity: EntityName }) {
  const config = meta[entity];
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Entity | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(defaults(config.fields));
  const [message, setMessage] = useState("");
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [clientLogoFile, setClientLogoFile] = useState<File | null>(null);
  const [clientLogoRemoved, setClientLogoRemoved] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: [entity], queryFn: () => api<PageResult<Entity>>(`/${entity}?pageSize=100`) });
  const sources = [...new Set(config.fields.map((field) => field.source).filter(Boolean))] as EntityName[];
  const sourceResults = useQueries({ queries: sources.map((source) => ({ queryKey: [source, "options"], queryFn: () => api<PageResult<Entity>>(`/${source}?pageSize=100&active=true`) })) });
  const sourceQueries = sources.map((source, index) => ({ source, result: sourceResults[index] }));

  const mutation = useMutation({
    mutationFn: async () => {
      const isUpdate = Boolean(editing?.id);
      const saved = await api<Entity>(isUpdate ? `/${entity}/${editing!.id}` : `/${entity}`, { method: isUpdate ? "PUT" : "POST", body: JSON.stringify(normalize(form, config.fields)) });
      const warnings: string[] = [];
      if (entity === "clients") {
        if (clientLogoFile) {
          try {
            const uploaded = await uploadManagedFile({ kind: "client-branding", entityId: saved.id }, clientLogoFile);
            saved.logoBlobPath = uploaded.blobPath;
          } catch (reason) { warnings.push(`A logo não foi enviada: ${(reason as Error).message}`); }
        } else if (clientLogoRemoved && editing?.id && editing.logoBlobPath) {
          try { await api(`/clients/${saved.id}/logo`, { method: "DELETE" }); saved.logoBlobPath = null; }
          catch (reason) { warnings.push(`A logo não foi removida: ${(reason as Error).message}`); }
        }
      }
      const documentEntity = entity === "companies" ? "company" : entity === "drivers" ? "driver" : entity === "vehicles" ? "vehicle" : null;
      if (documentEntity) {
        for (const document of pendingDocuments) {
          try {
            await uploadManagedFile({
              kind: `${documentEntity}-document`, entityId: saved.id, documentType: document.documentType,
              label: document.label, issueDate: document.issueDate || null, expiryDate: document.expiryDate || null,
              observation: document.observation
            }, document.file);
          } catch (reason) { warnings.push(`“${document.label}” não foi enviado: ${(reason as Error).message}`); }
        }
      }
      return { saved, warnings };
    },
    onSuccess: ({ saved, warnings }) => {
      void refreshEntityQueries(queryClient, entity, saved);
      void queryClient.invalidateQueries({ queryKey: ["documents"] });
      setEditing(null);
      setForm(defaults(config.fields));
      setPendingDocuments([]); setClientLogoFile(null); setClientLogoRemoved(false);
      setMessage(warnings.length ? `Registro salvo. ${warnings.join(" ")}` : "Registro salvo com sucesso.");
    },
    onError: (reason: Error) => setMessage(reason.message)
  });

  const sourceItems = (source?: EntityName) => sourceQueries.find((query) => query.source === source)?.result.data?.items || [];
  const options = (source?: EntityName) => {
    const candidates = sourceItems(source);
    if (entity === "companies" && source === "projects") return candidates.filter((item) => item.clientId === form.clientId);
    if (entity === "companies" && source === "companies") return candidates.filter((item) => item.clientId === form.clientId && item.id !== editing?.id);
    if (entity === "vehicles") {
      const company = sourceItems("companies").find((item) => item.id === form.companyId);
      if (source === "projects") return candidates.filter((item) => Array.isArray(company?.projectIds) && company.projectIds.includes(item.id));
      if (source === "drivers") return candidates.filter((item) => item.companyId === form.companyId);
      if (source === "accessProfiles") return candidates.filter((item) => !item.clientId || item.clientId === company?.clientId);
    }
    return candidates;
  };

  const updateField = (key: string, value: unknown) => {
    const next = { ...form, [key]: value };
    if (key === "clientId" && entity === "companies") { next.parentCompanyId = ""; next.projectIds = []; }
    if (key === "companyId" && entity === "vehicles") { next.projectId = ""; next.accessProfileId = ""; next.driverIds = []; }
    if (key === "contractType" && value !== "subcontractor") next.parentCompanyId = "";
    if (key === "ownership" && value !== "rented") next.rentalCompany = "";
    setForm(next);
    if (message) setMessage("");
  };

  const prerequisite = prerequisites[entity];
  const prerequisiteQuery = sourceQueries.find((query) => query.source === prerequisite?.source)?.result;
  const missingPrerequisite = Boolean(prerequisite && !prerequisiteQuery?.isLoading && !prerequisiteQuery?.data?.items.length);
  const accessProfilesQuery = sourceQueries.find((query) => query.source === "accessProfiles")?.result;
  const missingAccessProfiles = entity === "vehicles" && !accessProfilesQuery?.isLoading && !accessProfilesQuery?.data?.items.length;
  const items = useMemo(() => (data?.items || []).filter((item) => Object.values(item).join(" ").toLowerCase().includes(search.toLowerCase())), [data, search]);
  const canWrite = user?.role === "admin" || (["drivers", "vehicles"].includes(entity) && user?.role === "supplier");

  const open = (item?: Entity) => {
    setEditing(item || ({ id: "" } as Entity));
    const next = { ...defaults(config.fields), ...(item || {}) };
    for (const field of config.fields.filter((field) => ["gates", "areas"].includes(field.key))) {
      if (Array.isArray(next[field.key])) next[field.key] = (next[field.key] as string[]).join(", ");
    }
    setForm(next);
    setPendingDocuments([]); setClientLogoFile(null); setClientLogoRemoved(false);
    setMessage("");
  };

  const isFieldDisabled = (field: Field) => Boolean(
    (entity === "vehicles" && ["projectId", "accessProfileId"].includes(field.key) && !form.companyId) ||
    (entity === "vehicles" && field.key === "driverIds" && !form.companyId) ||
    (entity === "companies" && ["parentCompanyId", "projectIds"].includes(field.key) && !form.clientId)
  );

  const fieldHelp = (field: Field) => {
    const fieldOptions = options(field.source);
    if (entity === "vehicles" && field.key === "projectId") {
      if (!form.companyId) return "Selecione a empresa para liberar os projetos autorizados.";
      if (!fieldOptions.length) return "A empresa selecionada não possui projeto ativo vinculado.";
    }
    if (entity === "vehicles" && field.key === "accessProfileId") {
      if (!form.companyId) return "Selecione a empresa para buscar perfis globais ou do mesmo cliente.";
      if (!fieldOptions.length) return user?.role === "admin" ? <>Nenhum perfil compatível foi encontrado. <Link to="/administracao?tab=accessProfiles">Configurar perfis de acesso</Link>.</> : "Nenhum perfil compatível foi encontrado. Solicite a configuração a um administrador.";
    }
    if (entity === "vehicles" && field.key === "driverIds" && form.companyId && !fieldOptions.length) return "Nenhum motorista ativo está vinculado a esta empresa.";
    return field.help;
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const missing = config.fields.find((field) => field.required && field.showWhen?.(form) !== false && (form[field.key] === "" || form[field.key] === undefined || (Array.isArray(form[field.key]) && !(form[field.key] as unknown[]).length)));
    if (missing) { setMessage(`Preencha o campo obrigatório “${missing.label}”.`); return; }
    mutation.mutate();
  };

  return <>
    <PageHeader eyebrow="Cadastros" title={config.title} description={config.description} actions={canWrite && !missingPrerequisite && !missingAccessProfiles ? <button className="button primary" onClick={() => open()}><Plus size={18}/> Novo {config.singular}</button> : undefined}/>
    {missingPrerequisite && prerequisite && <div className="alert info" role="status">Cadastre ao menos um {prerequisite.label} ativo antes de criar este registro. <Link to={prerequisite.path}>Ir para o cadastro</Link>.</div>}
    {missingAccessProfiles && <div className="alert info" role="status">Veículos precisam de um perfil de circulação ativo. {user?.role === "admin" ? <Link to="/administracao?tab=accessProfiles">Configurar perfis agora</Link> : "Solicite a configuração a um administrador."}</div>}
    {message && !editing && <div className="alert success" role="status">{message}</div>}
    <section className="card">
      <div className="toolbar"><label className="search"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar em ${config.title.toLowerCase()}`} aria-label={`Buscar em ${config.title}`}/></label></div>
      {isLoading ? <div className="loading">Carregando…</div> : isError ? <EmptyState title="Não foi possível carregar os registros" text={error instanceof Error ? error.message : "Tente novamente em alguns instantes."} action={<button className="button secondary" onClick={() => void refetch()}>Tentar novamente</button>}/> : items.length ? <div className="table-scroll"><table><thead><tr>{config.columns.map(([, columnLabel]) => <th key={columnLabel}>{columnLabel}</th>)}{canWrite && <th><span className="sr-only">Ações</span></th>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}>{config.columns.map(([key]) => <td key={key}>{key === "active" ? <StatusBadge value={Boolean(item[key])}/> : key.toLowerCase().includes("expiry") ? formatDate(item[key]) : key === "document" ? formatCnpj(item[key]) : key === "plate" ? <span className="plate">{text(item[key])}</span> : key === "contractType" ? (item[key] === "direct" ? "Direto" : "Subcontratado") : text(item[key])}</td>)}{canWrite && <td><button className="table-action" onClick={() => open(item)}><Edit3 size={16}/> Editar</button></td>}</tr>)}</tbody></table></div> : <EmptyState title={missingPrerequisite ? `Cadastre primeiro um ${prerequisite?.label}` : "Nenhum registro encontrado"} text={missingPrerequisite ? "Esta etapa depende de um cadastro ativo anterior." : "Os registros cadastrados aparecerão aqui."} action={missingPrerequisite && prerequisite ? <Link className="button secondary" to={prerequisite.path}>Ir para o cadastro</Link> : undefined}/>}</section>

    {editing && <FormModal
      title={editing.id ? `Editar ${config.singular}` : `Novo ${config.singular}`}
      onClose={() => setEditing(null)}
      onSubmit={submit}
      pending={mutation.isPending}
      feedback={message ? <div className={`alert ${mutation.isError ? "error" : "info"}`} role="alert">{message}</div> : undefined}
    >
      <div className="form-grid entity-form-grid">
        {config.fields.map((field, index) => {
          if (field.showWhen?.(form) === false) return null;
          const previousVisible = config.fields.slice(0, index).filter((candidate) => candidate.showWhen?.(form) !== false).at(-1);
          const beginsGroup = field.group && field.group !== previousVisible?.group;
          const fieldId = `${entity}-${field.key}`;
          const fieldOptions = options(field.source);
          const help = fieldHelp(field);
          const selected = Array.isArray(form[field.key]) ? form[field.key] as string[] : [];
          return <Fragment key={field.key}>
            {beginsGroup && <div className="form-section-title"><span>{field.group}</span></div>}
            {field.type === "checkbox" ? <label className={`check-field ${field.full ? "field-full" : ""}`} htmlFor={fieldId}>
              <input id={fieldId} type="checkbox" checked={Boolean(form[field.key])} onChange={(event) => updateField(field.key, event.target.checked)}/><span>{field.label}</span>
            </label> : <div className={`field ${field.full ? "field-full" : ""}`}>
              <label htmlFor={fieldId}>{field.label}{field.required && <span className="required-mark" aria-label="obrigatório"> *</span>}</label>
              {field.type === "select" ? <select id={fieldId} required={field.required} value={String(form[field.key] || "")} onChange={(event) => updateField(field.key, event.target.value)} disabled={isFieldDisabled(field)}>
                <option value="">Selecione uma opção</option>
                {field.options?.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}
                {fieldOptions.map((option) => <option key={option.id} value={option.id}>{labelFor(option)}</option>)}
              </select> : field.type === "multiselect" ? <div id={fieldId} className={`multi-select-list ${isFieldDisabled(field) ? "disabled" : ""}`} role="group" aria-label={field.label}>
                {fieldOptions.length ? fieldOptions.map((option) => <label key={option.id}><input type="checkbox" checked={selected.includes(option.id)} disabled={isFieldDisabled(field)} onChange={(event) => updateField(field.key, event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id))}/><span>{labelFor(option)}</span></label>) : <span className="multi-select-empty">Nenhuma opção disponível</span>}
              </div> : field.type === "cnpj" ? <input id={fieldId} required={field.required} inputMode="numeric" autoComplete="off" maxLength={18} value={formatCnpj(form[field.key])} onChange={(event) => updateField(field.key, formatCnpj(event.target.value))} placeholder="00.000.000/0000-00"/> : field.type === "phone" ? <input id={fieldId} type="tel" inputMode="tel" autoComplete="tel" maxLength={15} value={formatPhone(form[field.key])} onChange={(event) => updateField(field.key, formatPhone(event.target.value))} placeholder={field.placeholder}/> : field.type === "color" ? <div className="color-field"><input id={fieldId} type="color" value={String(form[field.key] || "#0056A4")} onChange={(event) => updateField(field.key, event.target.value)}/><span>{String(form[field.key] || "#0056A4").toUpperCase()}</span></div> : <input id={fieldId} required={field.required} type={field.type || "text"} min={field.type === "number" ? 0 : undefined} autoComplete={field.type === "email" ? "email" : "off"} value={String(form[field.key] ?? "")} onChange={(event) => updateField(field.key, field.key === "plate" ? event.target.value.toUpperCase() : event.target.value)} placeholder={field.placeholder}/>} 
              {help && <small className="field-help">{help}</small>}
            </div>}
          </Fragment>;
        })}
        {entity === "clients" && <ClientLogoPanel clientId={editing.id || undefined} logoBlobPath={String(editing.logoBlobPath || "")} file={clientLogoFile} removed={clientLogoRemoved} onFileChange={setClientLogoFile} onRemovedChange={setClientLogoRemoved}/>} 
        {(["companies", "drivers", "vehicles"] as EntityName[]).includes(entity) && <EntityDocumentsPanel entityType={entity === "companies" ? "company" : entity === "drivers" ? "driver" : "vehicle"} entityId={editing.id || undefined} pending={pendingDocuments} onPendingChange={setPendingDocuments} canWrite={Boolean(canWrite)}/>} 
      </div>
    </FormModal>}
  </>;
}

function normalize(form: Record<string, unknown>, fields: Field[]) {
  const output = { ...form };
  for (const field of fields) {
    if (field.showWhen?.(form) === false) { delete output[field.key]; continue; }
    if (field.type === "number") output[field.key] = Number(output[field.key]);
    if (field.type === "cnpj" || field.type === "phone") output[field.key] = onlyDigits(output[field.key]);
    if (["gates", "areas"].includes(field.key) && typeof output[field.key] === "string") output[field.key] = String(output[field.key]).split(",").map((value) => value.trim()).filter(Boolean);
    if (!field.required && (output[field.key] === "" || output[field.key] === null)) delete output[field.key];
  }
  return output;
}
