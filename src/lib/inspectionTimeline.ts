import type { Inspection } from "../types";

// Sequência por veículo ("1ª vistoria", "2ª vistoria"...). Não confundir com o código global VST-XXXXXX.
// Mantenha este algoritmo idêntico a functions/src/inspectionSequence.ts (validação no servidor).
export const MAX_INSPECTION_SEQUENCE = 9999;

export interface SequenceCandidate {
  id: string;
  code?: unknown;
  sequence?: unknown;
  deleted?: unknown;
  createdAt?: unknown;
  completedAt?: unknown;
  inspectionDate?: unknown;
  inspectionTime?: unknown;
}

export function persistedSequence(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_INSPECTION_SEQUENCE ? parsed : null;
}

function chronologicalTimestamp(candidate: SequenceCandidate): number {
  for (const value of [candidate.createdAt, candidate.completedAt]) {
    if (!value) continue;
    const timestamp = Date.parse(String(value));
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const timestamp = Date.parse(`${String(candidate.inspectionDate || "")}T${String(candidate.inspectionTime || "00:00")}:00Z`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareChronologically(left: SequenceCandidate, right: SequenceCandidate): number {
  return chronologicalTimestamp(left) - chronologicalTimestamp(right)
    || String(left.code || "").localeCompare(String(right.code || ""))
    || left.id.localeCompare(right.id);
}

/**
 * Sequência efetiva das vistorias de um mesmo veículo: a sequência persistida quando existe; vistorias legadas
 * (sem sequência persistida) recebem 1..n em ordem cronológica somente entre as legadas. Excluídas não participam.
 */
export function effectiveInspectionSequences(candidates: SequenceCandidate[]): Map<string, number> {
  const result = new Map<string, number>();
  const legacy: SequenceCandidate[] = [];
  for (const candidate of candidates) {
    if (candidate.deleted === true) continue;
    const persisted = persistedSequence(candidate.sequence);
    if (persisted === null) legacy.push(candidate);
    else result.set(candidate.id, persisted);
  }
  [...legacy].sort(compareChronologically).forEach((candidate, index) => result.set(candidate.id, index + 1));
  return result;
}

export function nextInspectionSequence(sequences: Iterable<number>): number {
  let highest = 0;
  for (const sequence of sequences) highest = Math.max(highest, sequence);
  return Math.min(highest + 1, MAX_INSPECTION_SEQUENCE);
}

export interface VehicleSequenceSummary { nextSequence: number; usedSequences: number[] }

/** Próxima sequência sugerida (maior + 1) e sequências já usadas por um veículo, ignorando a vistoria em edição. */
export function vehicleSequenceSummary(candidates: SequenceCandidate[], excludeId?: string | null): VehicleSequenceSummary {
  const effective = effectiveInspectionSequences(candidates);
  const used = [...effective].filter(([id]) => id !== excludeId).map(([, sequence]) => sequence).sort((left, right) => left - right);
  return { nextSequence: nextInspectionSequence(used), usedSequences: used };
}

function vehicleIdentity(inspection: Inspection): string | null {
  if (inspection.vehicleId) return inspection.vehicleId;
  const snapshotVehicle = inspection.snapshot?.vehicle;
  return typeof snapshotVehicle?.id === "string" && snapshotVehicle.id ? snapshotVehicle.id : null;
}

export function summarizeInspectionTimeline(inspections: Inspection[], recentLimit = 8) {
  const operationalInspections = inspections.filter((inspection) => inspection.deleted !== true);
  const byVehicle = new Map<string, Inspection[]>();
  for (const inspection of operationalInspections) {
    const vehicleId = vehicleIdentity(inspection);
    if (vehicleId) byVehicle.set(vehicleId, [...(byVehicle.get(vehicleId) || []), inspection]);
  }
  const sequences = new Map<string, number>();
  for (const group of byVehicle.values()) for (const [id, sequence] of effectiveInspectionSequences(group)) sequences.set(id, sequence);

  const sequenced = operationalInspections.map((inspection) => ({ ...inspection, sequence: sequences.get(inspection.id) ?? persistedSequence(inspection.sequence) ?? 1 }));
  // Com lançamentos retroativos, a situação atual do veículo é a da vistoria de maior sequência.
  const latestByVehicle = new Map<string, Inspection & { sequence: number }>();
  for (const inspection of sequenced) {
    const vehicleId = vehicleIdentity(inspection);
    if (!vehicleId) continue;
    const current = latestByVehicle.get(vehicleId);
    if (!current || inspection.sequence > current.sequence || (inspection.sequence === current.sequence && compareChronologically(inspection, current) > 0)) latestByVehicle.set(vehicleId, inspection);
  }

  const orderedInspections = sequenced.sort((left, right) => compareChronologically(right, left));
  return {
    pendingVehicles: [...latestByVehicle.values()].filter((inspection) => inspection.result === "REPROVADO").length,
    inspections: orderedInspections,
    recentInspections: orderedInspections.slice(0, recentLimit)
  };
}
