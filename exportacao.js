(function () {
  "use strict";

  const COLUMNS = [
    "ID_Vistoria", "Data", "Hora", "Fiscalizador", "Empresa", "CNPJ", "Unidade", "Projeto",
    "Motorista", "Matricula_Motorista", "Categoria_CNH", "Validade_CNH", "Placa", "Marca", "Modelo",
    "Ano", "Tipo_Veiculo", "Quilometragem", "Pneus", "Estepe", "Farois", "Lanternas", "Setas",
    "Luz_Freio", "Retrovisores", "ParaBrisa", "Limpadores", "Cintos", "Buzina", "Documentacao",
    "Condicao_Externa", "Condicao_Interna", "Vazamentos", "Resultado_Vistoria", "Observacoes"
  ];

  let inspections = [];

  function checklistStatus(inspection, key) {
    const item = inspection.checklist && inspection.checklist[key];
    if (!item) return "";
    const label = window.Vistorias.statusLabels[item.status] || item.status || "";
    return item.observacao ? `${label} — ${item.observacao}` : label;
  }

  function flatten(inspection) {
    const company = inspection.empresa || {};
    const driver = inspection.motorista || {};
    const vehicle = inspection.veiculo || {};
    return {
      ID_Vistoria: inspection.id,
      Data: inspection.data || "",
      Hora: inspection.hora || "",
      Fiscalizador: inspection.fiscalizador || "",
      Empresa: company.nome || "",
      CNPJ: company.cnpj || "",
      Unidade: company.unidade || "",
      Projeto: company.projeto || "",
      Motorista: driver.nome || "",
      Matricula_Motorista: driver.matricula || "",
      Categoria_CNH: driver.categoriaCnh || "",
      Validade_CNH: driver.validadeCnh || "",
      Placa: vehicle.placa || "",
      Marca: vehicle.marca || "",
      Modelo: vehicle.modelo || "",
      Ano: vehicle.ano || "",
      Tipo_Veiculo: vehicle.tipo || "",
      Quilometragem: Number(inspection.quilometragem || 0),
      Pneus: checklistStatus(inspection, "pneus"),
      Estepe: checklistStatus(inspection, "estepe"),
      Farois: checklistStatus(inspection, "farois"),
      Lanternas: checklistStatus(inspection, "lanternas"),
      Setas: checklistStatus(inspection, "setas"),
      Luz_Freio: checklistStatus(inspection, "luzFreio"),
      Retrovisores: checklistStatus(inspection, "retrovisores"),
      ParaBrisa: checklistStatus(inspection, "paraBrisa"),
      Limpadores: checklistStatus(inspection, "limpadores"),
      Cintos: checklistStatus(inspection, "cintos"),
      Buzina: checklistStatus(inspection, "buzina"),
      Documentacao: checklistStatus(inspection, "documentacao"),
      Condicao_Externa: checklistStatus(inspection, "condicaoExterna"),
      Condicao_Interna: checklistStatus(inspection, "condicaoInterna"),
      Vazamentos: checklistStatus(inspection, "vazamentos"),
      Resultado_Vistoria: inspection.resultado || "",
      Observacoes: inspection.observacoes || ""
    };
  }

  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    const sources = [
      "vendor/xlsx.full.min.js",
      "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"
    ];
    const trySource = (index) => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = sources[index];
      script.dataset.sheetjs = "true";
      script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("O SheetJS não foi inicializado."));
      script.onerror = () => {
        script.remove();
        if (index + 1 < sources.length) {
          trySource(index + 1).then(resolve).catch(reject);
        } else {
          reject(new Error("Falha ao carregar o SheetJS."));
        }
      };
      document.head.appendChild(script);
    });
    return trySource(0);
  }

  async function exportXlsx() {
    if (!inspections.length) {
      window.AppUtils.toast("Nenhum dado para exportar", "Cadastre ao menos uma vistoria antes de gerar o arquivo.", "error");
      return;
    }
    const button = document.querySelector("#export-button");
    button.disabled = true;
    button.textContent = "Preparando arquivo...";
    try {
      const XLSX = await loadSheetJs();
      const rows = inspections.map(flatten);
      const worksheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
      worksheet["!autofilter"] = { ref: worksheet["!ref"] };
      worksheet["!cols"] = COLUMNS.map((column) => ({ wch: Math.min(42, Math.max(12, column.length + 2)) }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Vistorias");
      const today = window.AppUtils.localIsoDate(new Date());
      XLSX.writeFile(workbook, `vistorias_${today}.xlsx`, { compression: true });
      window.AppUtils.toast("Exportação concluída", `${rows.length} ${rows.length === 1 ? "vistoria foi exportada" : "vistorias foram exportadas"}.`, "success");
    } catch (error) {
      window.AppUtils.handleError("Não foi possível gerar o Excel. Verifique se a pasta vendor está completa.", error);
    } finally {
      button.disabled = false;
      button.innerHTML = `<svg><use href="#icon-download"></use></svg>Gerar arquivo Excel`;
    }
  }

  async function render() {
    inspections = await window.DataService.list("vistorias");
    document.querySelector("#export-count").textContent = inspections.length;
    document.querySelector("#export-button").disabled = inspections.length === 0;
  }

  function init() {
    document.querySelector("#export-columns").innerHTML = COLUMNS.map((column) => `<code>${column}</code>`).join("");
    document.querySelector("#export-button").addEventListener("click", exportXlsx);
  }

  window.Exportacao = { init, render, flatten, columns: COLUMNS };
})();
