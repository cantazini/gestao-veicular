(function () {
  "use strict";

  async function render() {
    const [inspections, vehicles, drivers, companies] = await Promise.all([
      window.DataService.list("vistorias"),
      window.DataService.list("veiculos"),
      window.DataService.list("motoristas"),
      window.DataService.list("empresas")
    ]);
    document.querySelector("#metric-vistorias").textContent = inspections.length;
    document.querySelector("#metric-veiculos").textContent = vehicles.length;
    document.querySelector("#metric-motoristas").textContent = drivers.length;
    document.querySelector("#metric-empresas").textContent = companies.length;
    document.querySelector("#metric-nao-conformes").textContent = inspections.filter((inspection) => inspection.resultado === "ATENÇÃO").length;

    const latest = inspections
      .sort((a, b) => `${b.data || ""}T${b.hora || ""}`.localeCompare(`${a.data || ""}T${a.hora || ""}`))
      .slice(0, 7);
    document.querySelector("#dashboard-latest").innerHTML = latest.length ? latest.map((inspection) => `
      <tr>
        <td class="primary-cell">${window.AppUtils.formatDate(inspection.data)}<span class="secondary-line">${window.AppUtils.escape(inspection.hora)}</span></td>
        <td>${window.AppUtils.escape(inspection.empresa && inspection.empresa.nome)}</td>
        <td>${window.AppUtils.escape(`${inspection.veiculo && inspection.veiculo.placa || ""} • ${inspection.veiculo && inspection.veiculo.modelo || ""}`)}</td>
        <td>${window.AppUtils.escape(inspection.fiscalizador)}</td>
        <td>${window.AppUtils.resultPill(inspection.resultado)}</td>
      </tr>`).join("") : window.AppUtils.emptyRow(5, "Ainda não existem vistorias cadastradas.");
  }

  window.Dashboard = { init() {}, render };
})();

