import { describe, expect, it } from "vitest";
import { analyzeImportRows, type ExistingEntities, type ImportWorkbookRows } from "./importWorkbook";

const empty: ExistingEntities = { clients: [], projects: [], companies: [], accessProfiles: [], drivers: [], vehicles: [] };

describe("análise de importação em massa", () => {
  it("valida um fluxo completo com relacionamentos", () => {
    const workbook: ImportWorkbookRows = {
      Clientes: [{ Razao_Social: "Cliente Importado S.A.", Nome_Fantasia: "Cliente Importado", CNPJ: "40.688.134/0001-61", Ativo: "Sim" }],
      Projetos: [{ Cliente_CNPJ: "40.688.134/0001-61", Nome: "Projeto Norte", Codigo: "PN-01", Ativo: "Sim" }],
      Empresas: [{ Cliente_CNPJ: "40.688.134/0001-61", Razao_Social: "Empresa Importada Ltda.", CNPJ: "04.252.011/0001-10", Tipo_Contrato: "Direto", Projetos_Codigos: "PN-01", Ativo: "Sim" }],
      Perfis_Acesso: [{ Cliente_CNPJ: "40.688.134/0001-61", Nome: "Operacional", Cor: "#0056A4", Ativo: "Sim" }],
      Motoristas: [{ Empresa_CNPJ: "04.252.011/0001-10", Nome: "Motorista Importado", Matricula: "M-01", Categoria_CNH: "D", Validade_CNH: "2029-12-31", Ativo: "Sim" }],
      Veiculos: [{ Empresa_CNPJ: "04.252.011/0001-10", Projeto_Codigo: "PN-01", Perfil_Acesso: "Operacional", Placa: "ABC1D23", Marca: "Marca", Modelo: "Modelo", Ano: "2026", Tipo: "Caminhão", Quilometragem: "0", Propriedade: "Próprio", Motoristas_Matriculas: "M-01", Ativo: "Sim" }]
    };

    const result = analyzeImportRows(workbook, empty);
    expect(result).toHaveLength(6);
    expect(result.every((item) => item.status === "valid")).toBe(true);
  });

  it("sinaliza referência inexistente sem gravar a linha", () => {
    const result = analyzeImportRows({ Projetos: [{ Cliente_CNPJ: "40.688.134/0001-61", Nome: "Órfão", Codigo: "ORF" }] }, empty);
    expect(result[0].status).toBe("invalid");
    expect(result[0].errors.join(" ")).toMatch(/cliente não encontrado/i);
  });
});

describe("importação de veículo e motorista em várias empresas", () => {
  const base: ImportWorkbookRows = {
    Clientes: [{ Razao_Social: "Cliente Importado S.A.", Nome_Fantasia: "Cliente Importado", CNPJ: "40.688.134/0001-61", Ativo: "Sim" }],
    Projetos: [{ Cliente_CNPJ: "40.688.134/0001-61", Nome: "Projeto Norte", Codigo: "PN-01", Ativo: "Sim" }],
    Empresas: [
      { Cliente_CNPJ: "40.688.134/0001-61", Razao_Social: "Tequaly Ltda.", CNPJ: "04.252.011/0001-10", Tipo_Contrato: "Direto", Projetos_Codigos: "PN-01", Ativo: "Sim" },
      { Cliente_CNPJ: "40.688.134/0001-61", Razao_Social: "Palmont Ltda.", CNPJ: "11.444.777/0001-61", Tipo_Contrato: "Direto", Projetos_Codigos: "PN-01", Ativo: "Sim" }
    ],
    Perfis_Acesso: [{ Cliente_CNPJ: "40.688.134/0001-61", Nome: "Operacional", Cor: "#0056A4", Ativo: "Sim" }]
  };

  it("aceita vários CNPJs em Empresa_CNPJ para motorista e veículo", () => {
    const result = analyzeImportRows({
      ...base,
      Motoristas: [{ Empresa_CNPJ: "04.252.011/0001-10; 11.444.777/0001-61", Nome: "Motorista Compartilhado", Matricula: "M-01", Categoria_CNH: "D", Validade_CNH: "2029-12-31" }],
      Veiculos: [{ Empresa_CNPJ: "04.252.011/0001-10; 11.444.777/0001-61", Projeto_Codigo: "PN-01", Perfil_Acesso: "Operacional", Placa: "WIN1A23", Marca: "Mercedes", Modelo: "Sprinter", Ano: "2024", Tipo: "Van", Quilometragem: "0", Motoristas_Matriculas: "M-01" }]
    }, empty);
    expect(result.every((item) => item.status === "valid")).toBe(true);
    expect(result.find((item) => item.entity === "vehicles")?.data.companyDocuments).toEqual(["04252011000110", "11444777000161"]);
  });

  it("recusa matrícula repetida em uma das empresas do motorista", () => {
    const result = analyzeImportRows({
      ...base,
      Motoristas: [
        { Empresa_CNPJ: "11.444.777/0001-61", Nome: "Primeiro", Matricula: "M-01", Categoria_CNH: "D", Validade_CNH: "2029-12-31" },
        { Empresa_CNPJ: "04.252.011/0001-10; 11.444.777/0001-61", Nome: "Segundo", Matricula: "M-01", Categoria_CNH: "D", Validade_CNH: "2029-12-31" }
      ]
    }, empty);
    expect(result.filter((item) => item.entity === "drivers").map((item) => item.status)).toEqual(["valid", "invalid"]);
  });

  it("mantém a placa única mesmo com várias empresas", () => {
    const vehicle = { Projeto_Codigo: "PN-01", Perfil_Acesso: "Operacional", Placa: "WIN1A23", Marca: "Mercedes", Modelo: "Sprinter", Ano: "2024", Tipo: "Van", Quilometragem: "0" };
    const result = analyzeImportRows({ ...base, Veiculos: [{ ...vehicle, Empresa_CNPJ: "04.252.011/0001-10" }, { ...vehicle, Empresa_CNPJ: "11.444.777/0001-61" }] }, empty);
    expect(result.filter((item) => item.entity === "vehicles").map((item) => item.status)).toEqual(["valid", "invalid"]);
  });
});