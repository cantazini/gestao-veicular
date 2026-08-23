(function () {
  "use strict";

  function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value === undefined || value === null ? "" : String(value);
    return element.innerHTML;
  }

  function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function onlyDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatCnpj(value) {
    const digits = onlyDigits(value).slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }

  function formatPlate(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  }

  function formatDate(value) {
    if (!value) return "—";
    const parts = String(value).slice(0, 10).split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : escapeHtml(value);
  }

  function formatNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat("pt-BR").format(number) : "0";
  }

  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  function statusPill(status) {
    const active = status === "Ativo";
    return `<span class="status-pill ${active ? "active" : "inactive"}">${escapeHtml(status || "Inativo")}</span>`;
  }

  function resultPill(result) {
    return `<span class="status-pill ${result === "APROVADO" ? "success" : "warning"}">${escapeHtml(result || "—")}</span>`;
  }

  function emptyRow(columns, message) {
    return `<tr><td class="empty-state" colspan="${columns}">${escapeHtml(message)}</td></tr>`;
  }

  function localIsoDate(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function toast(title, message, type) {
    const container = document.querySelector("#toast-container");
    const item = document.createElement("div");
    item.className = `toast ${type || ""}`;
    item.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
    container.appendChild(item);
    window.setTimeout(() => item.remove(), 5000);
  }

  function handleError(message, error) {
    console.error(message, error);
    toast("Ocorreu um erro", message, "error");
  }

  function validateForm(form) {
    form.querySelectorAll(".field").forEach((field) => field.classList.remove("invalid"));
    if (form.checkValidity()) return true;
    form.querySelectorAll(":invalid").forEach((input) => {
      const field = input.closest(".field");
      if (field) field.classList.add("invalid");
    });
    const firstInvalid = form.querySelector(":invalid");
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.reportValidity();
    }
    toast("Campos obrigatórios", "Preencha os campos destacados antes de continuar.", "error");
    return false;
  }

  function clearValidation(form) {
    form.querySelectorAll(".invalid").forEach((field) => field.classList.remove("invalid"));
  }

  window.AppUtils = {
    escape: escapeHtml,
    normalize,
    onlyDigits,
    formatCnpj,
    formatPlate,
    formatDate,
    formatNumber,
    plural,
    statusPill,
    resultPill,
    emptyRow,
    localIsoDate,
    toast,
    handleError,
    validateForm,
    clearValidation
  };

  const pageTitles = {};

  function navigate(pageName) {
    const target = document.querySelector(`#page-${pageName}`);
    if (!target) return;
    document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page === target));
    document.querySelectorAll(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.page === pageName));
    document.querySelector("#page-title").textContent = target.dataset.title;
    document.querySelector("#page-subtitle").textContent = target.dataset.subtitle;
    closeSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSidebar() {
    document.querySelector("#sidebar").classList.add("open");
    document.querySelector("#sidebar-overlay").classList.add("visible");
  }

  function closeSidebar() {
    document.querySelector("#sidebar").classList.remove("open");
    document.querySelector("#sidebar-overlay").classList.remove("visible");
  }

  function updateStorageBadge() {
    const badge = document.querySelector("#storage-mode");
    const description = document.querySelector("#storage-description");
    if (window.DataService.mode === "firebase") {
      badge.innerHTML = `<span class="mode-dot"></span>Firebase conectado`;
      badge.classList.add("firebase");
      description.textContent = "Dados salvos no Cloud Firestore";
    } else {
      badge.innerHTML = `<span class="mode-dot"></span>Modo local`;
      badge.classList.remove("firebase");
      description.textContent = "Dados salvos somente neste navegador";
    }
  }

  function bindNavigation() {
    document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.page)));
    document.querySelectorAll("[data-go-page]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.goPage)));
    document.querySelector("#menu-toggle").addEventListener("click", openSidebar);
    document.querySelector("#sidebar-overlay").addEventListener("click", closeSidebar);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeSidebar(); });
  }

  async function renderAll() {
    await Promise.all([
      window.Empresas.render(),
      window.Motoristas.render(),
      window.Veiculos.render(),
      window.Vistorias.render(),
      window.Dashboard.render(),
      window.Exportacao.render()
    ]);
  }

  function bindDataRefresh() {
    let refreshTimer;
    window.addEventListener("datachanged", () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => renderAll().catch((error) => handleError("Não foi possível atualizar a interface.", error)), 60);
    });
  }

  async function start() {
    bindNavigation();
    document.querySelector("#current-date").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
    window.Empresas.init();
    window.Motoristas.init();
    window.Veiculos.init();
    window.FotosService.init();
    window.Vistorias.init();
    window.Dashboard.init();
    window.Exportacao.init();
    window.Relatorio.init();
    bindDataRefresh();

    try {
      await window.DataService.initialize();
      updateStorageBadge();
      await renderAll();
      if (window.DataService.startupWarning) toast("Firebase indisponível", window.DataService.startupWarning, "error");
    } catch (error) {
      handleError("Não foi possível iniciar a aplicação. Recarregue a página e tente novamente.", error);
    }
  }

  window.App = { navigate, renderAll };
  document.addEventListener("DOMContentLoaded", start);
})();
