import {
  AdvisorRequirements, EMPTY_ADVISOR_REQUIREMENTS, mergeAdvisorRequirements,
} from './productAdvisor';
import { ContextIntent, IntentContext, createRuleAnalysis, detectAdvisorIntent, shouldUseOllamaForIntent } from './advisorIntent';

export type EvaluationClass = 'code_deterministic' | 'model_dependent' | 'catalog_dependent' | 'human_review';

export interface DialogueTurnFixture {
  user: string;
  expectedIntent: ContextIntent;
  expectedRequirements: AdvisorRequirements;
  changedFields: string[];
  expectedClarification: boolean;
  evaluationClass: EvaluationClass;
  expectedProductIds: string[] | null;
  forbiddenClaims: string[];
  reviewCriteria: string[];
}

export interface DialogueScenario {
  id: string;
  group: string;
  initialRequirements: AdvisorRequirements;
  seedMessages: IntentContext['recentMessages'];
  seedCurrentProductCount: number;
  seedHistoricalProductCount: number;
  turns: DialogueTurnFixture[];
  productGroundTruth: { status: 'not_provided'; expectedProductIds: null; reason: string };
}

type TurnDraft = {
  user: string;
  intent: ContextIntent;
  changes?: Partial<AdvisorRequirements>;
  clarification?: boolean;
  evaluationClass?: EvaluationClass;
  expectedProductIds?: string[] | null;
  reviewCriteria?: string[];
};

function copyRequirements(value: AdvisorRequirements): AdvisorRequirements {
  return {
    ...value,
    brands: [...value.brands],
    requiredSpecs: { ...value.requiredSpecs },
    preferences: [...value.preferences], exclusions: [...value.exclusions],
    selectionCriteria: [...value.selectionCriteria], modelIdentifiers: [...value.modelIdentifiers], variant: [...value.variant],
  };
}

function applyFixturePatch(previous: AdvisorRequirements, patch: Partial<AdvisorRequirements> = {}): AdvisorRequirements {
  return {
    ...previous,
    ...patch,
    brands: patch.brands ? [...patch.brands] : [...previous.brands],
    requiredSpecs: { ...previous.requiredSpecs, ...(patch.requiredSpecs ?? {}) },
    preferences: patch.preferences ? [...patch.preferences] : [...previous.preferences],
    exclusions: patch.exclusions ? [...patch.exclusions] : [...previous.exclusions],
    selectionCriteria: patch.selectionCriteria ? [...patch.selectionCriteria] : [...previous.selectionCriteria],
    modelIdentifiers: patch.modelIdentifiers ? [...patch.modelIdentifiers] : [...previous.modelIdentifiers],
    variant: patch.variant ? [...patch.variant] : [...previous.variant],
  };
}

function req(patch: Partial<AdvisorRequirements> = {}): AdvisorRequirements {
  return applyFixturePatch(copyRequirements(EMPTY_ADVISOR_REQUIREMENTS), patch);
}

function scenario(
  id: string,
  group: string,
  initialRequirements: AdvisorRequirements,
  drafts: TurnDraft[],
  options: { seedMessages?: IntentContext['recentMessages']; currentProducts?: number; historicalProducts?: number } = {},
): DialogueScenario {
  let expected = copyRequirements(initialRequirements);
  const turns = drafts.map((draft) => {
    const changedFields = Object.keys(draft.changes ?? {});
    expected = applyFixturePatch(expected, draft.changes);
    return {
      user: draft.user,
      expectedIntent: draft.intent,
      expectedRequirements: copyRequirements(expected),
      changedFields,
      expectedClarification: draft.clarification ?? false,
      evaluationClass: draft.evaluationClass ?? 'code_deterministic',
      expectedProductIds: draft.expectedProductIds ?? null,
      forbiddenClaims: [
        'Do not invent current price, stock, warranty, technical specifications, compatibility, merchant, or product URL.',
        'Do not present a product from a previous search as a current result unless a new search verifies it.',
      ],
      reviewCriteria: draft.reviewCriteria ?? ['Preserve every unrelated confirmed requirement.', 'Ask a focused question when the requested change is ambiguous.'],
    } satisfies DialogueTurnFixture;
  });
  return {
    id, group, initialRequirements: copyRequirements(initialRequirements),
    seedMessages: options.seedMessages ?? [],
    seedCurrentProductCount: options.currentProducts ?? 0,
    seedHistoricalProductCount: options.historicalProducts ?? 0,
    turns,
    productGroundTruth: {
      status: 'not_provided', expectedProductIds: null,
      reason: 'No fixed catalog snapshot or verified product IDs are bundled with this dialog fixture; product claims must be assessed against a dated catalog run.',
    },
  };
}

const laptopAsus = req({ category: 'laptop', brands: ['Asus'], budgetMax: 20_000_000, purpose: 'programming' });
const laptopLenovo = req({ category: 'laptop', brands: ['Lenovo'], budgetMax: 20_000_000, purpose: 'programming' });
const laptopWork = req({ category: 'laptop', purpose: 'programming', budgetMax: 25_000_000 });
const laptopRam32 = req({ category: 'laptop', requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 32 } });
const laptopRam16 = req({ category: 'laptop', requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16 } });
const laptopWithExclusion = req({ category: 'laptop', exclusions: ['dedicated GPU'] });
const withRecent = (requirements: AdvisorRequirements, user: string, assistant = 'Mình đang tư vấn theo các tiêu chí hiện tại.') => ({
  requirements,
  seedMessages: [
    { role: 'user' as const, content: 'Mình đang tìm sản phẩm theo các tiêu chí đã nêu.', intent: 'product_search' },
    { role: 'assistant' as const, content: assistant, intent: 'product_search' },
    { role: 'user' as const, content: user, intent: 'product_search' },
  ],
  currentProducts: 2,
  historicalProducts: 2,
});

/**
 * Curated multi-turn fixtures. Expected requirement snapshots are written from the scenario
 * contract, independently of the production merge function. Product IDs are deliberately
 * absent until a dated, verified catalog snapshot is attached to an evaluation run.
 */
export const ADVISOR_DIALOGUE_SCENARIOS: DialogueScenario[] = [
  scenario('budget_raise_keep_purpose', 'budget change', laptopWork, [
    { user: 'Tăng ngân sách lên 30 triệu nhé.', intent: 'MODIFY_REQUIREMENT', changes: { budgetMax: 30_000_000 } },
    { user: 'Mình vẫn dùng để lập trình.', intent: 'CONTINUE_CONSULTATION', evaluationClass: 'model_dependent' },
  ], withRecent(laptopWork, 'Tăng ngân sách lên 30 triệu nhé.')),
  scenario('budget_lower_keep_brand', 'budget change', laptopLenovo, [
    { user: 'Giảm còn tối đa 18 triệu.', intent: 'MODIFY_REQUIREMENT', changes: { budgetMax: 18_000_000 } },
  ], withRecent(laptopLenovo, 'Giảm còn tối đa 18 triệu.')),
  scenario('budget_remove', 'criterion removal', laptopWork, [
    { user: 'Bỏ ngân sách đi.', intent: 'REMOVE_REQUIREMENT', changes: { budgetMax: null, budgetMin: null, budgetFlexible: false }, evaluationClass: 'model_dependent' },
  ], withRecent(laptopWork, 'Bỏ giới hạn ngân sách giúp mình.')),
  scenario('budget_unaccented', 'unaccented Vietnamese', laptopWork, [
    { user: 'ngan sach toi da 28 trieu', intent: 'MODIFY_REQUIREMENT', changes: { budgetMax: 28_000_000 } },
  ], withRecent(laptopWork, 'ngan sach toi da 28 trieu')),
  scenario('brand_asus_to_lenovo', 'brand change', laptopAsus, [
    { user: 'Chuyển sang Lenovo.', intent: 'MODIFY_REQUIREMENT', changes: { brands: ['Lenovo'] } },
  ], withRecent(laptopAsus, 'Chuyển sang Lenovo.')),
  scenario('brand_alternative', 'brand change', laptopAsus, [
    { user: 'Thương hiệu khác được không?', intent: 'REQUEST_ALTERNATIVE_BRAND', changes: { brands: [] } },
  ], withRecent(laptopAsus, 'Thương hiệu khác được không?')),
  scenario('brand_add_preference', 'add criterion', laptopWork, [
    { user: 'Ưu tiên Lenovo nhé.', intent: 'ADD_REQUIREMENT', changes: { brands: ['Lenovo'] } },
  ], withRecent(laptopWork, 'Ưu tiên Lenovo nhé.')),
  scenario('model_replace', 'model change', laptopLenovo, [
    { user: 'Đổi model sang ThinkPad E14.', intent: 'MODIFY_REQUIREMENT', changes: { modelIdentifiers: ['ThinkPad E14'] } },
  ], withRecent(laptopLenovo, 'Đổi model sang ThinkPad E14.')),
  scenario('model_remove', 'criterion removal', req({ category: 'laptop', modelIdentifiers: ['ThinkPad E14'], budgetMax: 25_000_000 }), [
    { user: 'Không khóa model cụ thể nữa.', intent: 'REMOVE_REQUIREMENT', changes: { modelIdentifiers: [] }, evaluationClass: 'model_dependent' },
  ], withRecent(req({ category: 'laptop', modelIdentifiers: ['ThinkPad E14'], budgetMax: 25_000_000 }), 'Không khóa model cụ thể nữa.')),
  scenario('ram_remove', 'criterion removal', laptopRam32, [
    { user: 'Bỏ yêu cầu RAM đi.', intent: 'REMOVE_REQUIREMENT', changes: { requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: null } } },
  ], withRecent(laptopRam32, 'Bỏ yêu cầu RAM đi.')),
  scenario('ram_minimum_replace', 'requirement update', laptopRam32, [
    { user: 'Không cần 32GB nữa, 16GB cũng được.', intent: 'MODIFY_REQUIREMENT', changes: { requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16 } } },
  ], withRecent(laptopRam32, 'Tôi cần RAM 32GB.')),
  scenario('remove_gpu_exclusion', 'criterion removal', laptopWithExclusion, [
    { user: 'Bỏ điều kiện loại trừ GPU rời đi.', intent: 'REMOVE_REQUIREMENT', changes: { exclusions: [] } },
  ], withRecent(laptopWithExclusion, 'Bỏ điều kiện loại trừ GPU rời đi.')),
  scenario('add_ssd', 'add criterion', req({ category: 'laptop' }), [
    { user: 'Thêm SSD 1TB nhé.', intent: 'ADD_REQUIREMENT', changes: { requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, storageGB: 1000, storageType: 'ssd' } } },
  ], withRecent(req({ category: 'laptop' }), 'Thêm SSD 1TB nhé.')),
  scenario('add_ram_keep_budget', 'add criterion', req({ category: 'laptop', budgetMax: 25_000_000, purpose: 'programming' }), [
    { user: 'Thêm RAM tối thiểu 16GB.', intent: 'ADD_REQUIREMENT', changes: { requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16 } } },
  ], withRecent(req({ category: 'laptop', budgetMax: 25_000_000, purpose: 'programming' }), 'Thêm RAM tối thiểu 16GB.')),
  scenario('add_portability_preference', 'add criterion', req({ category: 'laptop', budgetMax: 20_000_000 }), [
    { user: 'Ưu tiên máy nhẹ, dễ mang đi.', intent: 'ADD_REQUIREMENT', changes: { preferences: ['portable'] }, evaluationClass: 'model_dependent', reviewCriteria: ['Interpret “nhẹ” as lower weight for laptops.', 'Keep budget and category unchanged.'] },
  ], withRecent(req({ category: 'laptop', budgetMax: 20_000_000 }), 'Mình muốn laptop.')),
  scenario('category_switch_phone', 'category change', laptopAsus, [
    { user: 'Đổi sang điện thoại.', intent: 'NEW_PRODUCT_SEARCH', changes: { category: 'phone' } },
  ], withRecent(laptopAsus, 'Mình đang tìm laptop ASUS dưới 20 triệu.')),
  scenario('category_switch_headphones', 'category change', req({ category: 'laptop', purpose: 'study', budgetMax: 15_000_000 }), [
    { user: 'Chuyển sang tai nghe để học online.', intent: 'NEW_PRODUCT_SEARCH', changes: { category: 'headphone', purpose: 'study' } },
  ], withRecent(req({ category: 'laptop' }), 'Mình muốn mua laptop.')),
  scenario('cheaper_keep_constraints', 'cheaper request', laptopLenovo, [
    { user: 'Có mẫu nào rẻ hơn không?', intent: 'REQUEST_CHEAPER', evaluationClass: 'model_dependent', reviewCriteria: ['Respect Lenovo, programming use, and the existing budget ceiling.', 'Do not claim a lower price without a current verified offer.'] },
  ], withRecent(laptopLenovo, 'Đây là một số laptop Lenovo phù hợp.')),
  scenario('cheaper_unaccented', 'unaccented Vietnamese', laptopWork, [
    { user: 'gia mem hon duoc khong', intent: 'REQUEST_CHEAPER', evaluationClass: 'model_dependent' },
  ], withRecent(laptopWork, 'Mình đang tư vấn laptop lập trình.')),
  scenario('lighter_laptop', 'lighter request', laptopWork, [
    { user: 'Laptop nhẹ hơn một chút được không?', intent: 'REQUEST_LIGHTER', evaluationClass: 'model_dependent', reviewCriteria: ['Map lighter to laptop weight, not performance or dimensions.', 'Do not invent a weight value.'] },
  ], withRecent(laptopWork, 'Mình đang xem laptop cho bạn.')),
  scenario('lighter_mouse', 'lighter request', req({ category: 'mouse' }), [
    { user: 'Chuột nhẹ hơn thì sao?', intent: 'REQUEST_LIGHTER', evaluationClass: 'model_dependent', reviewCriteria: ['Map lighter to mouse weight.', 'Do not reuse laptop-weight wording.'] },
  ], withRecent(req({ category: 'mouse' }), 'Mình đang xem chuột máy tính.')),
  scenario('lighter_unaccented', 'unaccented Vietnamese', req({ category: 'laptop' }), [
    { user: 'lap nhe hon', intent: 'REQUEST_LIGHTER', evaluationClass: 'model_dependent' },
  ], withRecent(req({ category: 'laptop' }), 'Mình tìm laptop.')),
  scenario('battery_longer', 'battery request', req({ category: 'laptop', purpose: 'study' }), [
    { user: 'Pin lâu hơn thì sao?', intent: 'REQUEST_LONGER_BATTERY', evaluationClass: 'model_dependent', reviewCriteria: ['Treat longer battery life as a preference unless the user specifies a minimum runtime.', 'Do not invent battery duration.'] },
  ], withRecent(req({ category: 'laptop', purpose: 'study' }), 'Mình đang tìm laptop để học.')),
  scenario('battery_unaccented', 'unaccented Vietnamese', req({ category: 'phone' }), [
    { user: 'pin trau hon', intent: 'REQUEST_LONGER_BATTERY', evaluationClass: 'model_dependent' },
  ], withRecent(req({ category: 'phone' }), 'Mình tìm điện thoại.')),
  scenario('performance_better', 'performance request', req({ category: 'laptop', purpose: 'programming' }), [
    { user: 'Có con nào mạnh hơn không?', intent: 'REQUEST_BETTER_PERFORMANCE', evaluationClass: 'model_dependent', reviewCriteria: ['Tie performance comparison to verified CPU/GPU or workload evidence.', 'Do not make unsupported benchmark claims.'] },
  ], withRecent(req({ category: 'laptop', purpose: 'programming' }), 'Đang tư vấn laptop lập trình.')),
  scenario('more_products', 'more products', laptopLenovo, [
    { user: 'Tìm thêm cho tôi vài mẫu.', intent: 'REQUEST_MORE_PRODUCTS', evaluationClass: 'catalog_dependent', reviewCriteria: ['Return new catalog results or say none were found.', 'Do not relabel prior products as newly retrieved.'] },
  ], withRecent(laptopLenovo, 'Đã tìm được laptop Lenovo.')),
  scenario('compare_results', 'comparison', laptopLenovo, [
    { user: 'So sánh hai mẫu vừa tìm giúp mình.', intent: 'COMPARE_PREVIOUS_RESULTS', evaluationClass: 'catalog_dependent', reviewCriteria: ['Compare only products present in the referenced result set.', 'Every numerical comparison must come from verified product facts.'] },
  ], withRecent(laptopLenovo, 'Mình vừa tìm hai mẫu Lenovo cho bạn.')),
  scenario('ask_second_product', 'previous product follow-up', laptopLenovo, [
    { user: 'Cái thứ hai thì sao?', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent', reviewCriteria: ['Resolve “the second one” against the latest result ordering.', 'If the reference cannot be resolved, ask which product.'] },
  ], withRecent(laptopLenovo, 'Mẫu thứ nhất và mẫu thứ hai đã được liệt kê.')),
  scenario('ask_old_product_after_new_search', 'previous product follow-up', req({ category: 'phone', budgetMax: 15_000_000 }), [
    { user: 'Quay lại mẫu laptop ASUS lúc nãy nhé.', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent', reviewCriteria: ['Use historical reference and label it as such.', 'Do not imply the old product satisfies current phone requirements.'] },
  ], { ...withRecent(req({ category: 'phone', budgetMax: 15_000_000 }), 'Mình vừa tìm điện thoại.'), historicalProducts: 3 }),
  scenario('compatibility_docker', 'compatibility', req({ category: 'laptop', purpose: 'programming' }), [
    { user: 'Máy này có chạy Docker được không?', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent', reviewCriteria: ['Answer only from verified OS, CPU architecture, RAM, and compatibility evidence.', 'If evidence is missing, say catalog data is insufficient.'] },
  ], withRecent(req({ category: 'laptop', purpose: 'programming' }), 'Mình đang xem mẫu laptop này.')),
  scenario('compatibility_blender', 'compatibility', req({ category: 'laptop' }), [
    { user: 'Mẫu này chạy Blender ổn không?', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent', reviewCriteria: ['Use verified product specifications and workload caveats.', 'Do not claim a benchmark that was not provided.'] },
  ], withRecent(req({ category: 'laptop' }), 'Đây là mẫu laptop đang xem.')),
  scenario('missing_ram_spec', 'missing catalog specification', req({ category: 'laptop', requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 16 } }), [
    { user: 'Catalog có ghi rõ RAM của mẫu này không?', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent', reviewCriteria: ['Return UNKNOWN when the selected product has no verified RAM value.', 'Say the catalog lacks enough information instead of guessing.'] },
  ], withRecent(req({ category: 'laptop' }), 'Mẫu này đang được tư vấn.')),
  scenario('missing_battery_spec', 'missing catalog specification', req({ category: 'phone' }), [
    { user: 'Pin dùng được bao lâu?', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent', reviewCriteria: ['Distinguish measured runtime from battery capacity.', 'Do not make up hours when absent.'] },
  ], withRecent(req({ category: 'phone' }), 'Mình đang xem mẫu điện thoại này.')),
  scenario('conflicting_budgets', 'conflicting requirements', req({ category: 'laptop', budgetMax: 8_000_000, requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 32 } }), [
    { user: 'Mình muốn máy dưới 8 triệu nhưng bắt buộc RAM 32GB.', intent: 'CONTINUE_CONSULTATION', evaluationClass: 'human_review', clarification: true, reviewCriteria: ['Surface the budget/specification tension and clarify flexibility.', 'Do not silently drop the RAM requirement or budget cap.'] },
  ], withRecent(req({ category: 'laptop', budgetMax: 8_000_000 }), 'Mình muốn laptop dưới 8 triệu.')),
  scenario('vague_change', 'clarification', laptopAsus, [
    { user: 'Tôi đổi ý rồi.', intent: 'MODIFY_REQUIREMENT', clarification: true, evaluationClass: 'human_review', reviewCriteria: ['Ask which criterion changed.', 'Keep all requirements until a specific update is given.'] },
  ], withRecent(laptopAsus, 'Mình muốn laptop ASUS dưới 20 triệu.')),
  scenario('remove_unspecified', 'clarification', laptopRam16, [
    { user: 'Bỏ cái đó đi.', intent: 'REMOVE_REQUIREMENT', clarification: true, evaluationClass: 'human_review', reviewCriteria: ['Resolve the target only if the recent dialogue clearly identifies it.', 'Otherwise ask what “cái đó” refers to and preserve requirements.'] },
  ], withRecent(laptopRam16, 'Mình cân nhắc RAM 16GB.')),
  scenario('off_topic_weather', 'out of scope', laptopAsus, [
    { user: 'Ngày mai thời tiết thế nào?', intent: 'OUT_OF_SCOPE', evaluationClass: 'code_deterministic' },
  ], withRecent(laptopAsus, 'Mình đang tư vấn laptop ASUS.')),
  scenario('off_topic_recipe', 'out of scope', req(), [
    { user: 'Cho tôi công thức nấu phở.', intent: 'OUT_OF_SCOPE', evaluationClass: 'code_deterministic' },
  ]),
  scenario('off_topic_relationship', 'out of scope', req({ category: 'laptop' }), [
    { user: 'Tư vấn chuyện tình cảm giúp tôi.', intent: 'OUT_OF_SCOPE', evaluationClass: 'code_deterministic' },
  ], withRecent(req({ category: 'laptop' }), 'Mình tìm laptop.')),
  scenario('unaccented_cheaper', 'unaccented Vietnamese', laptopWork, [
    { user: 'gia mem hon', intent: 'REQUEST_CHEAPER', evaluationClass: 'model_dependent' },
  ], withRecent(laptopWork, 'Mình tìm laptop lập trình.')),
  scenario('unaccented_remove_gpu', 'unaccented Vietnamese', laptopWithExclusion, [
    { user: 'khong can card roi nua', intent: 'REMOVE_REQUIREMENT', changes: { exclusions: [] }, evaluationClass: 'model_dependent' },
  ], withRecent(laptopWithExclusion, 'Mình không muốn GPU rời.')),
  scenario('unaccented_more', 'unaccented Vietnamese', laptopWork, [
    { user: 'co option khac khong', intent: 'REQUEST_MORE_PRODUCTS', evaluationClass: 'catalog_dependent' },
  ], withRecent(laptopWork, 'Mình đang xem laptop lập trình.')),
  scenario('unaccented_second_product', 'unaccented Vietnamese', laptopLenovo, [
    { user: 'cai thu hai thi sao', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent' },
  ], withRecent(laptopLenovo, 'Mẫu thứ nhất và thứ hai trong danh sách.')),
  scenario('english_docker', 'Vietnamese plus English terms', req({ category: 'laptop', purpose: 'programming' }), [
    { user: 'Máy này chạy Docker được không?', intent: 'ASK_ABOUT_PREVIOUS_PRODUCT', evaluationClass: 'catalog_dependent' },
  ], withRecent(req({ category: 'laptop' }), 'Mình xem laptop lập trình.')),
  scenario('english_ssd', 'Vietnamese plus English terms', req({ category: 'laptop' }), [
    { user: 'Thêm SSD 1TB và ưu tiên chạy Docker.', intent: 'ADD_REQUIREMENT', changes: { requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, storageGB: 1000, storageType: 'ssd' }, purpose: 'programming' } },
  ], withRecent(req({ category: 'laptop' }), 'Mình đang tìm laptop.')),
  scenario('english_brand_option', 'Vietnamese plus English terms', laptopAsus, [
    { user: 'Có option brand khác không?', intent: 'REQUEST_ALTERNATIVE_BRAND', changes: { brands: [] } },
  ], withRecent(laptopAsus, 'Mình đang xem laptop ASUS.')),
  scenario('followup_keep_confirmed', 'context retention', laptopLenovo, [
    { user: 'Mục đích lập trình vẫn giữ nguyên nhé.', intent: 'CONTINUE_CONSULTATION', changes: { purpose: 'programming' }, evaluationClass: 'model_dependent' },
    { user: 'Và ngân sách vẫn 20 triệu.', intent: 'CONTINUE_CONSULTATION', changes: { budgetMax: 20_000_000 } },
  ], withRecent(laptopLenovo, 'Mình muốn laptop Lenovo dưới 20 triệu để lập trình.')),
  scenario('variant_replace', 'variant change', req({ category: 'phone', brands: ['Samsung'], variant: ['256GB'] }), [
    { user: 'Đổi sang bản 512GB.', intent: 'MODIFY_REQUIREMENT', changes: { variant: ['512GB'] } },
  ], withRecent(req({ category: 'phone', brands: ['Samsung'], variant: ['256GB'] }), 'Mình muốn Samsung bản 256GB.')),
  scenario('exclude_add', 'add criterion', req({ category: 'laptop' }), [
    { user: 'Tránh các máy quá nặng.', intent: 'ADD_REQUIREMENT', changes: { exclusions: ['heavy laptop'] }, evaluationClass: 'human_review', reviewCriteria: ['Treat weight as a preference or clarify a numeric threshold.', 'Do not invent a weight threshold.'] },
  ], withRecent(req({ category: 'laptop' }), 'Mình đang tìm laptop.')),
  scenario('no_results_expected_not_claimed', 'empty search behavior', req({ category: 'laptop', brands: ['Lenovo'], budgetMax: 5_000_000, requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 64 } }), [
    { user: 'Tìm mẫu đáp ứng đủ các điều kiện trên.', intent: 'NEW_PRODUCT_SEARCH', evaluationClass: 'catalog_dependent', expectedProductIds: null, reviewCriteria: ['Use the actual retrieval result for this catalog run.', 'If retrieval is empty, return zero current products and do not reuse old results.'] },
  ], { ...withRecent(req({ category: 'laptop', brands: ['Lenovo'], budgetMax: 5_000_000, requiredSpecs: { ...EMPTY_ADVISOR_REQUIREMENTS.requiredSpecs, ramGB: 64 } }), 'Mình đang tìm laptop Lenovo.'), currentProducts: 2 }),
];

export interface EvaluationMetric {
  status: 'scored' | 'not_assessed';
  numerator: number | null;
  denominator: number;
  value: number | null;
}

export interface ConversationEvaluationReport {
  scenarioCount: number;
  turnCount: number;
  classCounts: Record<EvaluationClass, number>;
  deterministicFailures: Array<{ scenarioId: string; turn: number; dimension: string; expected: unknown; actual: unknown }>;
  metrics: Record<string, EvaluationMetric>;
  unassessedReasons: Record<string, string>;
}

function metric(passed: number, total: number): EvaluationMetric {
  return total ? { status: 'scored', numerator: passed, denominator: total, value: Number((passed / total).toFixed(4)) }
    : { status: 'not_assessed', numerator: null, denominator: 0, value: null };
}

function same(left: unknown, right: unknown) { return JSON.stringify(left) === JSON.stringify(right); }

export function evaluateAdvisorDialogues(scenarios = ADVISOR_DIALOGUE_SCENARIOS): ConversationEvaluationReport {
  const classCounts: Record<EvaluationClass, number> = { code_deterministic: 0, model_dependent: 0, catalog_dependent: 0, human_review: 0 };
  const failures: ConversationEvaluationReport['deterministicFailures'] = [];
  let intentPassed = 0, intentTotal = 0, reqPassed = 0, reqTotal = 0, retainedPassed = 0, retainedTotal = 0;
  let updatedPassed = 0, updatedTotal = 0, clarificationPassed = 0, clarificationTotal = 0;
  let turnCount = 0;

  for (const dialogue of scenarios) {
    let requirements = copyRequirements(dialogue.initialRequirements);
    let recentMessages = [...dialogue.seedMessages];
    let currentSearchResultCount = dialogue.seedCurrentProductCount;
    for (const [index, turn] of dialogue.turns.entries()) {
      turnCount++;
      classCounts[turn.evaluationClass]++;
      const prior = requirements;
      const context: IntentContext = {
        requirements: prior,
        currentSearchResultCount,
        historicalProductReferenceCount: dialogue.seedHistoricalProductCount,
        recentMessages,
      };
      const detection = detectAdvisorIntent(turn.user, context);
      if (turn.evaluationClass === 'code_deterministic' && !shouldUseOllamaForIntent(detection)) {
        intentTotal++;
        if (detection.intent === turn.expectedIntent) intentPassed++;
        else failures.push({ scenarioId: dialogue.id, turn: index + 1, dimension: 'intent', expected: turn.expectedIntent, actual: detection.intent });

        const analysis = createRuleAnalysis(detection, turn.user, prior, recentMessages);
        requirements = detection.inScope ? mergeAdvisorRequirements(prior, analysis as any, turn.user) : prior;
        const paths = [
          'category', 'brands', 'budgetMin', 'budgetMax', 'budgetFlexible', 'purpose', 'audience', 'environment', 'existingHardware',
          'requiredSpecs', 'preferences', 'exclusions', 'selectionCriteria', 'modelIdentifiers', 'variant',
        ] as const;
        for (const path of paths) {
          reqTotal++;
          const actual = path === 'requiredSpecs' ? requirements.requiredSpecs : requirements[path];
          const expected = path === 'requiredSpecs' ? turn.expectedRequirements.requiredSpecs : turn.expectedRequirements[path];
          if (same(actual, expected)) reqPassed++;
          else failures.push({ scenarioId: dialogue.id, turn: index + 1, dimension: `requirements.${path}`, expected, actual });
          const changed = turn.changedFields.some((field) => field === path || field.startsWith(`${path}.`));
          if (!changed) {
            retainedTotal++;
            if (same(actual, path === 'requiredSpecs' ? prior.requiredSpecs : prior[path])) retainedPassed++;
          }
        }
        for (const field of turn.changedFields) {
          updatedTotal++;
          const [parent, child] = field.split('.');
          const actual = child ? (requirements as any)[parent]?.[child] : (requirements as any)[parent];
          const expected = child ? (turn.expectedRequirements as any)[parent]?.[child] : (turn.expectedRequirements as any)[parent];
          if (same(actual, expected)) updatedPassed++;
          else failures.push({ scenarioId: dialogue.id, turn: index + 1, dimension: `update.${field}`, expected, actual });
        }
        clarificationTotal++;
        if (detection.needsClarification === turn.expectedClarification) clarificationPassed++;
        else failures.push({ scenarioId: dialogue.id, turn: index + 1, dimension: 'clarification', expected: turn.expectedClarification, actual: detection.needsClarification });
      } else if (turn.evaluationClass === 'code_deterministic') {
        failures.push({ scenarioId: dialogue.id, turn: index + 1, dimension: 'deterministic_confidence', expected: '>=0.78', actual: detection.confidence });
      }
      recentMessages = [...recentMessages, { role: 'user' as const, content: turn.user, intent: turn.expectedIntent }, { role: 'assistant' as const, content: '[fixture response]', intent: turn.expectedIntent }].slice(-8);
      if (turn.expectedIntent === 'NEW_PRODUCT_SEARCH' || turn.expectedIntent === 'REQUEST_MORE_PRODUCTS') currentSearchResultCount = dialogue.seedCurrentProductCount;
    }
  }

  return {
    scenarioCount: scenarios.length,
    turnCount,
    classCounts,
    deterministicFailures: failures,
    metrics: {
      intentAccuracy: metric(intentPassed, intentTotal),
      requirementExtractionAccuracy: metric(reqPassed, reqTotal),
      contextRetentionAccuracy: metric(retainedPassed, retainedTotal),
      requirementUpdateAccuracy: metric(updatedPassed, updatedTotal),
      appropriateClarificationRate: metric(clarificationPassed, clarificationTotal),
      constraintViolationRate: metric(0, 0),
      productRelevance: metric(0, 0),
      explanationFactuality: metric(0, 0),
      followUpQuality: metric(0, 0),
    },
    unassessedReasons: {
      constraintViolationRate: 'No fixed catalog snapshot, retrieved products, or verified constraint labels are attached to the fixtures.',
      productRelevance: 'Requires actual product results and human or independently labeled relevance judgments.',
      explanationFactuality: 'Requires captured Qwen responses checked against the verified product facts for that run.',
      followUpQuality: 'Requires human review against each scenario review rubric.',
      modelDependentTurns: 'The deterministic runner does not call Ollama; model-dependent turns are reported separately and are not counted as PASS.',
    },
  };
}

export function getAdvisorEvaluationSummary() {
  const report = evaluateAdvisorDialogues();
  return {
    ...report,
    scenarioGroups: [...new Set(ADVISOR_DIALOGUE_SCENARIOS.map((item) => item.group))].sort(),
    scenarios: ADVISOR_DIALOGUE_SCENARIOS,
  };
}
