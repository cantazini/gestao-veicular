(function () {
  "use strict";

  let currentInspection = null;

  function value(content) {
    return content === undefined || content === null || content === "" ? "—" : window.AppUtils.escape(content);
  }

  function infoItem(label, content) {
    return `<div class="report-info-item"><span>${label}</span><strong>${value(content)}</strong></div>`;
  }

  function statusInfo(status) {
    const labels = window.Vistorias.statusLabels;
    const label = labels[status] || "Não informado";
    const cssClass = status === "conforme" ? "compliant" : status === "nao_conforme" ? "non-compliant" : status === "nao_se_aplica" ? "not-applicable" : "neutral";
    return { label, cssClass };
  }

  function safePhotoSource(source) {
    const text = String(source || "");
    return text.startsWith("data:image/") || text.startsWith("https://") ? window.AppUtils.escape(text) : "";
  }

  function reportPhotos(inspection) {
    const photos = Array.isArray(inspection.fotos) ? inspection.fotos.filter((photo) => safePhotoSource(photo.dataUrl || photo.url)) : [];
    if (!photos.length) {
      return `<div class="report-photo-empty"><svg><use href="#icon-camera"></use></svg><strong>Nenhuma fotografia registrada</strong><span>Esta vistoria foi salva sem evidências fotográficas.</span></div>`;
    }
    return `<div class="report-photo-grid">${photos.map((photo) => `
      <figure class="report-photo-card">
        <div class="report-photo-frame"><img src="${safePhotoSource(photo.dataUrl || photo.url)}" alt="${value(photo.label)}"></div>
        <figcaption>${value(photo.label)}</figcaption>
      </figure>`).join("")}</div>`;
  }

  function render(inspection) {
    const company = inspection.empresa || {};
    const driver = inspection.motorista || {};
    const vehicle = inspection.veiculo || {};
    const checklist = inspection.checklist || {};
    const checklistItems = window.Vistorias.checklistItems;
    const nonCompliances = checklistItems.filter((item) => checklist[item.key] && checklist[item.key].status === "nao_conforme");
    const resultAttention = inspection.resultado === "ATENÇÃO";
    const resultLabel = resultAttention ? "ATENÇÃO / NÃO CONFORMIDADE" : "APROVADO";

    document.querySelector("#report-document").innerHTML = `
      <div class="report-main-content">
        <header class="report-header">
          <div class="report-brand-row">
            <div class="report-brand-lockup"><span class="report-brand-mark"><svg><use href="#icon-check"></use></svg></span><div><strong>VistoriaFrota</strong><small>Gestão e evidência de inspeções</small></div></div>
            <span class="report-document-label">DOCUMENTO DE INSPEÇÃO</span>
          </div>
          <div class="report-title-row">
            <div><p>RELATÓRIO DE VISTORIA VEICULAR</p><h1>${value(vehicle.placa)} <span>•</span> ${value(`${vehicle.marca || ""} ${vehicle.modelo || ""}`.trim())}</h1></div>
            <span class="report-result ${resultAttention ? "attention" : "approved"}">${resultLabel}</span>
          </div>
          <div class="report-metadata">
            ${infoItem("Número / ID da vistoria", inspection.id)}
            ${infoItem("Data", window.AppUtils.formatDate(inspection.data))}
            ${infoItem("Hora", inspection.hora)}
            ${infoItem("Fiscalizador", inspection.fiscalizador)}
          </div>
        </header>

        <div class="report-entity-grid">
          <section class="report-section report-entity-card">
            <div class="report-section-title"><span>01</span><h2>Empresa</h2></div>
            <div class="report-info-grid">
              ${infoItem("Empresa", company.nome)}
              ${infoItem("CNPJ", company.cnpj)}
              ${infoItem("Unidade", company.unidade)}
              ${infoItem("Projeto / Contrato", company.projeto)}
              ${infoItem("Responsável", company.responsavel)}
            </div>
          </section>
          <section class="report-section report-entity-card">
            <div class="report-section-title"><span>02</span><h2>Motorista</h2></div>
            <div class="report-info-grid">
              ${infoItem("Nome", driver.nome)}
              ${infoItem("Matrícula", driver.matricula)}
              ${infoItem("Categoria da CNH", driver.categoriaCnh)}
              ${infoItem("Validade da CNH", window.AppUtils.formatDate(driver.validadeCnh))}
            </div>
          </section>
        </div>

        <section class="report-section">
          <div class="report-section-title"><span>03</span><h2>Veículo</h2></div>
          <div class="report-info-grid vehicle">
            ${infoItem("Placa", vehicle.placa)}
            ${infoItem("Marca", vehicle.marca)}
            ${infoItem("Modelo", vehicle.modelo)}
            ${infoItem("Ano", vehicle.ano)}
            ${infoItem("Tipo", vehicle.tipo)}
            ${infoItem("Cor", vehicle.cor)}
            ${infoItem("Combustível", vehicle.combustivel)}
            ${infoItem("Quilometragem", `${window.AppUtils.formatNumber(inspection.quilometragem)} km`)}
          </div>
        </section>

        <section class="report-section report-checklist-section">
          <div class="report-section-title"><span>04</span><h2>Resultado do Checklist</h2></div>
          <table class="report-checklist-table">
            <thead><tr><th>Item inspecionado</th><th>Resultado</th><th>Observação</th></tr></thead>
            <tbody>${checklistItems.map((item) => {
              const check = checklist[item.key] || {};
              const status = statusInfo(check.status);
              return `<tr><td>${item.label}</td><td><span class="report-status ${status.cssClass}">${status.label}</span></td><td>${value(check.observacao)}</td></tr>`;
            }).join("")}</tbody>
          </table>
        </section>

        <section class="report-section report-nonconformities ${nonCompliances.length ? "has-items" : "clear"}">
          <div class="report-section-title"><span>05</span><h2>Não Conformidades Identificadas</h2></div>
          ${nonCompliances.length ? `<div class="report-issue-list">${nonCompliances.map((item) => {
            const check = checklist[item.key];
            return `<div class="report-issue"><strong>${item.label}</strong><span>${value(check.observacao || "Sem observação específica.")}</span></div>`;
          }).join("")}</div>` : `<p class="report-clear-message">Nenhuma não conformidade identificada durante a vistoria.</p>`}
        </section>

        <section class="report-section">
          <div class="report-section-title"><span>06</span><h2>Observações Gerais</h2></div>
          <div class="report-general-notes">${value(inspection.observacoes || "Nenhuma observação geral registrada.")}</div>
        </section>

        <footer class="report-footer"><span>VistoriaFrota • Relatório gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}</span><span>ID: ${value(inspection.id)}</span></footer>
      </div>

      <section class="report-photo-page">
        <header class="report-photo-header"><div><p>EVIDÊNCIAS DA VISTORIA • ${value(vehicle.placa)}</p><h2>REGISTRO FOTOGRÁFICO</h2></div><span>${Array.isArray(inspection.fotos) ? inspection.fotos.length : 0} foto(s)</span></header>
        ${reportPhotos(inspection)}
        <footer class="report-footer"><span>VistoriaFrota • Registro fotográfico</span><span>ID: ${value(inspection.id)}</span></footer>
      </section>`;
  }

  async function open(inspectionId) {
    try {
      const inspection = await window.DataService.get("vistorias", inspectionId);
      if (!inspection) {
        window.AppUtils.toast("Vistoria não encontrada", "O registro pode ter sido removido ou não está mais disponível.", "error");
        return;
      }
      currentInspection = inspection;
      render(inspection);
      window.App.navigate("relatorio");
    } catch (error) {
      window.AppUtils.handleError("Não foi possível abrir o relatório da vistoria.", error);
    }
  }

  function printReport() {
    if (!currentInspection) return;
    const previousTitle = document.title;
    const plate = currentInspection.veiculo && currentInspection.veiculo.placa || "veiculo";
    document.title = `relatorio_vistoria_${plate}_${currentInspection.data || ""}`;
    window.print();
    window.setTimeout(() => { document.title = previousTitle; }, 500);
  }

  function init() {
    document.querySelector("#report-back").addEventListener("click", () => window.App.navigate("historico"));
    document.querySelector("#report-print").addEventListener("click", printReport);
  }

  window.Relatorio = { init, open, render };
})();

