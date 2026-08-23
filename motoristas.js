(function () {
  "use strict";

  let drivers = [];
  let companies = [];

  function populateCompanies(selectedId) {
    const select = document.querySelector("#driver-company");
    const eligible = companies.filter((company) => company.status === "Ativo" || company.id === selectedId);
    select.innerHTML = `<option value="">Selecione</option>${eligible.map((company) => `<option value="${company.id}">${window.AppUtils.escape(company.nome)} — ${window.AppUtils.escape(company.unidade)}</option>`).join("")}`;
    if (selectedId) select.value = selectedId;
  }

  function resetForm() {
    document.querySelector("#driver-form").reset();
    document.querySelector("#driver-id").value = "";
    document.querySelector("#driver-status").value = "Ativo";
    document.querySelector("#driver-form-title").textContent = "Novo motorista";
    document.querySelector("#driver-cancel").hidden = true;
    populateCompanies();
    window.AppUtils.clearValidation(document.querySelector("#driver-form"));
  }

  function formData() {
    const companyId = document.querySelector("#driver-company").value;
    const company = companies.find((item) => item.id === companyId);
    return {
      nome: document.querySelector("#driver-name").value.trim(),
      matricula: document.querySelector("#driver-registration").value.trim(),
      categoriaCnh: document.querySelector("#driver-license-category").value,
      validadeCnh: document.querySelector("#driver-license-expiry").value,
      empresaId: companyId,
      empresaNome: company ? company.nome : "",
      status: document.querySelector("#driver-status").value
    };
  }

  async function save(event) {
    event.preventDefault();
    if (!window.AppUtils.validateForm(event.currentTarget)) return;
    const data = formData();
    const currentId = document.querySelector("#driver-id").value;
    const duplicate = drivers.some((driver) => driver.id !== currentId && window.AppUtils.normalize(driver.matricula) === window.AppUtils.normalize(data.matricula));
    if (duplicate) {
      window.AppUtils.toast("Matrícula já cadastrada", "Use uma matrícula diferente ou edite o registro existente.", "error");
      return;
    }
    try {
      if (currentId) {
        await window.DataService.update("motoristas", currentId, data);
        window.AppUtils.toast("Motorista atualizado", "As alterações foram salvas.", "success");
      } else {
        await window.DataService.add("motoristas", data);
        window.AppUtils.toast("Motorista cadastrado", "O registro já está disponível para vistorias.", "success");
      }
      resetForm();
      await render();
    } catch (error) {
      window.AppUtils.handleError("Não foi possível salvar o motorista.", error);
    }
  }

  function edit(id) {
    const driver = drivers.find((item) => item.id === id);
    if (!driver) return;
    document.querySelector("#driver-id").value = driver.id;
    document.querySelector("#driver-name").value = driver.nome || "";
    document.querySelector("#driver-registration").value = driver.matricula || "";
    document.querySelector("#driver-license-category").value = driver.categoriaCnh || "";
    document.querySelector("#driver-license-expiry").value = driver.validadeCnh || "";
    populateCompanies(driver.empresaId);
    document.querySelector("#driver-status").value = driver.status || "Ativo";
    document.querySelector("#driver-form-title").textContent = "Editar motorista";
    document.querySelector("#driver-cancel").hidden = false;
    document.querySelector("#driver-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function remove(id) {
    const driver = drivers.find((item) => item.id === id);
    if (!driver || !window.confirm(`Excluir o motorista “${driver.nome}”?\n\nVistorias antigas continuarão preservadas.`)) return;
    try {
      await window.DataService.remove("motoristas", id);
      window.AppUtils.toast("Motorista excluído", "O cadastro foi removido.", "success");
      resetForm();
      await render();
    } catch (error) {
      window.AppUtils.handleError("Não foi possível excluir o motorista.", error);
    }
  }

  function drawTable() {
    const term = window.AppUtils.normalize(document.querySelector("#driver-search").value);
    const visible = !term ? drivers : drivers.filter((driver) => window.AppUtils.normalize(`${driver.nome} ${driver.matricula} ${driver.empresaNome}`).includes(term));
    document.querySelector("#drivers-count").textContent = window.AppUtils.plural(visible.length, "motorista", "motoristas");
    document.querySelector("#drivers-table").innerHTML = visible.length ? visible.map((driver) => `
      <tr>
        <td class="primary-cell">${window.AppUtils.escape(driver.nome)}</td>
        <td>${window.AppUtils.escape(driver.matricula)}</td>
        <td>${window.AppUtils.escape(driver.categoriaCnh)}<span class="secondary-line">Validade: ${window.AppUtils.formatDate(driver.validadeCnh)}</span></td>
        <td>${window.AppUtils.escape(driver.empresaNome || "—")}</td>
        <td>${window.AppUtils.statusPill(driver.status)}</td>
        <td><div class="action-buttons">
          <button class="action-button" data-action="edit" data-id="${driver.id}" aria-label="Editar ${window.AppUtils.escape(driver.nome)}"><svg><use href="#icon-edit"></use></svg></button>
          <button class="action-button danger" data-action="delete" data-id="${driver.id}" aria-label="Excluir ${window.AppUtils.escape(driver.nome)}"><svg><use href="#icon-trash"></use></svg></button>
        </div></td>
      </tr>`).join("") : window.AppUtils.emptyRow(6, "Nenhum motorista encontrado.");
  }

  async function render() {
    [drivers, companies] = await Promise.all([
      window.DataService.list("motoristas"),
      window.DataService.list("empresas")
    ]);
    drivers.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    companies.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    const selectedCompany = document.querySelector("#driver-company").value;
    populateCompanies(selectedCompany);
    drawTable();
  }

  function init() {
    document.querySelector("#driver-form").addEventListener("submit", save);
    document.querySelector("#driver-cancel").addEventListener("click", resetForm);
    document.querySelector("#driver-search").addEventListener("input", drawTable);
    document.querySelector("#drivers-table").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "edit") edit(button.dataset.id);
      if (button.dataset.action === "delete") remove(button.dataset.id);
    });
  }

  window.Motoristas = { init, render, getAll: () => drivers };
})();

