import { AsyncLocalStorage } from 'node:async_hooks';

export const ADVISOR_TIMING_PHASES = [
  'request_validation', 'conversation_load', 'context_understanding', 'ollama_inference', 'embedding_inference',
  'mongo_retrieval', 'vector_retrieval', 'product_evaluation', 'response_generation', 'response_assembly', 'total_response',
] as const;
export type AdvisorTimingPhase = typeof ADVISOR_TIMING_PHASES[number];
export type AdvisorCallKind = 'ollama_chat' | 'ollama_embedding';

export interface AdvisorRequestTrace {
  startedAt: number;
  signal?: AbortSignal;
  phases: Partial<Record<AdvisorTimingPhase, number>>;
  calls: Record<AdvisorCallKind, number>;
  recorded: boolean;
}

const traceStorage = new AsyncLocalStorage<AdvisorRequestTrace>();
const SAMPLE_LIMIT = 512;
const phaseSamples = new Map<AdvisorTimingPhase, number[]>();
const callSamples = new Map<AdvisorCallKind, number[]>();
let observedRequests = 0;

export function createAdvisorRequestTrace(startedAt = performance.now(), signal?: AbortSignal): AdvisorRequestTrace {
  return { startedAt, signal, phases: {}, calls: { ollama_chat: 0, ollama_embedding: 0 }, recorded: false };
}

export function withAdvisorRequestTrace<T>(trace: AdvisorRequestTrace, work: () => Promise<T>): Promise<T> {
  return traceStorage.run(trace, work);
}

export function recordAdvisorPhase(phase: AdvisorTimingPhase, durationMs: number) {
  const trace = traceStorage.getStore();
  if (!trace || !Number.isFinite(durationMs) || durationMs < 0) return;
  trace.phases[phase] = (trace.phases[phase] ?? 0) + durationMs;
}

export function countAdvisorCall(kind: AdvisorCallKind) {
  const trace = traceStorage.getStore();
  if (trace) trace.calls[kind]++;
}

export function getAdvisorRequestSignal() {
  return traceStorage.getStore()?.signal;
}

function pushSample<T>(map: Map<T, number[]>, key: T, value: number) {
  const samples = map.get(key) ?? [];
  samples.push(value);
  if (samples.length > SAMPLE_LIMIT) samples.splice(0, samples.length - SAMPLE_LIMIT);
  map.set(key, samples);
}

export function finishAdvisorRequestTrace(trace: AdvisorRequestTrace) {
  if (trace.recorded) return;
  trace.recorded = true;
  trace.phases.total_response = Math.max(0, performance.now() - trace.startedAt);
  observedRequests++;
  for (const [phase, duration] of Object.entries(trace.phases) as Array<[AdvisorTimingPhase, number]>) pushSample(phaseSamples, phase, duration);
  for (const kind of Object.keys(trace.calls) as AdvisorCallKind[]) pushSample(callSamples, kind, trace.calls[kind]);
}

function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(2));
}

function distribution(values: number[]) {
  return values.length ? {
    samples: values.length, p50Ms: percentile(values, 0.5), p95Ms: percentile(values, 0.95),
  } : { samples: 0, p50Ms: null, p95Ms: null };
}

export function getAdvisorPerformanceReport() {
  const phases = Object.fromEntries(ADVISOR_TIMING_PHASES.map((phase) => [phase, distribution(phaseSamples.get(phase) ?? [])]));
  const calls = Object.fromEntries((['ollama_chat', 'ollama_embedding'] as const).map((kind) => {
    const values = callSamples.get(kind) ?? [];
    return [kind, values.length ? {
      samples: values.length,
      p50PerRequest: percentile(values, 0.5),
      p95PerRequest: percentile(values, 0.95),
      total: values.reduce((sum, value) => sum + value, 0),
    } : { samples: 0, p50PerRequest: null, p95PerRequest: null, total: 0 }];
  }));
  return {
    generatedAt: new Date().toISOString(),
    observedRequests,
    sampleWindow: SAMPLE_LIMIT,
    phases,
    calls,
    vectorBackend: 'mongodb_atlas_vector_search',
    qdrant: { status: 'not_used_by_this_repository', p50Ms: null, p95Ms: null },
  };
}
