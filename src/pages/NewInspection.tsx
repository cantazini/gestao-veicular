import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueries } from "@tanstack/react-query";
import { Building2, Camera, Car, Check, ChevronLeft, ChevronRight, FolderKanban, ImagePlus, Save, Trash2, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { CHECKLIST_GROUPS, newChecklist } from "../data/checklist";
import { api, mockMode } from "../lib/api";
import { currentTime, today } from "../lib/format";
import { prepareImage, type PreparedImage } from "../lib/images";
import type { ChecklistStatus, Entity, Inspection, PageResult } from "../types";

const photoSlots = [["front", "Frontal"], ["rear", "Traseira"], ["left", "Lateral esquerda"], ["right", "Lateral direita"], ["cabin", "Cabine / interior"], ["dashboard", "Painel"], ["additional-1", "Adicional 1"], ["additional-2", "Adicional 2"]] as const;
const steps = ["Identificação", "Checklist", "Fotografias", "Revisão"];
const label = (item?: Entity) => String(item?.name || item?.legalName || item?.plate || "—");

export function NewInspection() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ companyId: "", projectId: "", vehicleId: "", driverId: "", inspectionDate: today(), inspectionTime: currentTime(), mileage: 0, generalObservations: "" });
  const [items, setItems] = useState(newChecklist());
  const [photos, setPhotos] = useState<Record<string, PreparedImage>>({});
  const [error, setError] = useState("");
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => () => Object.values(photosRef.current).forEach((photo) => URL.revokeObjectURL(photo.preview)), []);
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }, [step]);

  const optionNames = ["companies", "projects", "vehicles", "drivers"] as const;
  const optionQueries = useQueries({ queries: optionNames.map((name) => ({ queryKey: [name, "inspection-options"], queryFn: () => api<PageResult<Entity>>(`/${name}?pageSize=100&active=true`) })) });
  const [companies, projects, vehicles, drivers] = optionQueries.map((query) => query.data?.items || []);
  const optionsLoading = optionQueries.some((query) => query.isLoading);
  const optionsError = optionQueries.find((query) => query.isError)?.error;
  const selectedCompany = companies.find((company) => company.id === form.companyId);
  const selectedProject = projects.find((project) => project.id === form.projectId);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === form.vehicleId);
  const selectedDriver = drivers.find((driver) => driver.id === form.driverId);
  const companyProjectIds = (selectedCompany?.projectIds as string[] || []);
  const filteredProjects = projects.filter((project) => companyProjectIds.includes(project.id));
  const filteredVehicles = vehicles.filter((vehicle) => vehicle.companyId === form.companyId && (!form.projectId || vehicle.projectId === form.projectId));
  const vehicleDriverIds = (selectedVehicle?.driverIds as string[] || []);
  const filteredDrivers = drivers.filter((driver) => driver.companyId === form.companyId && vehicleDriverIds.includes(driver.id));

  const summary = useMemo(() => {
    const applicable = items.filter((item) => item.status !== "nao_se_aplica");
    const compliant = items.filter((item) => item.status === "conforme").length;
    const nonCompliant = items.filter((item) => item.status === "nao_conforme").length;
    return { compliant, nonCompliant, notApplicable: items.length - applicable.length, percentage: applicable.length ? Number((compliant / applicable.length * 100).toFixed(1)) : 0 };
  }, [items]);

  const mutation = useMutation({
    mutationFn: async () => {
      const missingObservation = items.find((item) => item.status === "nao_conforme" && !item.observation.trim());
      if (missingObservation) throw new Error(`Descreva a não conformidade em “${missingObservation.label}”.`);
      const localPhotos = mockMode ? Object.entries(photos).map(([type, photo]) => ({ id: crypto.randomUUID(), photoType: type, label: photoSlots.find((slot) => slot[0] === type)?.[1] || "Fotografia", url: photo.preview })) : undefined;
      const inspection = await api<Inspection>("/inspections", { method: "POST", body: JSON.stringify({ ...form, mileage: Number(form.mileage), items, ...(localPhotos ? { photos: localPhotos } : {}) }) });
      if (!mockMode) {
        for (const [type, image] of Object.entries(photos)) {
          const photoLabel = photoSlots.find((slot) => slot[0] === type)?.[1] || "Fotografia";
          const ticket = await api<{ blobPath: string; uploadUrl: string }>("/files/upload-url", { method: "POST", body: JSON.stringify({ kind: "inspection-photo", entityId: inspection.id, fileName: image.fileName, mimeType: image.mimeType, size: image.blob.size }) });
          const upload = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "x-ms-blob-type": "BlockBlob", "Content-Type": image.mimeType }, body: image.blob });
          if (!upload.ok) throw new Error(`A vistoria foi salva, mas a foto “${photoLabel}” não pôde ser enviada.`);
          await api("/files/complete", { method: "POST", body: JSON.stringify({ kind: "inspection-photo", entityId: inspection.id, blobPath: ticket.blobPath, fileName: image.fileName, mimeType: image.mimeType, size: image.blob.size, originalSize: image.originalSize, width: image.width, height: image.height, photoType: type, label: photoLabel }) });
        }
      }
      return inspection;
    },
    onSuccess: (inspection) => navigate(`/vistorias/${inspection.id}`),
    onError: (reason: Error) => setError(reason.message)
  });

  const updateStatus = (key: string, status: ChecklistStatus) => setItems((current) => current.map((item) => item.key === key ? { ...item, status, observation: status === "nao_conforme" ? item.observation : "" } : item));
  const selectPhoto = async (type: string, file?: File) => {
    if (!file) return;
    try {
      const image = await prepareImage(file);
      if (photos[type]) URL.revokeObjectURL(photos[type].preview);
      setPhotos((current) => ({ ...current, [type]: image }));
      setError("");
    } catch (reason) { setError((reason as Error).message); }
  };

  const mileageIsValid = Number(form.mileage) >= Number(selectedVehicle?.mileage || 0);
  const canNext = step !== 1 || Boolean(form.companyId && form.projectId && form.vehicleId && form.driverId && form.inspectionDate && form.inspectionTime && mileageIsValid);
  const nextHint = step === 1 && !canNext ? !form.companyId ? "Comece selecionando a empresa." : !form.projectId ? "Selecione um projeto autorizado." : !form.vehicleId ? "Selecione um veículo do projeto." : !form.driverId ? "Selecione um motorista vinculado ao veículo." : !mileageIsValid ? "A quilometragem não pode ser menor que o último registro." : "Preencha data e hora." : "";

  return <>
    <PageHeader eyebrow="Vistorias" title="Nova vistoria" description="Registre a identificação, execute o checklist e anexe evidências em um fluxo guiado."/>
    <section className="wizard-progress" aria-label="Progresso da vistoria">
      <div className="wizard-progress-copy"><span>Etapa {step} de {steps.length}</span><strong>{steps[step - 1]}</strong></div>
      <div className="stepper">{steps.map((name, index) => {
        const stepNumber = index + 1;
        return <button type="button" key={name} aria-current={step === stepNumber ? "step" : undefined} aria-label={`Etapa ${stepNumber}: ${name}`} className={step === stepNumber ? "active" : step > stepNumber ? "done" : ""} onClick={() => step > stepNumber && setStep(stepNumber)}><span>{step > stepNumber ? <Check size={15}/> : stepNumber}</span><small>{name}</small></button>;
      })}</div>
    </section>

    <section className="card inspection-card">
      {step === 1 && (optionsLoading ? <div className="loading">Carregando cadastros…</div> : optionsError ? <EmptyState title="Não foi possível carregar os cadastros" text={optionsError instanceof Error ? optionsError.message : "Tente novamente em alguns instantes."} action={<button className="button secondary" onClick={() => optionQueries.forEach((query) => void query.refetch())}>Tentar novamente</button>}/> : !companies.length ? <EmptyState title="Cadastre uma empresa antes da vistoria" text="A vistoria depende de uma empresa ativa e de seus vínculos operacionais." action={<Link className="button primary" to="/empresas">Ir para Empresas</Link>}/> : <div>
        <div className="section-heading"><span className="section-kicker">Dados operacionais</span><h2>Identificação da vistoria</h2><p>Os campos são liberados conforme os vínculos cadastrados.</p></div>
        <div className="dependency-flow" aria-label="Sequência de seleção">
          <Dependency icon={<Building2/>} label="Empresa" value={label(selectedCompany)} ready={Boolean(selectedCompany)}/>
          <Dependency icon={<FolderKanban/>} label="Projeto" value={label(selectedProject)} ready={Boolean(selectedProject)}/>
          <Dependency icon={<Car/>} label="Veículo" value={selectedVehicle ? `${selectedVehicle.plate} · ${selectedVehicle.model}` : "Aguardando"} ready={Boolean(selectedVehicle)}/>
          <Dependency icon={<UserRound/>} label="Motorista" value={label(selectedDriver)} ready={Boolean(selectedDriver)}/>
        </div>
        <div className="form-grid inspection-fields">
          <Field label="Empresa" required help="Selecione a organização responsável pela operação."><select value={form.companyId} onChange={(event) => { setError(""); setForm({ ...form, companyId: event.target.value, projectId: "", vehicleId: "", driverId: "", mileage: 0 }); }}><option value="">Selecione uma empresa</option>{companies.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></Field>
          <Field label="Projeto" required help={!form.companyId ? "Disponível após selecionar a empresa." : !filteredProjects.length ? "Nenhum projeto autorizado para esta empresa." : "Projetos vinculados à empresa selecionada."}><select value={form.projectId} disabled={!form.companyId} onChange={(event) => { setError(""); setForm({ ...form, projectId: event.target.value, vehicleId: "", driverId: "", mileage: 0 }); }}><option value="">Selecione um projeto</option>{filteredProjects.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></Field>
          <Field label="Veículo" required help={!form.projectId ? "Disponível após selecionar o projeto." : !filteredVehicles.length ? "Nenhum veículo ativo neste projeto." : "A lista respeita empresa e projeto."}><select value={form.vehicleId} disabled={!form.projectId} onChange={(event) => { const vehicle = vehicles.find((item) => item.id === event.target.value); setError(""); setForm({ ...form, vehicleId: event.target.value, projectId: String(vehicle?.projectId || form.projectId), mileage: Number(vehicle?.mileage || 0), driverId: "" }); }}><option value="">Selecione um veículo</option>{filteredVehicles.map((item) => <option key={item.id} value={item.id}>{item.plate} · {item.brand} {item.model}</option>)}</select></Field>
          <Field label="Motorista" required help={!form.vehicleId ? "Disponível após selecionar o veículo." : !filteredDrivers.length ? "Nenhum motorista ativo está vinculado ao veículo." : "Somente condutores autorizados para este veículo."}><select value={form.driverId} disabled={!form.vehicleId} onChange={(event) => { setError(""); setForm({ ...form, driverId: event.target.value }); }}><option value="">Selecione um motorista</option>{filteredDrivers.map((item) => <option key={item.id} value={item.id}>{label(item)}</option>)}</select></Field>
          <Field label="Data" required><input type="date" value={form.inspectionDate} onChange={(event) => setForm({ ...form, inspectionDate: event.target.value })}/></Field>
          <Field label="Hora" required><input type="time" value={form.inspectionTime} onChange={(event) => setForm({ ...form, inspectionTime: event.target.value })}/></Field>
          <Field label="Quilometragem atual" required help={`Último registro: ${Number(selectedVehicle?.mileage || 0).toLocaleString("pt-BR")} km`}><input type="number" min={Number(selectedVehicle?.mileage || 0)} value={form.mileage} onChange={(event) => setForm({ ...form, mileage: Number(event.target.value) })}/></Field>
        </div>
        {selectedVehicle && <div className="selection-summary"><div><span>Veículo selecionado</span><strong>{selectedVehicle.brand} {selectedVehicle.model}</strong></div><div><span>Placa</span><strong className="plate">{selectedVehicle.plate}</strong></div><div><span>Ano</span><strong>{selectedVehicle.year}</strong></div><div><span>Perfil de acesso</span><strong>{String(selectedVehicle.accessProfileName || "Configurado")}</strong></div></div>}
      </div>)}

      {step === 2 && <div>
        <div className="section-heading section-heading-row"><div><span className="section-kicker">Inspeção técnica</span><h2>Checklist oficial</h2><p>Observações são obrigatórias para itens não conformes.</p></div><div className="checklist-overview"><span><strong>{summary.compliant}</strong> conformes</span><span className={summary.nonCompliant ? "has-problem" : ""}><strong>{summary.nonCompliant}</strong> não conformes</span><span><strong>{summary.notApplicable}</strong> N/A</span></div></div>
        {CHECKLIST_GROUPS.map((group) => <section className="check-group" key={group.key}><h3>{group.label}<span>{group.items.length} itens</span></h3>{items.filter((item) => item.categoryKey === group.key).map((item) => <article className={`check-item ${item.status === "nao_conforme" ? "problem" : ""}`} key={item.key}><div className="check-label"><strong>{item.label}</strong>{item.status === "nao_conforme" && <input autoFocus placeholder="Descreva o problema encontrado *" value={item.observation} onChange={(event) => setItems((current) => current.map((currentItem) => currentItem.key === item.key ? { ...currentItem, observation: event.target.value } : currentItem))}/>}</div><div className="segmented" role="group" aria-label={`Resultado de ${item.label}`}>{(["conforme", "nao_conforme", "nao_se_aplica"] as ChecklistStatus[]).map((status) => <button type="button" className={item.status === status ? `selected ${status}` : ""} aria-pressed={item.status === status} onClick={() => updateStatus(item.key, status)} key={status}>{status === "conforme" ? "Conforme" : status === "nao_conforme" ? "Não conforme" : "N/A"}</button>)}</div></article>)}</section>)}
      </div>}

      {step === 3 && <div>
        <div className="section-heading section-heading-row"><div><span className="section-kicker">Evidências</span><h2>Registro fotográfico</h2><p>Opcional. As imagens são otimizadas antes do envio, sem perder legibilidade.</p></div><span className="photo-counter">{Object.keys(photos).length} de {photoSlots.length} fotos</span></div>
        <div className="photo-uploader-grid">{photoSlots.map(([type, photoLabel]) => <article className={`photo-upload ${photos[type] ? "has-photo" : ""}`} key={type}>{photos[type] ? <><img src={photos[type].preview} alt={photoLabel}/><div className="photo-overlay"><strong>{photoLabel}</strong><div><label className="icon-button" title="Substituir foto"><Camera/><span className="sr-only">Substituir foto {photoLabel}</span><input type="file" accept="image/jpeg,image/png" capture="environment" onChange={(event) => void selectPhoto(type, event.target.files?.[0])}/></label><button type="button" className="icon-button danger" title="Remover foto" onClick={() => { URL.revokeObjectURL(photos[type].preview); setPhotos((current) => { const next = { ...current }; delete next[type]; return next; }); }}><Trash2/><span className="sr-only">Remover foto {photoLabel}</span></button></div></div></> : <label><ImagePlus/><strong>{photoLabel}</strong><span>Fotografar ou escolher imagem</span><input type="file" accept="image/jpeg,image/png" capture="environment" onChange={(event) => void selectPhoto(type, event.target.files?.[0])}/></label>}</article>)}</div>
      </div>}

      {step === 4 && <div>
        <div className="section-heading"><span className="section-kicker">Conferência final</span><h2>Revisão e resultado</h2><p>O percentual mínimo de aprovação é validado novamente pelo servidor.</p></div>
        <div className="review-result"><div className="progress-ring" style={{ "--value": `${summary.percentage * 3.6}deg` } as React.CSSProperties}><span>{summary.percentage}%</span></div><div><p>Resultado previsto</p><h3 className={summary.percentage >= 90 ? "approved" : "rejected"}>{summary.percentage >= 90 ? "APROVADO" : "REPROVADO"}</h3><span>{summary.compliant} conformes · {summary.nonCompliant} não conformes · {summary.notApplicable} não aplicáveis</span></div></div>
        <div className="review-grid"><div><span>Empresa</span><strong>{label(selectedCompany)}</strong></div><div><span>Projeto</span><strong>{label(selectedProject)}</strong></div><div><span>Veículo</span><strong>{selectedVehicle?.plate} · {selectedVehicle?.model}</strong></div><div><span>Motorista</span><strong>{label(selectedDriver)}</strong></div><div><span>Data e hora</span><strong>{form.inspectionDate} · {form.inspectionTime}</strong></div><div><span>Quilometragem</span><strong>{Number(form.mileage).toLocaleString("pt-BR")} km</strong></div><div><span>Fotos</span><strong>{Object.keys(photos).length} anexada(s)</strong></div><div><span>Não conformidades</span><strong>{summary.nonCompliant}</strong></div></div>
        <Field label="Observações gerais" help="Inclua somente informações relevantes para o relatório final."><textarea rows={5} value={form.generalObservations} onChange={(event) => setForm({ ...form, generalObservations: event.target.value })} placeholder="Informações adicionais sobre a vistoria"/></Field>
      </div>}
    </section>

    {error && <div className="alert error floating-alert" role="alert">{error}</div>}
    <div className="wizard-actions">
      {step > 1 ? <button type="button" className="button ghost" onClick={() => { setError(""); setStep(step - 1); }}><ChevronLeft/> Voltar</button> : <span/>}
      <div className="wizard-next">{nextHint && <small>{nextHint}</small>}{step < 4 ? <button type="button" className="button primary" disabled={!canNext} onClick={() => { setError(""); setStep(step + 1); }}>Continuar <ChevronRight/></button> : <button type="button" className="button primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}><Save/>{mutation.isPending ? "Salvando…" : "Concluir vistoria"}</button>}</div>
    </div>
  </>;
}

function Field({ label: fieldLabel, children, help, required = false }: { label: string; children: ReactNode; help?: string; required?: boolean }) {
  return <label className="field"><span>{fieldLabel}{required && <span className="required-mark" aria-label="obrigatório"> *</span>}</span>{children}{help && <small className="field-help">{help}</small>}</label>;
}

function Dependency({ icon, label: dependencyLabel, value, ready }: { icon: ReactNode; label: string; value: string; ready: boolean }) {
  return <div className={ready ? "ready" : ""}><span className="dependency-icon">{ready ? <Check/> : icon}</span><span><small>{dependencyLabel}</small><strong>{ready ? value : "Aguardando"}</strong></span></div>;
}
