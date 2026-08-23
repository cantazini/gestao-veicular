(function () {
  "use strict";

  let companies = [];

  function formData() {
    return {
      nome: document.querySelector("#company-name").value.trim(),
      cnpj: window.AppUtils.formatCnpj(document.querySelector("#company-cnpj").value),
      unidade: document.querySelector("#company-unit").value.trim(),
      projeto: document.querySelector("#company-project").value.trim(),
      responsavel: document.querySelector("#company-manager").value.trim(),
      status: document.querySelector("#company-status").value
    };
  }

  function resetForm() {
    document.querySelector("#company-form").reset();
    document.querySelector("#company-id").value = "";
    document.querySelector("#company-status").value = "Ativo";
    document.querySelector("#company-form-title").textContent = "Nova empresa";
    document.querySelector("#company-cancel").hidden = true;
    window.AppUtils.clearValidation(document.querySelector("#company-form"));
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!window.AppUtils.validateForm(form)) return;

    const data = formData();
    if (window.AppUtils.onlyDigits(data.cnpj).length !== 14) {
      window.AppUtils.toast("Verifique o CNPJ", "Informe os 14 dígitos do CNPJ.", "error");
      document.querySelector("#company-cnpj").focus();
      return;
    }

    const currentId = document.querySelector("#company-id").value;
    const duplicate = companies.some((company) => company.id !== currentId && window.AppUtils.onlyDigits(company.cnpj) === window.AppUtils.onlyDigits(data.cnpj));
    if (duplicate) {
      window.AppUtils.toast("CNPJ já cadastrado", "Use um CNPJ diferente ou edite o registro existente.", "error");
      return;
    }

    try {
      if (currentId) {
        await window.DataService.update("empresas", currentId, data);
        window.AppUtils.toast("Empresa atualizada", "As alterações foram salvas.", "success");
      } else {
        await window.DataService.add("empresas", data);
        window.AppUtils.toast("Empresa cadastrada", "O registro já está disponível para uso.", "success");
      }
      resetForm();
      await render();
    } catch (error) {
      window.AppUtils.handleError("Não foi possível salvar a empresa.", error);
    }
  }

  function edit(id) {
    const company = companies.find((item) => item.id === id);
    if (!company) return;
    document.querySelector("#company-id").value = company.id;
    document.querySelector("#company-name").value = company.nome || "";
    document.querySelector("#company-cnpj").value = company.cnpj || "";
    document.querySelector("#company-unit").value = company.unidade || "";
    document.querySelector("#company-project").value = company.projeto || "";
    document.querySelector("#company-manager").value = company.responsavel || "";
    document.querySelector("#company-status").value = company.status || "Ativo";
    document.querySelector("#company-form-title").textContent = "Editar empresa";
    document.querySelector("#company-cancel").hidden = false;
    document.querySelector("#company-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function remove(id) {
    const company = companies.find((item) => item.id === id);
    if (!company || !window.confirm(`Excluir a empresa “${company.nome}”?\n\nCadastros vinculados e vistorias antigas não serão apagados.`)) return;
    try {
      await window.DataService.remove("empresas", id);
      window.AppUtils.toast("Empresa excluída", "O cadastro foi removido.", "success");
      resetForm();
      await render();
    } catch (error) {
      window.AppUtils.handleError("Não foi possível excluir a empresa.", error);
    }
  }

  function filteredCompanies() {
    const term = window.AppUtils.normalize(document.querySelector("#company-search").value);
    if (!term) return companies;
    return companies.filter((company) => window.AppUtils.normalize(`${company.nome} ${company.cnpj} ${company.unidade} ${company.projeto}`).includes(term));
  }

  function drawTable() {
    const visible = filteredCompanies();
    document.querySelector("#companies-count").textContent = window.AppUtils.plural(visible.length, "empresa", "empresas");
    document.querySelector("#companies-table").innerHTML = visible.length ? visible.map((company) => `
      <tr>
        <td class="primary-cell">${window.AppUtils.escape(company.nome)}</td>
        <td>${window.AppUtils.escape(company.cnpj)}</td>
        <td>${window.AppUtils.escape(company.unidade)}</td>
        <td>${window.AppUtils.escape(company.projeto)}</td>
        <td>${window.AppUtils.statusPill(company.status)}</td>
        <td><div class="action-buttons">
          <button class="action-button" data-action="edit" data-id="${company.id}" aria-label="Editar ${window.AppUtils.escape(company.nome)}"><svg><use href="#icon-edit"></use></svg></button>
          <button class="action-button danger" data-action="delete" data-id="${company.id}" aria-label="Excluir ${window.AppUtils.escape(company.nome)}"><svg><use href="#icon-trash"></use></svg></button>
        </div></td>
      </tr>`).join("") : window.AppUtils.emptyRow(6, "Nenhuma empresa encontrada.");
  }

  async function render() {
    companies = await window.DataService.list("empresas");
    companies.sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    drawTable();
  }

  function init() {
    document.querySelector("#company-form").addEventListener("submit", save);
    document.querySelector("#company-cancel").addEventListener("click", resetForm);
    document.querySelector("#company-search").addEventListener("input", drawTable);
    document.querySelector("#company-cnpj").addEventListener("input", (event) => { event.target.value = window.AppUtils.formatCnpj(event.target.value); });
    document.querySelector("#companies-table").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      if (button.dataset.action === "edit") edit(button.dataset.id);
      if (button.dataset.action === "delete") remove(button.dataset.id);
    });
  }

  window.Empresas = { init, render, getAll: () => companies };
})();

