import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAdvisorIntent, createRuleAnalysis, IntentContext, shouldUseOllamaForIntent } from './advisorIntent';
import { EMPTY_ADVISOR_REQUIREMENTS, mergeAdvisorRequirements } from './productAdvisor';

function context(overrides: Partial<IntentContext> = {}): IntentContext {
  return {
    requirements: { ...EMPTY_ADVISOR_REQUIREMENTS, category: 'laptop', brands: ['Asus'], budgetMax: 20_000_000, purpose: 'programming' },
    currentSearchResultCount: 3,
    historicalProductReferenceCount: 2,
    recentMessages: [
      { role: 'user', content: 'Tôi muốn laptop ASUS dưới 20 triệu để lập trình.', intent: 'product_search' },
      { role: 'assistant', content: 'Đây là một vài laptop ASUS phù hợp.', intent: 'product_search' },
    ],
    ...overrides,
  };
}

function caseContext(message: string) {
  if (/card rời|card roi/i.test(message)) {
    const requirements = { ...context().requirements, requiredSpecs: { ...context().requirements.requiredSpecs, vramGB: 8 } };
    return context({ requirements });
  }
  return context();
}

const accentedCases: Array<[string, string]> = [
  ['Nhẹ hơn một chút được không?', 'REQUEST_LIGHTER'],
  ['Có mẫu nào rẻ hơn không?', 'REQUEST_CHEAPER'],
  ['Pin lâu hơn thì sao?', 'REQUEST_LONGER_BATTERY'],
  ['Có con nào mạnh hơn không?', 'REQUEST_BETTER_PERFORMANCE'],
  ['Thương hiệu khác được không?', 'REQUEST_ALTERNATIVE_BRAND'],
  ['Có lựa chọn nào tốt hơn?', 'REQUEST_MORE_PRODUCTS'],
  ['Tìm thêm cho tôi vài mẫu.', 'REQUEST_MORE_PRODUCTS'],
  ['Bỏ yêu cầu đó đi.', 'REMOVE_REQUIREMENT'],
  ['Tôi đổi ý rồi.', 'MODIFY_REQUIREMENT'],
  ['Cái thứ hai thì sao?', 'ASK_ABOUT_PREVIOUS_PRODUCT'],
  ['Máy này có chạy Docker được không?', 'ASK_ABOUT_PREVIOUS_PRODUCT'],
  ['Laptop nhẹ hơn giúp tôi.', 'REQUEST_LIGHTER'],
  ['Giá mềm hơn một chút nhé.', 'REQUEST_CHEAPER'],
  ['Máy mạnh hơn để lập trình thì sao?', 'REQUEST_BETTER_PERFORMANCE'],
  ['Pin trâu hơn có mẫu nào không?', 'REQUEST_LONGER_BATTERY'],
  ['Có option khác không?', 'REQUEST_MORE_PRODUCTS'],
  ['Bỏ tiêu chí RAM đi.', 'REMOVE_REQUIREMENT'],
  ['Thêm SSD 1TB nhé.', 'ADD_REQUIREMENT'],
  ['Đổi sang điện thoại.', 'NEW_PRODUCT_SEARCH'],
  ['So sánh hai mẫu vừa tìm.', 'COMPARE_PREVIOUS_RESULTS'],
  ['Mẫu ASUS lúc nãy thì sao?', 'ASK_ABOUT_PREVIOUS_PRODUCT'],
  ['Dưới 18 triệu được không?', 'MODIFY_REQUIREMENT'],
  ['Bỏ ngân sách đi.', 'REMOVE_REQUIREMENT'],
  ['Không cần card rời nữa.', 'REMOVE_REQUIREMENT'],
  ['Bổ sung tiêu chí SSD.', 'ADD_REQUIREMENT'],
  ['Đổi model sang ThinkPad E14.', 'MODIFY_REQUIREMENT'],
  ['Mình đang tìm laptop cho sinh viên.', 'NEW_PRODUCT_SEARCH'],
  ['Chọn mẫu thứ hai giúp tôi.', 'ASK_ABOUT_PREVIOUS_PRODUCT'],
  ['Máy này có chạy Blender không?', 'ASK_ABOUT_PREVIOUS_PRODUCT'],
  ['Cái này có lựa chọn nào khác?', 'REQUEST_MORE_PRODUCTS'],
];

const unaccentedCases: Array<[string, string]> = [
  ['lap nhe hon', 'REQUEST_LIGHTER'],
  ['pin trau hon', 'REQUEST_LONGER_BATTERY'],
  ['gia mem hon', 'REQUEST_CHEAPER'],
  ['may manh hon', 'REQUEST_BETTER_PERFORMANCE'],
  ['bo cai do di', 'REMOVE_REQUIREMENT'],
  ['co option khac khong', 'REQUEST_MORE_PRODUCTS'],
  ['ram 16gb cung duoc', 'MODIFY_REQUIREMENT'],
  ['khong can card roi nua', 'REMOVE_REQUIREMENT'],
  ['tim them vai mau', 'REQUEST_MORE_PRODUCTS'],
  ['cai thu hai thi sao', 'ASK_ABOUT_PREVIOUS_PRODUCT'],
];

const englishCases: Array<[string, string]> = [
  ['Can I get a lighter laptop?', 'REQUEST_LIGHTER'],
  ['Show me a cheaper option.', 'REQUEST_CHEAPER'],
  ['Any model with longer battery life?', 'REQUEST_LONGER_BATTERY'],
  ['Can this run Docker?', 'ASK_ABOUT_PREVIOUS_PRODUCT'],
  ['Show me another brand.', 'REQUEST_ALTERNATIVE_BRAND'],
];

const offTopicCases = [
  'Ngày mai thời tiết thế nào?',
  'Cho tôi công thức nấu phở.',
  'Kết quả bóng đá tối qua ra sao?',
  'Viết một bài thơ về mùa thu.',
  'Tư vấn chuyện tình cảm giúp tôi.',
  'Hôm nay thị trường chứng khoán thế nào?',
];

for (const [message, expected] of accentedCases) {
  test(`Vietnamese intent with diacritics: ${message}`, () => {
    const result = detectAdvisorIntent(message, caseContext(message));
    assert.equal(result.intent, expected);
    assert.equal(result.inScope, true);
    assert.ok(result.confidence >= 0.78);
  });
}

for (const [message, expected] of unaccentedCases) {
  test(`Vietnamese intent without diacritics: ${message}`, () => {
    const result = detectAdvisorIntent(message, caseContext(message));
    assert.equal(result.intent, expected);
    assert.equal(result.inScope, true);
  });
}

for (const [message, expected] of englishCases) {
  test(`English product term in Vietnamese context: ${message}`, () => {
    const result = detectAdvisorIntent(message, context());
    assert.equal(result.intent, expected);
    assert.equal(result.inScope, true);
  });
}

for (const message of offTopicCases) {
  test(`explicitly unrelated topic stays out of scope: ${message}`, () => {
    const result = detectAdvisorIntent(message, context());
    assert.equal(result.intent, 'OUT_OF_SCOPE');
    assert.equal(result.inScope, false);
    assert.ok(result.confidence >= 0.95);
  });
}

test('lighter requests use the active category to create a specific preference', () => {
  const cases: Array<[string, string]> = [
    ['laptop', 'laptop nhẹ hơn, ưu tiên trọng lượng thấp'],
    ['mouse', 'chuột máy tính nhẹ hơn'],
    ['headphone', 'tai nghe nhẹ hơn'],
  ];
  for (const [category, expected] of cases) {
    const previous = { ...context().requirements, category };
    const ctx = context({ requirements: previous });
    const detection = detectAdvisorIntent('Nhẹ hơn một chút được không?', ctx);
    const analysis = createRuleAnalysis(detection, 'Nhẹ hơn một chút được không?', previous, ctx.recentMessages);
    const next = mergeAdvisorRequirements(previous, analysis as any, 'Nhẹ hơn một chút được không?');
    assert.ok(next.preferences.includes(expected));
  }
});

test('requesting another brand removes the old restriction while keeping unrelated constraints', () => {
  const previous = context().requirements;
  const detection = detectAdvisorIntent('Thương hiệu khác được không?', context());
  const analysis = createRuleAnalysis(detection, 'Thương hiệu khác được không?', previous);
  const next = mergeAdvisorRequirements(previous, analysis as any, 'Thương hiệu khác được không?');
  assert.deepEqual(next.brands, []);
  assert.equal(next.budgetMax, 20_000_000);
  assert.equal(next.purpose, 'programming');
});

test('removing a dedicated graphics requirement clears only its active VRAM field', () => {
  const previous = { ...context().requirements, requiredSpecs: { ...context().requirements.requiredSpecs, vramGB: 8 } };
  const ctx = context({ requirements: previous });
  const message = 'Không cần card rời nữa.';
  const detection = detectAdvisorIntent(message, ctx);
  const next = mergeAdvisorRequirements(previous, createRuleAnalysis(detection, message, previous, ctx.recentMessages) as any, message);
  assert.equal(detection.intent, 'REMOVE_REQUIREMENT');
  assert.equal(next.requiredSpecs.vramGB, null);
  assert.equal(next.budgetMax, 20_000_000);
});

test('changing category carries an explicit category operation into the requirements', () => {
  const previous = context().requirements;
  const detection = detectAdvisorIntent('Đổi sang điện thoại.', context());
  assert.equal(detection.intent, 'NEW_PRODUCT_SEARCH');
  const analysis = createRuleAnalysis(detection, 'Đổi sang điện thoại.', previous);
  const next = mergeAdvisorRequirements(previous, analysis as any, 'Đổi sang điện thoại.');
  assert.equal(next.category, 'phone');
  assert.deepEqual(next.brands, ['Asus']);
  assert.equal(next.budgetMax, 20_000_000);
});

test('a vague change request asks which criterion to change without altering requirements', () => {
  const previous = context().requirements;
  const detection = detectAdvisorIntent('Tôi đổi ý rồi.', context());
  assert.equal(detection.needsClarification, true);
  assert.match(detection.clarificationQuestion, /thay đổi tiêu chí nào/i);
  const analysis = createRuleAnalysis(detection, 'Tôi đổi ý rồi.', previous, context().recentMessages);
  const next = mergeAdvisorRequirements(previous, analysis as any, 'Tôi đổi ý rồi.');
  assert.deepEqual(next, previous);
});

test('a vague comparative phrase without product context asks for clarification', () => {
  const noContext = context({
    requirements: EMPTY_ADVISOR_REQUIREMENTS,
    currentSearchResultCount: 0,
    historicalProductReferenceCount: 0,
    recentMessages: [],
  });
  const result = detectAdvisorIntent('Nhẹ hơn được không?', noContext);
  assert.equal(result.inScope, true);
  assert.equal(result.needsClarification, true);
  assert.match(result.clarificationQuestion, /sản phẩm nào/i);
});

test('standalone RAM and SSD queries start component searches instead of becoming laptop requirements', () => {
  const noContext = context({
    requirements: EMPTY_ADVISOR_REQUIREMENTS,
    currentSearchResultCount: 0,
    historicalProductReferenceCount: 0,
    recentMessages: [],
  });
  for (const message of ['RAM 16GB', 'SSD 1TB']) {
    const result = detectAdvisorIntent(message, noContext);
    assert.equal(result.intent, 'NEW_PRODUCT_SEARCH');
    assert.equal(result.inScope, true);
  }
});

test('clear contextual actions and explicit out-of-scope messages do not call Ollama', () => {
  const followUp = detectAdvisorIntent('Nhẹ hơn một chút được không?', context());
  const unrelated = detectAdvisorIntent('Ngày mai thời tiết thế nào?', context());
  const unclear = detectAdvisorIntent('Tôi đang cân nhắc.', context());
  assert.equal(shouldUseOllamaForIntent(followUp), false);
  assert.equal(shouldUseOllamaForIntent(unrelated), false);
  assert.equal(shouldUseOllamaForIntent(unclear), true);
});

test('ambiguous short turns remain tied to recent assistant and result context', () => {
  const result = detectAdvisorIntent('Thế còn pin?', context());
  assert.equal(result.intent, 'REQUEST_LONGER_BATTERY');
  assert.equal(result.inScope, true);
  assert.ok(result.confidence >= 0.78);
});

test('a multi-turn flow keeps prior criteria while modifying only the requested one', () => {
  const start = context().requirements;
  const lighter = detectAdvisorIntent('Laptop nhẹ hơn giúp tôi.', context());
  const afterLighter = mergeAdvisorRequirements(start, createRuleAnalysis(lighter, 'Laptop nhẹ hơn giúp tôi.', start) as any, 'Laptop nhẹ hơn giúp tôi.');
  assert.equal(afterLighter.brands[0], 'Asus');
  assert.equal(afterLighter.budgetMax, 20_000_000);
  assert.equal(afterLighter.purpose, 'programming');
  assert.ok(afterLighter.preferences.some((value: string) => /laptop nhẹ hơn/.test(value)));

  const ramPrevious = { ...afterLighter, requiredSpecs: { ...afterLighter.requiredSpecs, ramGB: 32 } };
  const removalContext = context({ requirements: ramPrevious, recentMessages: [...context().recentMessages, { role: 'user', content: 'Tôi cần RAM 32GB.', intent: 'product_consultation' }] });
  const remove = detectAdvisorIntent('Bỏ yêu cầu đó đi.', removalContext);
  const afterRemove = mergeAdvisorRequirements(ramPrevious, createRuleAnalysis(remove, 'Bỏ yêu cầu đó đi.', ramPrevious, removalContext.recentMessages) as any, 'Bỏ yêu cầu đó đi.');
  assert.equal(afterRemove.requiredSpecs.ramGB, null);
  assert.equal(afterRemove.budgetMax, 20_000_000);
  assert.equal(afterRemove.brands[0], 'Asus');
});

test('the six-turn ASUS to Lenovo flow retains budget and purpose while updating RAM and refinements', () => {
  let requirements = EMPTY_ADVISOR_REQUIREMENTS;
  const turns: Array<{ message: string; intent: string }> = [
    { message: 'Tôi muốn laptop ASUS dưới 20 triệu để lập trình.', intent: 'NEW_PRODUCT_SEARCH' },
    { message: 'Chuyển sang Lenovo.', intent: 'MODIFY_REQUIREMENT' },
    { message: 'Ưu tiên RAM 32GB.', intent: 'ADD_REQUIREMENT' },
    { message: 'Thực ra 16GB cũng được.', intent: 'MODIFY_REQUIREMENT' },
    { message: 'Tìm mẫu nhẹ hơn.', intent: 'REQUEST_LIGHTER' },
    { message: 'Có mẫu nào rẻ hơn nữa không?', intent: 'REQUEST_CHEAPER' },
  ];

  for (const [index, turn] of turns.entries()) {
    const ctx: IntentContext = {
      requirements,
      currentSearchResultCount: index === 0 ? 0 : 2,
      historicalProductReferenceCount: 0,
      recentMessages: index === 0 ? [] : [{ role: 'user', content: turns[index - 1].message, intent: turns[index - 1].intent }],
    };
    const detection = detectAdvisorIntent(turn.message, ctx);
    assert.equal(detection.intent, turn.intent, turn.message);
    assert.equal(detection.needsClarification, false, turn.message);
    requirements = mergeAdvisorRequirements(
      requirements,
      createRuleAnalysis(detection, turn.message, requirements, ctx.recentMessages) as any,
      turn.message,
    );
    assert.equal(requirements.category, 'laptop');
    assert.deepEqual(requirements.brands, index === 0 ? ['Asus'] : ['Lenovo']);
    assert.equal(requirements.budgetMax, 20_000_000);
    assert.match(requirements.purpose ?? '', /programming|lập trình/i);
    assert.equal(requirements.requiredSpecs.ramGB, index < 2 ? null : index === 2 ? 32 : 16);
    assert.equal(requirements.requiredSpecs.storageGB, null, 'RAM capacity must not be reinterpreted as storage');
  }
  assert.ok(requirements.preferences.some((value) => /nhẹ|weight/i.test(value)));
  assert.ok(requirements.selectionCriteria.some((value) => /rẻ|giá thấp/i.test(value)));
});
