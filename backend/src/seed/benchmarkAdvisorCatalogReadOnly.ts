import 'dotenv/config';
import mongoose from 'mongoose';
import { AdvisorConversation } from '../models/AdvisorConversation';
import {
  analyzeAdvisorTurn, EMPTY_ADVISOR_REQUIREMENTS, getAdvisorClarification,
  mergeAdvisorRequirements, respondToAdvisorTurn, resolveAdvisorIntent,
} from '../services/productAdvisor';
import { createAdvisorRequestTrace, finishAdvisorRequestTrace, recordAdvisorPhase, withAdvisorRequestTrace } from '../services/advisorPerformance';
import { createRuleAnalysis as createIntentRuleAnalysis, detectAdvisorIntent, shouldUseOllamaForIntent } from '../services/advisorIntent';

const runCountConfig = Number(process.env.ADVISOR_CATALOG_BENCHMARK_RUNS);
const runCount = Number.isInteger(runCountConfig) && runCountConfig >= 3 && runCountConfig <= 20 ? runCountConfig : 5;
const conversationId = '__task5_read_only_benchmark_nonexistent__';
const message = process.env.ADVISOR_CATALOG_BENCHMARK_QUERY?.trim() || 'Tìm laptop Lenovo dưới 25 triệu để lập trình';
const percentile = (values: number[], fraction: number) => values[Math.max(0, Math.ceil(values.length * fraction) - 1)];

async function runOnce() {
  const startedAt = performance.now();
  const trace = createAdvisorRequestTrace(startedAt);
  return withAdvisorRequestTrace(trace, async () => {
    const validationStartedAt = performance.now();
    const valid = typeof message === 'string' && message.trim().length > 0 && message.length <= 1000;
    if (!valid) throw new Error('Benchmark request fixture failed validation');
    recordAdvisorPhase('request_validation', performance.now() - validationStartedAt);

    const conversationLoadStartedAt = performance.now();
    await AdvisorConversation.findOne({ conversationId }).select('_id').lean();
    recordAdvisorPhase('conversation_load', performance.now() - conversationLoadStartedAt);

    const contextStartedAt = performance.now();
    const intentContext = {
      requirements: EMPTY_ADVISOR_REQUIREMENTS,
      currentSearchResultCount: 0,
      historicalProductReferenceCount: 0,
      recentMessages: [],
    };
    const detection = detectAdvisorIntent(message, intentContext);
    const analysis = shouldUseOllamaForIntent(detection)
      ? await analyzeAdvisorTurn(message, [], EMPTY_ADVISOR_REQUIREMENTS)
      : createIntentRuleAnalysis(detection, message, EMPTY_ADVISOR_REQUIREMENTS, []);
    const intent = resolveAdvisorIntent(analysis.intent, message, false, false, false);
    const requirements = mergeAdvisorRequirements(EMPTY_ADVISOR_REQUIREMENTS, analysis, message);
    const clarification = getAdvisorClarification(intent, requirements, false);
    recordAdvisorPhase('context_understanding', performance.now() - contextStartedAt);

    const result = await respondToAdvisorTurn({
      intent, requirements, history: [], latestMessage: message, previousProductIds: [],
      clarification, reuseCurrentResults: false, requestMoreProducts: false,
    });
    finishAdvisorRequestTrace(trace);
    return { trace, productCount: result.products.length, searchPerformed: result.searchPerformed };
  });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Read-only catalog benchmark could not connect to MongoDB; no connection details were emitted.');
    process.exitCode = 1;
    return;
  }
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  } catch {
    console.error('Read-only catalog benchmark could not connect to MongoDB; no connection details were emitted.');
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }

  try {
    const samples = [] as Array<Awaited<ReturnType<typeof runOnce>>>;
    for (let index = 0; index < runCount; index += 1) samples.push(await runOnce());
    const phases = ['request_validation', 'conversation_load', 'context_understanding', 'ollama_inference', 'embedding_inference',
      'mongo_retrieval', 'vector_retrieval', 'product_evaluation', 'response_generation', 'response_assembly', 'total_response'] as const;
    const measurements = Object.fromEntries(phases.map((phase) => {
      const values = samples.map((sample) => sample.trace.phases[phase]).filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
      return [phase, values.length ? {
        samples: values.length,
        p50Ms: Number(percentile(values, 0.5).toFixed(2)),
        p95Ms: Number(percentile(values, 0.95).toFixed(2)),
      } : { samples: 0, p50Ms: null, p95Ms: null }];
    }));
    console.log(JSON.stringify({
      kind: 'read_only_catalog_service_benchmark',
      note: 'Reads one guaranteed-nonexistent conversation key and executes normal verified catalog retrieval/evaluation. It does not create or modify conversation/product data.',
      measuredRuns: runCount,
      sampleResultCounts: samples.map(({ productCount, searchPerformed }) => ({ productCount, searchPerformed })),
      ollamaCallsPerRun: samples.map((sample) => sample.trace.calls),
      phases: measurements,
      qdrant: { status: 'not_used_by_this_repository', p50Ms: null, p95Ms: null },
    }, null, 2));
  } catch {
    console.error('Read-only catalog benchmark failed while querying; connection details and product facts were suppressed.');
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void main();
