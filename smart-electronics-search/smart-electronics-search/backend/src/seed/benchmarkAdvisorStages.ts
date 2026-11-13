import { createRuleAnalysis, detectAdvisorIntent, IntentContext } from '../services/advisorIntent';
import { buildNoResultReply, EMPTY_ADVISOR_REQUIREMENTS, evaluateAdvisorFit, mergeAdvisorRequirements } from '../services/productAdvisor';
import { getAdvisorPerformanceReport } from '../services/advisorPerformance';

const rawMessage = 'Tìm laptop Lenovo dưới 25 triệu để lập trình';
const payload = { message: rawMessage, conversation_id: 'b2a0a361-d767-4dc1-97e1-c858e9a8d7b2', client_message_id: '1992b65f-373e-474c-8771-861226c4f9a8' };
const context: IntentContext = {
  requirements: EMPTY_ADVISOR_REQUIREMENTS,
  currentSearchResultCount: 0,
  historicalProductReferenceCount: 0,
  recentMessages: [],
};
const iterationsEnv = Number(process.env.ADVISOR_STAGE_BENCHMARK_ITERATIONS);
const iterations = Number.isInteger(iterationsEnv) && iterationsEnv >= 100 && iterationsEnv <= 20000 ? iterationsEnv : 2000;
const reqContext = { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop' };
const noProductReply = () => buildNoResultReply(reqContext);

function validateCurrentAdvisorPayload(value: any) {
  return typeof value?.message === 'string' && Boolean(value.message.trim()) && value.message.length <= 1000
    && (value.conversation_id === undefined || /^[0-9a-f-]{36}$/i.test(value.conversation_id))
    && (value.client_message_id === undefined || /^[0-9a-f-]{36}$/i.test(value.client_message_id));
}

function percentile(sorted: number[], fraction: number) {
  return Number(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(4));
}

function measure(name: string, work: () => unknown) {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const start = performance.now();
    work();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { phase: name, iterations, p50Ms: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95) };
}

const phases = [
  measure('request_validation', () => validateCurrentAdvisorPayload(payload)),
  measure('context_understanding_and_requirement_merge', () => {
    const detection = detectAdvisorIntent(rawMessage, context);
    const analysis = createRuleAnalysis(detection, rawMessage, EMPTY_ADVISOR_REQUIREMENTS, context.recentMessages);
    mergeAdvisorRequirements(EMPTY_ADVISOR_REQUIREMENTS, analysis as any, rawMessage);
  }),
  measure('product_evaluation_empty_unknown_candidate', () => evaluateAdvisorFit({}, reqContext)),
  measure('deterministic_no_result_response_generation', noProductReply),
  measure('offline_code_path_total', () => {
    validateCurrentAdvisorPayload(payload);
    const detection = detectAdvisorIntent(rawMessage, context);
    const analysis = createRuleAnalysis(detection, rawMessage, EMPTY_ADVISOR_REQUIREMENTS, context.recentMessages);
    const requirements = mergeAdvisorRequirements(EMPTY_ADVISOR_REQUIREMENTS, analysis as any, rawMessage);
    evaluateAdvisorFit({}, requirements);
    buildNoResultReply(requirements);
  }),
];

console.log(JSON.stringify({
  kind: 'local_microbenchmark',
  disclaimer: 'No MongoDB read, product catalog row, vector index, or full HTTP request is used by this code-only microbenchmark.',
  phases,
  externalPhases: {
    conversationLoad: 'not_measured_without_database_access',
    mongoRetrieval: 'not_measured_without_database_access',
    atlasVectorRetrieval: 'not_measured_without_database_access',
    qdrantRetrieval: 'not_applicable_repository_uses_mongodb_atlas_vector_search',
    totalHttpResponse: 'not_measured_without_database_access',
  },
  liveRequestMetrics: getAdvisorPerformanceReport(),
}, null, 2));
