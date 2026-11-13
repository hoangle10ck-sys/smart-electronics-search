# Advisor conversation evaluation

Run `npm run evaluate:advisor` from `backend/` for the curated deterministic conversation report. It uses the existing intent rule engine and requirement merge code and makes no calls to MongoDB, Qwen, or product search.

## Corpus and scoring boundaries

`src/services/advisorConversationEvaluation.ts` contains 50 conversation scenarios (52 turns) across budget, brand/model/category changes, additions/removals, prior result references, comparative requests, compatibility, missing specifications, contradictory requirements, clarification, out-of-scope topics, and unaccented Vietnamese. Each turn carries the expected intent, a complete expected requirement snapshot, expected changed fields and clarification behavior, forbidden claims, and a review rubric.

Rows are explicitly labeled as:

- `code_deterministic`: scored against deterministic intent and requirement behavior when the rule confidence meets its configured threshold.
- `model_dependent`: requires capturing a real Qwen-backed route response; the deterministic runner leaves it unscored.
- `catalog_dependent`: requires a dated catalog/retrieval snapshot and verified product IDs.
- `human_review`: requires applying the turn's review criteria to an actual assistant response.

No catalog snapshot or product IDs are bundled with this fixture. Therefore product relevance and constraint violation rate are reported as `not_assessed`, not PASS. Explanation factuality and follow-up quality also remain `not_assessed` until real responses are checked against product facts and the rubric. The scenario corpus does not fabricate products to manufacture expected results.

The report currently computes intent accuracy, full requirement extraction accuracy, retention of unmentioned requirement fields, explicitly changed-field accuracy, and rule-level clarification accuracy. It reports fixture-level deterministic failures and metric sample counts.

## Feedback

The advisor feedback endpoint stores one rating per assistant message plus separately keyed wrong-advice and product-level irrelevance reports. It records only UUID references, rating, error category, product ID when applicable, and assistant intent. It does not store message text, comments, names, or contact details. A repeated report replaces the same report key; product reports for separate cards remain separate. Feedback never changes search weights or advisor behavior automatically.

`GET /v1/chat/feedback/summary` is protected by the existing `ADMIN_API_TOKEN` middleware and returns aggregate counts by rating, report type, error category, and most-reported product IDs. Developers should use these counts to inspect recurring classes before proposing a model or search change.

## Metric review rubric

- **Intent accuracy:** exact intent label against the expected label on rule-scored turns.
- **Requirement extraction:** field-by-field equality with the expected full state after each scored turn.
- **Context retention:** unmentioned fields retain the prior value.
- **Requirement update:** explicitly changed fields match their expected value or removal.
- **Constraint violation rate:** requires actual results and independently verified hard constraints; do not infer this from a dialogue-only fixture.
- **Product relevance:** requires product-level human/curated judgments for actual results.
- **Explanation factuality:** check every product claim, number, URL, and compatibility assertion against verified backend facts.
- **Follow-up quality:** human review should check directness, usefulness, tone, and whether the question resolves the actual ambiguity without discarding confirmed needs.
- **Appropriate clarification:** rule-scored turns compare whether clarification was required. Human/model-dependent rows require response review.

The runner is a regression aid, not a substitute for a model-backed evaluation or a catalog-grounded audit. It does not claim full natural-language factuality coverage.

## Latest rule-only run

On 2026-11-12, the runner evaluated 50 scenarios / 52 turns: 21 deterministic, 15 model-dependent, 12 catalog-dependent, and 4 human-review turns. The deterministic slice scored:

| Metric | Result |
| --- | ---: |
| Intent accuracy | 14/21 (66.7%) |
| Requirement extraction | 294/315 field checks (93.3%) |
| Context retention | 282/295 checks (95.6%) |
| Requirement updates | 12/20 changed-field checks (60.0%) |
| Appropriate clarification | 20/21 (95.2%) |

The evaluator emitted 37 mismatch rows across 16 deterministic turns, so `npm run evaluate:advisor` exits nonzero. Repeated problems include brand replacement leaving the prior brand active, budget numbers leaking into model identifiers, RAM/GPU words being mistaken for categories or unrelated specs, and an old product variant remaining after a requested replacement. This is a measured failure report, not a passing chatbot quality claim. Product relevance, constraint violations, explanation factuality, and follow-up quality remain `not_assessed` without the required runtime/catalog evidence.
