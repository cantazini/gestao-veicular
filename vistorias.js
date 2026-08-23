(function () {
  "use strict";

  const CHECKLIST_ITEMS = [
    { key: "pneus", label: "Pneus" },
    { key: "estepe", label: "Estepe" },
    { key: "farois", label: "Faróis" },
    { key: "lanternas", label: "Lanternas" },
    { key: "setas", label: "Setas" },
    { key: "luzFreio", label: "Luz de freio" },
    { key: "retrovisores", label: "Retrovisores" },
    { key: "paraBrisa", label: "Para-brisa" },
    { key: "limpadores", label: "Limpadores de para-brisa" },
    { key: "cintos", label: "Cintos de segurança" },
    { key: "buzina", label: "Buzina" },
    { key: "documentacao", label: "Documentação" },
    { key: "condicaoExterna", label: "Condição externa" },
    { key: "condicaoInterna", label: "Condição interna" },
    { key: "vazamentos", label: "Vazamentos aparentes" }
  ];

  const STATUS_LABELS = {
    conforme: "Conforme",
    nao_conforme: "Não Conforme",
    nao_se_aplica: "Não se Aplica"
  };

  let inspections = [];
  let companies = [];
  let drivers = [];
  let vehicles = [];

  function drawChecklist() {
    document.querySelector("#checklist-container").innerHTML = CHECKLIST_ITEMS.map((item) => `
      <div class="checklist-item" data-check-item="${item.key}">
        <span class="checklist-label">${item.label}</span>
        <div class="check-options" role="radiogroup" aria-label="${item.label}">
          <label class="check-option"><input type="radio" name="check-${item.key}" value="conforme" required><span>Conforme</span></label>
          <label class="check-option"><input type="radio" name="check-${item.key}" value="nao_conforme"><span>Não Conforme</span></label>
          <label class="check-option"><input type="radio" name="check-${item.key}" value="nao_se_aplica"><span>Não se Aplica</span></label>
        </div>
        <label class="item-observation" hidden><input type="text" maxlength="300" data-observation="${item.key}" placeholder="Descreva a não conformidade (opcional)"></label>
      </div>`).join("");
  }

  function setDefaultDateTime() {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    document.querySelector("#vistoria-data").value = localDate.toISOString().slice(0, 10);
    document.querySelector("#vistoria-hora").value = localDate.toISOString().slice(11, 16);
  }

  function populateCompanySelects() {
    const activeCompanies = companies.filter((company) => company.status === "Ativo");
    const options = activeCompanies.map((company) => `<option value="${company.id}">${window.AppUtils.escape(company.nome)} — ${window.AppUtils.escape(company.unidade)}</option>`).join("");
    const inspectionSelect = document.querySelector("#vistoria-empresa");
    const inspectionValue = inspectionSelect.value;
    inspectionSelect.innerHTML = `<option value="">Selecione</option>${options}`;
    if (activeCompanies.some((company) => company.id === inspectionValue)) inspectionSelect.value = inspectionValue;

    const filterSelect = document.querySelector("#filter-company");
    const filterValue = filterSelect.value;
    filterSelect.innerHTML = `<option value="">Todas</option>${companies.map((company) => `<option value="${company.id}">${window.AppUtils.escape(company.nome)}</option>`).join("")}`;
    filterSelect.value = filterValue;
  }

  function populateRelatedSelects() {
    const companyId = document.querySelector("#vistoria-empresa").value;
    const driverSelect = document.querySelector("#vistoria-motorista");
    const vehicleSelect = document.querySelector("#vistoria-veiculo");
    const currentDriver = driverSelect.value;
    const currentVehicle = vehicleSelect.value;
    const eligibleDrivers = drivers.filter((driver) => driver.empresaId === companyId && driver.status === "Ativo");
    const eligibleVehicles = vehicles.filter((vehicle) => vehicle.empresaId === companyId && vehicle.status === "Ativo");

    driverSelect.disabled = !companyId;
    vehicleSelect.disabled = !companyId;
    driverSelect.innerHTML = companyId
      ? `<option value="">Selecione</option>${eligibleDrivers.map((driver) => `<option value="${driver.id}">${window.AppUtils.escape(driver.nome)} — ${window.AppUtils.escape(driver.matricula)}</option>`).join("")}`
      : `<option value="">Selecione uma empresa</option>`;
    vehicleSelect.innerHTML = companyId
      ? `<option value="">Selecione</option>${eligibleVehicles.map((vehicle) => `<option value="${vehicle.id}">${window.AppUtils.escape(vehicle.placa)} — ${window.AppUtils.escape(`${vehicle.marca} ${vehicle.modelo}`)}</option>`).join("")}`
      : `<option value="">Selecione uma empresa</option>`;
    if (eligibleDrivers.some((driver) => driver.id === currentDriver)) driverSelect.value = currentDriver;
    if (eligibleVehicles.some((vehicle) => vehicle.id === currentVehicle)) vehicleSelect.value = currentVehicle;
    updateSummary();
  }

  function updateSummary() {
    const company = companies.find((item) => item.id === document.querySelector("#vistoria-empresa").value);
    const driver = drivers.find((item) => item.id === document.querySelector("#vistoria-motorista").value);
    const vehicle = vehicles.find((item) => item.id === document.querySelector("#vistoria-veiculo").value);
    const summary = document.querySelector("#vistoria-summary");
    if (!company) {
      summary.hidden = true;
      return;
    }
    summary.hidden = false;
    summary.innerHTML = `
      <div class="summary-item"><span>Empresa / contrato</span><strong>${window.AppUtils.escape(`${company.nome} • ${company.projeto}`)}</strong></div>
      <div class="summary-item"><span>Motorista / CNH</span><strong>${driver ? window.AppUtils.escape(`${driver.nome} • ${driver.categoriaCnh} • vence ${window.AppUtils.formatDate(driver.validadeCnh)}`) : "Aguardando seleção"}</strong></div>
      <div class="summary-item"><span>Veículo</span><strong>${vehicle ? window.AppUtils.escape(`${vehicle.placa} • ${vehicle.marca} ${vehicle.modelo} • ${window.AppUtils.formatNumber(vehicle.quilometragem)} km`) : "Aguardando seleção"}</strong></div>`;
    if (vehicle && !document.querySelector("#vistoria-km").value) document.querySelector("#vistoria-km").value = vehicle.quilometragem ?? "";
  }

  function updateChecklistItem(event) {
    const input = event.target.closest("input[type='radio']");
    if (!input) return;
    const row = input.closest(".checklist-item");
    const observation = row.querySelector(".item-observation");
    const isNonCompliant = input.value === "nao_conforme";
    row.classList.toggle("non-compliant", isNonCompliant);
    observation.hidden = !isNonCompliant;
    if (!isNonCompliant) observation.querySelector("input").value = "";
    updateResult();
  }

  function currentResult() {
    return document.querySelector("input[value='nao_conforme']:checked") ? "ATENÇÃO" : "APROVADO";
  }

  function updateResult() {
    const result = currentResult();
    const banner = document.querySelector("#vistoria-result-banner");
    banner.classList.toggle("approved", result === "APROVADO");
    banner.classList.toggle("attention", result === "ATENÇÃO");
    document.querySelector("#vistoria-result").textContent = result;
    banner.querySelector("small").textContent = result === "APROVADO"
      ? "Nenhuma não conformidade identificada."
      : "Existe pelo menos uma não conformidade que requer atenção.";
  }

  function checklistData() {
    return CHECKLIST_ITEMS.reduce((result, item) => {
      const selected = document.querySelector(`input[name="check-${item.key}"]:checked`);
      result[item.key] = {
        status: selected ? selected.value : "",
        observacao: document.querySelector(`[data-observation="${item.key}"]`).value.trim()
      };
      return result;
    }, {});
  }

  function checklistIsComplete() {
    const missing = CHECKLIST_ITEMS.find((item) => !document.querySelector(`input[name="check-${item.key}"]:checked`));
    if (!missing) return true;
    window.AppUtils.toast("Checklist incompleto", `Avalie o item “${missing.label}” antes de salvar.`, "error");
    document.querySelector(`[data-check-item="${missing.key}"]`).scrollIntoView({ behavior: "smooth", block: "center" });
    return false;
  }

  function snapshotData(entity, fields) {
    return fields.reduce((snapshot, field) => {
      snapshot[field] = entity[field] ?? "";
      return snapshot;
    }, {});
  }

  async function saveInspection(event) {
    event.preventDefault();
    if (!window.AppUtils.validateForm(event.currentTarget) || !checklistIsComplete()) return;
    const company = companies.find((item) => item.id === document.querySelector("#vistoria-empresa").value);
    const driver = drivers.find((item) => item.id === document.querySelector("#vistoria-motorista").value);
    const vehicle = vehicles.find((item) => item.id === document.querySelector("#vistoria-veiculo").value);
    if (!company || !driver || !vehicle) {
      window.AppUtils.toast("Seleção inválida", "Selecione novamente a empresa, o motorista e o veículo.", "error");
      return;
    }

    if (window.DataService.mode === "firebase" && window.FotosService.hasPhotos()) {
      window.AppUtils.toast("Fotos disponíveis no Modo local", "Nesta versão, remova as fotos para salvar no Firestore. A migração das imagens será feita pelo Firebase Storage.", "error");
      return;
    }

    const mileage = Number(document.querySelector("#vistoria-km").value);
    if (mileage < Number(vehicle.quilometragem || 0)) {
      window.AppUtils.toast("Quilometragem menor", `A quilometragem não pode ser inferior aos ${window.AppUtils.formatNumber(vehicle.quilometragem)} km cadastrados.`, "error");
      document.querySelector("#vistoria-km").focus();
      return;
    }

    const submit = document.querySelector("#vistoria-submit");
    submit.disabled = true;
    submit.textContent = "Salvando...";
    const data = {
      data: document.querySelector("#vistoria-data").value,
      hora: document.querySelector("#vistoria-hora").value,
      fiscalizador: document.querySelector("#vistoria-fiscalizador").value.trim(),
      quilometragem: mileage,
      empresaId: company.id,
      motoristaId: driver.id,
      veiculoId: vehicle.id,
      empresa: snapshotData(company, ["nome", "cnpj", "unidade", "projeto", "responsavel"]),
      motorista: snapshotData(driver, ["nome", "matricula", "categoriaCnh", "validadeCnh"]),
      veiculo: snapshotData(vehicle, ["placa", "marca", "modelo", "ano", "tipo", "cor", "combustivel"]),
      checklist: checklistData(),
      fotos: window.FotosService.getPhotos(),
      resultado: currentResult(),
      observacoes: document.querySelector("#vistoria-observacoes").value.trim()
    };

    try {
      await window.DataService.add("vistorias", data);
      if (mileage > Number(vehicle.quilometragem || 0)) {
        await window.DataService.update("veiculos", vehicle.id, { quilometragem: mileage });
      }
      window.AppUtils.toast("Vistoria salva", `Resultado: ${data.resultado}. O registro foi adicionado ao histórico.`, "success");
      resetInspectionForm();
      await render();
    } catch (error) {
      if (error && (error.name === "QuotaExceededError" || error.code === 22)) {
        window.AppUtils.toast("Armazenamento local cheio", "Remova algumas fotos ou registros antigos e tente novamente.", "error");
      } else {
        window.AppUtils.handleError("Não foi possível salvar a vistoria.", error);
      }
    } finally {
      submit.disabled = false;
      submit.textContent = "Salvar vistoria";
    }
  }

  function resetInspectionForm() {
    document.querySelector("#vistoria-form").reset();
    document.querySelectorAll(".checklist-item").forEach((row) => {
      row.classList.remove("non-compliant");
      row.querySelector(".item-observation").hidden = true;
    });
    setDefaultDateTime();
    window.FotosService.reset();
    populateRelatedSelects();
    updateResult();
    window.AppUtils.clearValidation(document.querySelector("#vistoria-form"));
  }

  function filteredInspections() {
    const start = document.querySelector("#filter-start").value;
    const end = document.querySelector("#filter-end").value;
    const companyId = document.querySelector("#filter-company").value;
    const plate = window.AppUtils.normalize(document.querySelector("#filter-plate").value);
    const result = document.querySelector("#filter-result").value;
    return inspections.filter((inspection) => {
      if (start && inspection.data < start) return false;
      if (end && inspection.data > end) return false;
      if (companyId && inspection.empresaId !== companyId) return false;
      if (plate && !window.AppUtils.normalize(inspection.veiculo && inspection.veiculo.placa).includes(plate)) return false;
      if (result && inspection.resultado !== result) return false;
      return true;
    });
  }

  function drawHistory() {
    const visible = filteredInspections();
    document.querySelector("#history-count").textContent = `${window.AppUtils.plural(visible.length, "registro encontrado", "registros encontrados")}`;
    document.querySelector("#history-table").innerHTML = visible.length ? visible.map((inspection) => `
      <tr>
        <td class="primary-cell">${window.AppUtils.formatDate(inspection.data)}<span class="secondary-line">${window.AppUtils.escape(inspection.hora || "—")}</span></td>
        <td>${window.AppUtils.escape(inspection.empresa && inspection.empresa.nome)}</td>
        <td>${window.AppUtils.escape(inspection.motorista && inspection.motorista.nome)}</td>
        <td>${window.AppUtils.escape(`${inspection.veiculo && inspection.veiculo.marca || ""} ${inspection.veiculo && inspection.veiculo.modelo || ""}`.trim())}</td>
        <td class="primary-cell">${window.AppUtils.escape(inspection.veiculo && inspection.veiculo.placa)}</td>
        <td>${window.AppUtils.escape(inspection.fiscalizador)}</td>
        <td>${window.AppUtils.resultPill(inspection.resultado)}</td>
        <td><div class="action-buttons history-actions">
          <button class="action-button" data-detail-id="${inspection.id}" aria-label="Ver detalhes da vistoria" title="Ver detalhes"><svg><use href="#icon-eye"></use></svg></button>
          <button class="button button-secondary compact history-report-button" data-report-id="${inspection.id}" aria-label="Gerar relatório da vistoria"><svg><use href="#icon-file"></use></svg>Relatório</button>
        </div></td>
      </tr>`).join("") : window.AppUtils.emptyRow(8, "Nenhuma vistoria encontrada para os filtros informados.");
  }

  function clearFilters() {
    ["#filter-start", "#filter-end", "#filter-company", "#filter-plate", "#filter-result"].forEach((selector) => { document.querySelector(selector).value = ""; });
    drawHistory();
  }

  function detailValue(value) {
    return value === undefined || value === null || value === "" ? "—" : window.AppUtils.escape(value);
  }

  function showDetails(id) {
    const inspection = inspections.find((item) => item.id === id);
    if (!inspection) return;
    document.querySelector("#dialog-title").textContent = `${inspection.veiculo.placa} • ${window.AppUtils.formatDate(inspection.data)}`;
    document.querySelector("#dialog-content").innerHTML = `
      <div class="detail-grid">
        <div class="detail-block"><span>Resultado</span><strong>${window.AppUtils.resultPill(inspection.resultado)}</strong></div>
        <div class="detail-block"><span>Data e hora</span><strong>${window.AppUtils.formatDate(inspection.data)} às ${detailValue(inspection.hora)}</strong></div>
        <div class="detail-block"><span>Fiscalizador</span><strong>${detailValue(inspection.fiscalizador)}</strong></div>
        <div class="detail-block"><span>Empresa</span><strong>${detailValue(inspection.empresa.nome)}</strong></div>
        <div class="detail-block"><span>Unidade / projeto</span><strong>${detailValue(`${inspection.empresa.unidade} • ${inspection.empresa.projeto}`)}</strong></div>
        <div class="detail-block"><span>CNPJ</span><strong>${detailValue(inspection.empresa.cnpj)}</strong></div>
        <div class="detail-block"><span>Motorista</span><strong>${detailValue(inspection.motorista.nome)}</strong></div>
        <div class="detail-block"><span>Matrícula / CNH</span><strong>${detailValue(`${inspection.motorista.matricula} • ${inspection.motorista.categoriaCnh}`)}</strong></div>
        <div class="detail-block"><span>Validade da CNH</span><strong>${window.AppUtils.formatDate(inspection.motorista.validadeCnh)}</strong></div>
        <div class="detail-block"><span>Veículo</span><strong>${detailValue(`${inspection.veiculo.marca} ${inspection.veiculo.modelo} (${inspection.veiculo.ano})`)}</strong></div>
        <div class="detail-block"><span>Placa / tipo</span><strong>${detailValue(`${inspection.veiculo.placa} • ${inspection.veiculo.tipo}`)}</strong></div>
        <div class="detail-block"><span>Quilometragem</span><strong>${window.AppUtils.formatNumber(inspection.quilometragem)} km</strong></div>
        <div class="detail-block"><span>Registro fotográfico</span><strong>${window.AppUtils.plural(Array.isArray(inspection.fotos) ? inspection.fotos.length : 0, "foto", "fotos")}</strong></div>
      </div>
      <div class="detail-section"><h3>Checklist</h3><div class="detail-checks">
        ${CHECKLIST_ITEMS.map((item) => {
          const check = inspection.checklist && inspection.checklist[item.key] || {};
          return `<div class="detail-check ${check.status === "nao_conforme" ? "has-issue" : ""}"><div><strong>${item.label}</strong>${check.observacao ? `<small>${window.AppUtils.escape(check.observacao)}</small>` : ""}</div><span>${detailValue(STATUS_LABELS[check.status] || "Não informado")}</span></div>`;
        }).join("")}
      </div></div>
      <div class="detail-section"><h3>Observações gerais</h3><div class="general-notes">${detailValue(inspection.observacoes)}</div></div>`;
    document.querySelector("#inspection-dialog").showModal();
  }

  async function render() {
    [inspections, companies, drivers, vehicles] = await Promise.all([
      window.DataService.list("vistorias"),
      window.DataService.list("empresas"),
      window.DataService.list("motoristas"),
      window.DataService.list("veiculos")
    ]);
    inspections.sort((a, b) => `${b.data || ""}T${b.hora || ""}`.localeCompare(`${a.data || ""}T${a.hora || ""}`));
    companies.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    populateCompanySelects();
    populateRelatedSelects();
    drawHistory();
  }

  function init() {
    drawChecklist();
    setDefaultDateTime();
    document.querySelector("#vistoria-form").addEventListener("submit", saveInspection);
    document.querySelector("#vistoria-clear").addEventListener("click", () => {
      if (window.confirm("Limpar todos os dados preenchidos nesta vistoria?")) resetInspectionForm();
    });
    document.querySelector("#vistoria-empresa").addEventListener("change", populateRelatedSelects);
    document.querySelector("#vistoria-motorista").addEventListener("change", updateSummary);
    document.querySelector("#vistoria-veiculo").addEventListener("change", () => {
      document.querySelector("#vistoria-km").value = "";
      updateSummary();
    });
    document.querySelector("#checklist-container").addEventListener("change", updateChecklistItem);
    ["#filter-start", "#filter-end", "#filter-company", "#filter-plate", "#filter-result"].forEach((selector) => document.querySelector(selector).addEventListener("input", drawHistory));
    document.querySelector("#filter-plate").addEventListener("input", (event) => { event.target.value = window.AppUtils.formatPlate(event.target.value); });
    document.querySelector("#history-clear").addEventListener("click", clearFilters);
    document.querySelector("#history-table").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-detail-id]");
      if (button) showDetails(button.dataset.detailId);
      const reportButton = event.target.closest("button[data-report-id]");
      if (reportButton) window.Relatorio.open(reportButton.dataset.reportId);
    });
    document.querySelector("#dialog-close").addEventListener("click", () => document.querySelector("#inspection-dialog").close());
    document.querySelector("#inspection-dialog").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
  }

  window.Vistorias = { init, render, getAll: () => inspections, checklistItems: CHECKLIST_ITEMS, statusLabels: STATUS_LABELS };
})();
