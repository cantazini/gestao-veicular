import { describe, expect, it } from "vitest";
import { summarizeInspectionTimeline, vehicleSequenceSummary } from "./inspectionTimeline";
import type { Inspection } from "../types";

function inspection(id: string, vehicleId: string, result: Inspection["result"], createdAt: string, deleted = false): Inspection {
  return {
    id, vehicleId, result, createdAt, code: `VST-${id.padStart(6, "0")}`,
    inspectionDate: createdAt.slice(0, 10), inspectionTime: createdAt.slice(11, 16), mileage: 100,
    compliancePercentage: result === "APROVADO" ? 100 : 80, deleted
  };
}

describe("summarizeInspectionTimeline", () => {
  it("numera reprovação e aprovação do mesmo veículo e remove a pendência atual", () => {
    const result = summarizeInspectionTimeline([
      inspection("2", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z"),
      inspection("1", "vehicle-a", "REPROVADO", "2026-01-01T10:00:00.000Z")
    ]);
    expect(result.recentInspections.map((item) => item.sequence)).toEqual([2, 1]);
    expect(result.pendingVehicles).toBe(0);
  });

  it("conta como pendente um veículo cuja única vistoria foi reprovada", () => {
    expect(summarizeInspectionTimeline([inspection("1", "vehicle-a", "REPROVADO", "2026-01-01T10:00:00.000Z")]).pendingVehicles).toBe(1);
  });

  it("não conta como pendente um veículo cuja única vistoria foi aprovada", () => {
    expect(summarizeInspectionTimeline([inspection("1", "vehicle-a", "APROVADO", "2026-01-01T10:00:00.000Z")]).pendingVehicles).toBe(0);
  });

  it("considera somente o resultado mais recente de cada veículo", () => {
    const result = summarizeInspectionTimeline([
      inspection("1", "vehicle-a", "REPROVADO", "2026-01-01T10:00:00.000Z"),
      inspection("2", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z"),
      inspection("3", "vehicle-b", "REPROVADO", "2026-01-03T10:00:00.000Z")
    ]);
    expect(result.pendingVehicles).toBe(1);
  });

  it("não inclui veículo sem vistoria no KPI", () => {
    expect(summarizeInspectionTimeline([]).pendingVehicles).toBe(0);
  });

  it("mantém sequências independentes por vehicleId e desempate determinístico", () => {
    const result = summarizeInspectionTimeline([
      inspection("2", "vehicle-b", "APROVADO", "2026-01-01T10:00:00.000Z"),
      inspection("3", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z"),
      inspection("1", "vehicle-a", "REPROVADO", "2026-01-01T10:00:00.000Z"),
      inspection("4", "vehicle-b", "REPROVADO", "2026-01-02T10:00:00.000Z")
    ]);
    expect(result.recentInspections.map(({ vehicleId, sequence }) => [vehicleId, sequence])).toEqual([
      ["vehicle-b", 2], ["vehicle-a", 2], ["vehicle-b", 1], ["vehicle-a", 1]
    ]);
  });

  it("preserva a sequência completa ao filtrar somente reprovações", () => {
    const history = summarizeInspectionTimeline([
      inspection("1", "vehicle-a", "APROVADO", "2026-01-01T10:00:00.000Z"),
      inspection("2", "vehicle-a", "REPROVADO", "2026-01-02T10:00:00.000Z"),
      inspection("3", "vehicle-a", "APROVADO", "2026-01-03T10:00:00.000Z")
    ]).inspections;
    expect(history.filter((item) => item.result === "REPROVADO").map((item) => item.sequence)).toEqual([2]);
  });

  it("remove vistorias excluídas do Histórico, Reprovações e total operacional", () => {
    const result = summarizeInspectionTimeline([
      inspection("1", "vehicle-a", "REPROVADO", "2026-01-01T10:00:00.000Z", true),
      inspection("2", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z")
    ]);
    expect(result.inspections.map((item) => item.id)).toEqual(["2"]);
    expect(result.inspections.filter((item) => item.result === "REPROVADO")).toHaveLength(0);
  });

  it("recalcula a sequência sem lacuna e preserva os códigos oficiais", () => {
    const result = summarizeInspectionTimeline([
      inspection("1", "vehicle-a", "APROVADO", "2026-01-01T10:00:00.000Z"),
      inspection("2", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z", true),
      inspection("3", "vehicle-a", "APROVADO", "2026-01-03T10:00:00.000Z")
    ]);
    expect(result.inspections.map(({ code, sequence }) => [code, sequence])).toEqual([
      ["VST-000003", 2], ["VST-000001", 1]
    ]);
  });

  it("usa a sequência persistida, inclusive retroativa e com lacunas", () => {
    const result = summarizeInspectionTimeline([
      { ...inspection("1", "vehicle-a", "APROVADO", "2026-01-01T10:00:00.000Z"), sequence: 1 },
      { ...inspection("2", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z"), sequence: 4 },
      { ...inspection("3", "vehicle-a", "REPROVADO", "2026-01-03T10:00:00.000Z"), sequence: 2 }
    ]);
    expect(result.inspections.map(({ code, sequence }) => [code, sequence])).toEqual([["VST-000003", 2], ["VST-000002", 4], ["VST-000001", 1]]);
  });

  it("considera pendente o veículo pela vistoria de maior sequência, não pela última lançada", () => {
    const result = summarizeInspectionTimeline([
      { ...inspection("1", "vehicle-a", "APROVADO", "2026-01-01T10:00:00.000Z"), sequence: 4 },
      { ...inspection("2", "vehicle-a", "REPROVADO", "2026-01-05T10:00:00.000Z"), sequence: 2 }
    ]);
    expect(result.pendingVehicles).toBe(0);
  });

  it("mantém a numeração das legadas ao lado de sequências persistidas", () => {
    const result = summarizeInspectionTimeline([
      inspection("1", "vehicle-a", "APROVADO", "2026-01-01T10:00:00.000Z"),
      inspection("2", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z"),
      { ...inspection("3", "vehicle-a", "APROVADO", "2026-01-03T10:00:00.000Z"), sequence: 3 }
    ]);
    expect(result.inspections.map(({ id, sequence }) => [id, sequence])).toEqual([["3", 3], ["2", 2], ["1", 1]]);
  });

  it("volta à reprovação anterior quando a aprovação mais recente é excluída", () => {
    const result = summarizeInspectionTimeline([
      inspection("1", "vehicle-a", "REPROVADO", "2026-01-01T10:00:00.000Z"),
      inspection("2", "vehicle-a", "APROVADO", "2026-01-02T10:00:00.000Z", true)
    ]);
    expect(result.pendingVehicles).toBe(1);
    expect(result.recentInspections[0]).toMatchObject({ id: "1", sequence: 1, result: "REPROVADO" });
  });
});

describe("vehicleSequenceSummary", () => {
  it("sugere a próxima sequência automaticamente", () => {
    expect(vehicleSequenceSummary([])).toEqual({ nextSequence: 1, usedSequences: [] });
    expect(vehicleSequenceSummary([{ id: "a", sequence: 1 }, { id: "b", sequence: 2 }]).nextSequence).toBe(3);
  });
  it("mantém lacunas disponíveis para lançamento retroativo", () => {
    expect(vehicleSequenceSummary([{ id: "a", sequence: 1 }, { id: "b", sequence: 4 }])).toEqual({ nextSequence: 5, usedSequences: [1, 4] });
  });
  it("ignora a vistoria em edição e as excluídas", () => {
    expect(vehicleSequenceSummary([{ id: "a", sequence: 1 }, { id: "b", sequence: 2 }, { id: "c", sequence: 3, deleted: true }], "b")).toEqual({ nextSequence: 2, usedSequences: [1] });
  });
});