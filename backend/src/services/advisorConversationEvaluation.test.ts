import assert from 'node:assert/strict';
import test from 'node:test';
import { ADVISOR_DIALOGUE_SCENARIOS, evaluateAdvisorDialogues } from './advisorConversationEvaluation';

test('the dialogue corpus has at least 40 complete, reviewable scenarios', () => {
  assert.ok(ADVISOR_DIALOGUE_SCENARIOS.length >= 40);
  const ids = new Set(ADVISOR_DIALOGUE_SCENARIOS.map((item) => item.id));
  assert.equal(ids.size, ADVISOR_DIALOGUE_SCENARIOS.length);
  const groups = new Set(ADVISOR_DIALOGUE_SCENARIOS.map((item) => item.group));
  for (const requiredGroup of [
    'budget change', 'brand change', 'model change', 'criterion removal', 'add criterion', 'previous product follow-up',
    'cheaper request', 'lighter request', 'battery request', 'comparison', 'compatibility', 'missing catalog specification',
    'conflicting requirements', 'out of scope', 'unaccented Vietnamese',
  ]) assert.ok(groups.has(requiredGroup), `missing required scenario group: ${requiredGroup}`);
  for (const scenario of ADVISOR_DIALOGUE_SCENARIOS) {
    assert.ok(scenario.turns.length >= 1, scenario.id);
    assert.equal(scenario.productGroundTruth.status, 'not_provided', scenario.id);
    for (const turn of scenario.turns) {
      assert.ok(turn.user.trim(), scenario.id);
      assert.ok(turn.expectedIntent, scenario.id);
      assert.ok(turn.expectedRequirements && typeof turn.expectedRequirements === 'object', scenario.id);
      assert.ok(Array.isArray(turn.forbiddenClaims) && turn.forbiddenClaims.length > 0, scenario.id);
      assert.ok(Array.isArray(turn.reviewCriteria) && turn.reviewCriteria.length > 0, scenario.id);
      assert.ok(['code_deterministic', 'model_dependent', 'catalog_dependent', 'human_review'].includes(turn.evaluationClass), scenario.id);
    }
  }
});

test('deterministic evaluation only scores rows with explicit fixture expectations', () => {
  const report = evaluateAdvisorDialogues();
  assert.ok(report.turnCount >= 40);
  assert.equal(report.metrics.intentAccuracy.denominator, report.classCounts.code_deterministic - report.deterministicFailures.filter((item) => item.dimension === 'deterministic_confidence').length);
  assert.equal(report.metrics.constraintViolationRate.status, 'not_assessed');
  assert.equal(report.metrics.productRelevance.status, 'not_assessed');
  assert.equal(report.metrics.explanationFactuality.status, 'not_assessed');
  assert.equal(report.metrics.followUpQuality.status, 'not_assessed');
  assert.equal(report.metrics.appropriateClarificationRate.status, 'scored');
});
