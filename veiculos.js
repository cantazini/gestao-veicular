(function () {
  "use strict";

  let vehicles = [];
  let companies = [];

  function populateCompanies(selectedId) {
    const select = document.querySelector("#vehicle-company");
    const eligible = companies.filter((company) => company.status === "Ativo" || company.id === selectedId);
    select.innerHTML = `<option value="">Selecione</option>${eligible.map((company) => `<option value="${company.id}">${window.AppUtils.escape(company.nome)} — ${window.AppUtils.escape(company.unidade)}</option>`).join("")}`;
    if (selectedId) select.value = selectedId;
  }

  function resetForm() {
    document.querySelector("#vehicle-form").reset();
    document.querySelector("#vehicle-id").value = "";
    document.querySelector("#vehicle-status").value = "Ativo";
    document.querySelector("#vehicle-form-title").textContent = "Novo veículo";
    document.querySelector("#vehicle-cancel").hidden = true;
    populateCompanies();
    window.AppUtils.clearValidation(document.querySelector("#vehicle-form"));
  }

  function formData() {
    const companyId = document.querySelector("#vehicle-company").value;
    const company = companies.find((item) => item.id === companyId);
    return {
      placa: window.AppUtils.formatPlate(document.querySelector("#vehicle-plate").value),
      marca: document.querySelector("#vehicle-brand").value.trim(),
      modelo: document.querySelector("#vehicle-model").value.trim(),
      ano: Number(document.querySelector("#vehicle-year").value),
      tipo: document.querySelector("#vehicle-type").value,
      cor: document.querySelector("#vehicle-color").value.trim(),
      combustivel: document.querySelector("#vehicle-fuel").value,
      quilometragem: Number(document.querySelector("#vehicle-mileage").value),
      empresaId: companyId,
      empresaNome: company ? company.nome : "",
      unidade: document.querySelector("#vehicle-unit").value.trim(),
      status: document.querySelector("#vehicle-status").value
    };
  }

  async function save(event) {
    event.preventDefault();
    if (!window.AppUtils.validateForm(event.currentTarget)) return;
    const data = formData();
    const currentId = document.querySelector("#vehicle-id").value;
    if (data.placa.length < 7) {
      window.AppUtils.toast("Placa incompleta", "Informe uma placa válida com 7 caracteres.", "error");
      return;
    }
    const duplicate = vehicles.some((vehicle) => vehicle.id !== currentId && vehicle.placa === data.placa);
    if (duplicate) {
      window.AppUtils.toast("Placa já cadastrada", "Use uma placa diferente ou edite o registro existente.", "error");
      return;
    }
    try {
      if (currentId) {
        await window.DataService.update("veiculos", currentId, data);
        window.AppUtils.toast("Veículo atualizado", "As alterações foram salvas.", "success");
      } else {
        await window.DataService.add("veiculos", data);
        window.AppUtils.toast("Veículo cadastrado", "O registro já está disponível para vistorias.", "success");
      }
      resetForm();
      await render();
    } catch (error) {
      window.AppUtils.handleError("Não foi possível salvar o veículo.", error);
    }
  }

  function edit(id) {
    const vehicle = vehicles.find((item) => item.id === id);
    if (!vehicle) return;
    document.querySelector("#vehicle-id").value = vehicle.id;
    document.querySelector("#vehicle-plate").value = vehicle.placa || "";
    document.querySelector("#vehicle-brand").value = vehicle.marca || "";
    document.querySelector("#vehicle-model").value = vehicle.modelo || "";
    document.querySelector("#vehicle-year").value = vehicle.ano || "";
    document.querySelector("#vehicle-type").value = vehicle.tipo || "";
    document.querySelector("#vehicle-color").value = vehicle.cor || "";
    document.querySelector("#vehicle-fuel").value = vehicle.combustivel || "";
    document.querySelector("#vehicle-mileage").value = vehicle.quilometragem ?? "";
    populateCompanies(vehicle.empresaId);
    document.querySelector("#vehicle-unit").value = vehicle.unidade || "";
    document.querySelector("#vehicle-status").value = vehicle.status || "Ativo";
    document.querySelector("#vehicle-form-title").textContent = "Editar veículo";
    document.querySelector("#vehicle-cancel").hidden = false;
    document.querySelector("#vehicle-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function remove(id) {
    const vehicle = vehicles.find((item) => item.id === id);
    if (!vehicle || !window.confirm(`Excluir o veículo de placa ${vehicle.placa}?\n\nVistorias antigas continuarão preservadas.`)) return;
    try {
      await window.DataService.remove("veiculos", id);
      window.AppUtils.toast("Veículo excluído", "O cadastro foi removido.", "success");
      resetForm();
      await render();
    } catch (error) {
      window.AppUtils.handleError("Não foi possível excluir o veículo.", error);
    }
  }

  function drawTable() {
    const term = window.AppUtils.normalize(document.querySelector("#vehicle-search").value);
    const visible = !term ? vehicles : vehicles.filter((vehicle) => window.AppUtils.normalize(`${vehicle.placa} ${vehicle.marca} ${vehicle.modelo} ${vehicle.empresaNome}`).includes(term));
    document.querySelector("#vehicles-count").textContent = window.AppUtils.plural(visible.length, "veículo", "veículos");
    document.querySelector("#vehicles-table").innerHTML = visible.length ? visible.map((vehicle) => `
      <tr>
        <td class="primary-cell">${window.AppUtils.escape(vehicle.placa)}</td>
        <td>${window.AppUtils.escape(`${vehicle.marca} ${vehicle.modelo}`)}<span class="secondary-line">${window.AppUtils.escape(`${vehicle.tipo} • ${vehicle.ano}`)}</span></td>
        <td>${window.AppUtils.escape(vehicle.empresaNome || "—")}</td>
        <td>${window.AppUtils.formatNumber(vehicle.quilometragem)} km</td>
        <td>${window.AppUtils.statusPill(vehicle.status)}</td>
        <td><div class="action-buttons">
          <button class="action-button" data-action="edit" data-id="${vehicle.id}" aria-label="Editar veículo ${window.AppUtils.escape(vehicle.placa)}"><svg><use href="#icon-edit"></use></svg></button>
          <button class="action-button danger" data-action="delete" data-id="${vehicle.id}" aria-label="Excluir veículo ${window.AppUtils.escape(vehicle.placa)}"><svg><use href="#icon-trash"></use></svg></button>
        </div></td>
      </tr>`).join("") : window.AppUtils.emptyRow(6, "Nenhum veículo encontrado.");
  }

  async function render() {
    [vehicles, companies] = await Promise.all([
      window.DataService.list("veiculos"),
      window.DataService.list("empresas")
    ]);
    vehicles.sort((a, b) => String(a.placa).localeCompare(String(b.placa), "pt-BR"));
    companies.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    const selectedCompany = document.querySelector("#vehicle-company").value;
    populateCompanies(selectedCompany);
    drawTable();
  }

  function init() {
    document.querySelector("#vehicle-form").addEventListener("submit", save);
    document.querySelector("#vehicle-cancel").addEventListener("click", resetForm);
    document.querySelector("#vehicle-search").addEventListener("input", drawTable);
    document.querySelector("#vehicle-plate").addEventListener("input", (event) => { event.target.value = window.AppUtils.formatPlate(event.target.value); });
    document.querySelector("#vehicle-company").addEventListener("change", (event) => {
      const company = companies.find((item) => item.id === event.target.value);
      if (company && !document.querySelector("#vehicle-unit").value) document.querySelector("#vehicle-unit").value = company.unidade || "";
    });
    document.querySelector("#vehicles-table").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "edit") edit(button.dataset.id);
      if (button.dataset.action === "delete") remove(button.dataset.id);
    });
  }

  window.Veiculos = { init, render, getAll: () => vehicles };
})();

