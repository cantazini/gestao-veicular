import { HttpsError } from "firebase-functions/v2/https";

// Mantenha este algoritmo idêntico a src/lib/inspectionTimeline.ts (frontend).
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

function millis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function chronologicalTimestamp(candidate: SequenceCandidate): number {
  for (const value of [candidate.createdAt, candidate.completedAt]) {
    const parsed = millis(value);
    if (parsed !== null) return parsed;
  }
  const parsed = Date.parse(`${String(candidate.inspectionDate || "")}T${String(candidate.inspectionTime || "00:00")}:00Z`);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareChronologically(left: SequenceCandidate, right: SequenceCandidate): number {
  return chronologicalTimestamp(left) - chronologicalTimestamp(right)
    || String(left.code || "").localeCompare(String(right.code || ""))
    || left.id.localeCompare(right.id);
}

/**
 * Sequência efetiva por vistoria de um mesmo veículo.
 * Vistorias com `sequence` persistida mantêm o valor informado. Vistorias legadas (sem `sequence`)
 * recebem 1..n em ordem cronológica somente entre as legadas, reproduzindo a numeração histórica.
 * Vistorias com exclusão lógica (`deleted: true`) não participam.
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

export function inspectionSequenceKey(vehicleId: string, sequence: number) {
  return `inspection-sequence:${vehicleId}:${sequence}`;
}

export interface SequencePlan {
  sequence: number;
  /** Vistorias legadas do veículo cuja sequência efetiva deve ser congelada (persistida). */
  freeze: Array<{ id: string; sequence: number }>;
}

/**
 * Define a sequência de uma vistoria (nova ou editada) dentro do histórico do veículo.
 * `candidates` deve conter as vistorias do veículo de destino, incluindo a própria vistoria quando ela já pertence a ele.
 */
export function planInspectionSequence(candidates: SequenceCandidate[], inspectionId: string, requested: number | undefined): SequencePlan {
  const effective = effectiveInspectionSequences(candidates);
  const others = new Map([...effective].filter(([id]) => id !== inspectionId));
  const sequence = requested ?? effective.get(inspectionId) ?? nextInspectionSequence(others.values());
  if ([...others.values()].includes(sequence)) {
    throw new HttpsError("already-exists", `Já existe a ${sequence}ª vistoria para este veículo. Informe outra sequência.`);
  }
  return { sequence, freeze: legacyFreeze(candidates, effective, inspectionId) };
}

/** Sequências efetivas das vistorias legadas (exceto `excludeId`) para persistir antes de mudar o histórico. */
export function legacyFreeze(candidates: SequenceCandidate[], effective: Map<string, number>, excludeId: string) {
  return candidates
    .filter((candidate) => candidate.id !== excludeId && candidate.deleted !== true && persistedSequence(candidate.sequence) === null)
    .map((candidate) => ({ id: candidate.id, sequence: effective.get(candidate.id)! }));
}
