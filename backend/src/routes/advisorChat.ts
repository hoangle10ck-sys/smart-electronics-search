import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { AdvisorConversation } from '../models/AdvisorConversation';
import { AdvisorFeedback } from '../models/AdvisorFeedback';
import { requireAdmin } from '../middleware/adminAuth';
import {
  EMPTY_ADVISOR_REQUIREMENTS, ProductAdvisorError, analyzeAdvisorTurn,
  getAdvisorClarification, hydrateConversationMessages, isAdvisorTurnInScope,
  mergeAdvisorRequirements, resolveAdvisorIntent,
  respondToAdvisorTurn, safeAdvisorMessage, summarizeAdvisorRequirements,
} from '../services/productAdvisor';
import { takeLiveSearchSlot } from '../services/liveSearchRateLimit';
import { allHistoricalProductReferences, archiveCurrentSearch, recordCurrentSearch } from '../services/advisorConversationState';
import { withConversationQueue } from '../services/conversationQueue';
import { createRuleAnalysis, detectAdvisorIntent, shouldUseOllamaForIntent } from '../services/advisorIntent';
import { findAssistantFeedbackMessage, isFeedbackProductAttached, validateAdvisorFeedbackInput } from '../services/advisorFeedback';
import { createAdvisorRequestTrace, finishAdvisorRequestTrace, getAdvisorPerformanceReport, recordAdvisorPhase, withAdvisorRequestTrace } from '../services/advisorPerformance';
import { encodeAdvisorStreamEvent, splitValidatedExplanation } from '../services/advisorStreaming';

const router = Router();
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/performance', requireAdmin, (_req, res) => res.json({ success: true, ...getAdvisorPerformanceReport() }));

function validConversationId(value: unknown): value is string {
  return typeof value === 'string' && SESSION_ID.test(value);
}

function chatRateLimit() {
  const configured = Number(process.env.CHAT_MAX_REQUESTS_PER_MINUTE);
  return Number.isInteger(configured) && configured >= 1 && configured <= 60 ? configured : 15;
}

function publicError(error: unknown, next: (error?: unknown) => void, res: any) {
  if (error instanceof ProductAdvisorError) return res.status((error as any).status).json({ success: false, message: error.message });
  next(error);
  return undefined;
}

function startAdvisorEventStream(res: any) {
  res.status(200);
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.setHeader('x-accel-buffering', 'no');
  res.flushHeaders?.();
}

function sendAdvisorStreamEvent(res: any, event: Record<string, unknown>) {
  if (!res.destroyed && !res.writableEnded) res.write(encodeAdvisorStreamEvent(event));
}

function sendValidatedExplanation(res: any, content: string) {
  for (const text of splitValidatedExplanation(content)) sendAdvisorStreamEvent(res, { type: 'explanation_delta', text });
}

function setServerTiming(res: any, trace: ReturnType<typeof createAdvisorRequestTrace>) {
  if (res.headersSent) return;
  const entries = Object.entries(trace.phases).filter(([, duration]) => Number.isFinite(duration))
    .map(([phase, duration]) => `${phase};dur=${Number((duration as number).toFixed(2))}`);
  if (entries.length) res.setHeader('server-timing', entries.join(', '));
}

router.post('/message', async (req, res, next) => {
  const requestStartedAt = performance.now();
  const validationStartedAt = performance.now();
  const rawMessage = req.body?.message;
  const providedId = req.body?.conversation_id;
  const clientMessageId = req.body?.client_message_id;
  if (typeof rawMessage !== 'string' || !rawMessage.trim() || rawMessage.length > 1000) {
    return res.status(400).json({ success: false, message: 'Tin nhắn cần có từ 1 đến 1000 ký tự.' });
  }
  if (providedId !== undefined && !validConversationId(providedId)) {
    return res.status(400).json({ success: false, message: 'Mã phiên trò chuyện không hợp lệ.' });
  }
  if (clientMessageId !== undefined && !validConversationId(clientMessageId)) {
    return res.status(400).json({ success: false, message: 'Mã tin nhắn không hợp lệ.' });
  }
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!takeLiveSearchSlot(`advisor-chat:${ip}`, Date.now(), chatRateLimit())) {
    return res.status(429).json({ success: false, message: 'Bạn đã gửi nhiều tin nhắn trong thời gian ngắn. Vui lòng đợi một chút rồi thử lại.' });
  }

  const streaming = req.header('accept')?.includes('text/event-stream') === true;
  const abortController = new AbortController();
  const trace = createAdvisorRequestTrace(requestStartedAt, abortController.signal);
  trace.phases.request_validation = performance.now() - validationStartedAt;
  res.once('close', () => { if (!res.writableEnded) abortController.abort(); });
  let heartbeat: NodeJS.Timeout | null = null;
  if (streaming) {
    startAdvisorEventStream(res);
    sendAdvisorStreamEvent(res, { type: 'status', phase: 'queued' });
    heartbeat = setInterval(() => {
      if (!res.destroyed && !res.writableEnded) res.write(': keep-alive\n\n');
    }, 15_000);
    heartbeat.unref();
  }

  const conversationId = providedId ?? randomUUID();
  const work = withAdvisorRequestTrace(trace, () => withConversationQueue(conversationId, async () => {
  try {
    const conversationLoadStartedAt = performance.now();
    let conversation = await AdvisorConversation.findOne({ conversationId });
    recordAdvisorPhase('conversation_load', performance.now() - conversationLoadStartedAt);
    if (!conversation) {
      conversation = new AdvisorConversation({
        conversationId, messages: [], requirements: EMPTY_ADVISOR_REQUIREMENTS,
        currentCategory: null, currentBudget: null, preferences: [], currentProducts: [], lastSearchResults: [],
        currentSearchId: null, currentSearchQuery: '', currentSearchResults: [], previousSearchResults: [], conversationProductReferences: [],
        conversationSummary: '', expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      });
    }

    if (clientMessageId) {
      const existingIndex = conversation.messages.findIndex((message: any) => message.role === 'user' && message.clientMessageId === clientMessageId);
      const existingAssistant = existingIndex >= 0 ? conversation.messages[existingIndex + 1] : null;
      if (existingAssistant?.role === 'assistant') {
        const hydrationStartedAt = performance.now();
        const [hydrated] = await hydrateConversationMessages([existingAssistant]);
        recordAdvisorPhase('mongo_retrieval', performance.now() - hydrationStartedAt);
        if (streaming) {
          sendAdvisorStreamEvent(res, { type: 'verified_products', products: hydrated?.products ?? [] });
          sendValidatedExplanation(res, existingAssistant.content);
          finishAdvisorRequestTrace(trace);
          sendAdvisorStreamEvent(res, {
            type: 'complete', conversation_id: conversationId, assistant_message_id: existingAssistant.messageId ?? null,
            intent: existingAssistant.intent ?? 'unknown', understood_requirements: conversation.requirements ?? EMPTY_ADVISOR_REQUIREMENTS,
            suggested_questions: existingAssistant.suggestedQuestions ?? [], needs_clarification: existingAssistant.needsClarification ?? false,
            timings_ms: trace.phases,
          });
          return res.end();
        }
        finishAdvisorRequestTrace(trace);
        setServerTiming(res, trace);
        return res.json({
          success: true, conversation_id: conversationId,
          message: { role: 'assistant', content: existingAssistant.content },
          assistant_message_id: existingAssistant.messageId ?? null,
          intent: existingAssistant.intent ?? 'unknown',
          understood_requirements: conversation.requirements ?? EMPTY_ADVISOR_REQUIREMENTS,
          products: hydrated?.products ?? [],
          suggested_questions: existingAssistant.suggestedQuestions ?? [],
          needs_clarification: existingAssistant.needsClarification ?? false,
          status: 'success',
        });
      }
    }

    const customerMessage = safeAdvisorMessage(rawMessage.trim());
    const history = conversation.messages.map((message: any) => ({ role: message.role, content: message.content }));
    const previousRequirements = (conversation.requirements ?? EMPTY_ADVISOR_REQUIREMENTS) as typeof EMPTY_ADVISOR_REQUIREMENTS;
    const searchState = {
      currentSearchId: conversation.currentSearchId ?? null,
      currentSearchQuery: conversation.currentSearchQuery ?? '',
      currentSearchResults: (conversation.currentSearchId !== null && conversation.currentSearchId !== undefined
        ? conversation.currentSearchResults ?? [] : conversation.lastSearchResults ?? []).map((id: unknown) => String(id)),
      previousSearchResults: (conversation.previousSearchResults ?? []).map((search: any) => ({
        searchId: search.searchId, query: search.query ?? '', createdAt: search.createdAt ?? new Date(),
        productIds: (search.productIds ?? []).map((id: unknown) => String(id)),
      })),
      conversationProductReferences: (conversation.conversationProductReferences ?? []).map((id: unknown) => String(id)),
    };
    const recentMessages = conversation.messages.slice(-8).map((message: any) => ({
      role: message.role, content: message.content, intent: message.intent ?? null,
    }));
    const intentContext = {
      requirements: previousRequirements,
      currentSearchResultCount: searchState.currentSearchResults.length,
      historicalProductReferenceCount: allHistoricalProductReferences(searchState).length,
      recentMessages,
    };
    if (streaming) sendAdvisorStreamEvent(res, { type: 'status', phase: 'understanding' });
    const contextStartedAt = performance.now();
    const detection = detectAdvisorIntent(customerMessage, intentContext);
    const useRules = !shouldUseOllamaForIntent(detection);
    const analysis = useRules
      ? createRuleAnalysis(detection, customerMessage, previousRequirements, recentMessages)
      : await analyzeAdvisorTurn(customerMessage, history, previousRequirements);
    const hasProductContext = Boolean(previousRequirements.category || searchState.currentSearchResults.length
      || searchState.conversationProductReferences.length || recentMessages.some((message) => message.role === 'assistant' && message.intent));
    const inScope = useRules ? detection.inScope : Boolean(analysis.inScope)
      && (isAdvisorTurnInScope(customerMessage, previousRequirements, history.length > 0) || hasProductContext);
    const intent = inScope ? resolveAdvisorIntent(
      analysis.intent, customerMessage, history.length > 0,
      searchState.currentSearchResults.length > 0, Boolean(previousRequirements.category || searchState.currentSearchResults.length || searchState.conversationProductReferences.length),
    ) : 'unknown';
    const requirements = inScope
      ? mergeAdvisorRequirements(previousRequirements, analysis, customerMessage)
      : previousRequirements;
    const clarification = inScope
      ? detection.needsClarification && useRules
        ? { question: detection.clarificationQuestion, needsClarification: true }
        : getAdvisorClarification(intent, requirements, searchState.currentSearchResults.length > 0)
      : { question: '', needsClarification: false };
    recordAdvisorPhase('context_understanding', performance.now() - contextStartedAt);
    if (streaming) sendAdvisorStreamEvent(res, { type: 'status', phase: 'searching' });
    const requirementsChanged = JSON.stringify(previousRequirements) !== JSON.stringify(requirements);
    const historicalProductIds = allHistoricalProductReferences(searchState)
      .filter((id) => !searchState.currentSearchResults.includes(id));

    const result = inScope
      ? await respondToAdvisorTurn({
        intent, requirements, history, latestMessage: customerMessage,
        previousProductIds: searchState.currentSearchResults,
        historicalProductIds,
        requestMoreProducts: detection.intent === 'REQUEST_MORE_PRODUCTS',
        reuseCurrentResults: !requirementsChanged && searchState.currentSearchResults.length > 0
          && ['follow_up', 'product_comparison', 'specification_question', 'price_question', 'compatibility_check'].includes(intent),
        clarification,
        signal: abortController.signal,
        onVerifiedProducts: (products: unknown[]) => {
          if (streaming) sendAdvisorStreamEvent(res, { type: 'verified_products', products });
        },
      })
      : {
        reply: 'Mình chỉ hỗ trợ tư vấn, tìm kiếm và so sánh sản phẩm điện tử có trong website. Bạn đang muốn tìm thiết bị nào ạ?',
        products: [], recommendations: [], intent: 'unknown', needsClarification: true,
        suggestedQuestions: ['Tư vấn laptop theo ngân sách', 'Tìm điện thoại phù hợp', 'So sánh các sản phẩm trong catalog'], currentProductIds: [],
        searchPerformed: false, searchQuery: '',
      };

    if (abortController.signal.aborted) throw abortController.signal.reason ?? new Error('advisor request aborted');
    if (streaming && !inScope) sendAdvisorStreamEvent(res, { type: 'verified_products', products: [] });

    conversation.messages.push({ role: 'user', clientMessageId: clientMessageId ?? null, content: customerMessage, intent, needsClarification: false, suggestedQuestions: [], recommendations: [] } as any);
    const assistantMessageId = randomUUID();
    conversation.messages.push({
      role: 'assistant', messageId: assistantMessageId, content: result.reply, intent: result.intent,
      needsClarification: result.needsClarification, suggestedQuestions: result.suggestedQuestions,
      recommendations: result.recommendations,
    } as any);
    if (conversation.messages.length > 40) conversation.messages.splice(0, conversation.messages.length - 40);
    conversation.requirements = requirements;
    conversation.currentCategory = requirements.category;
    conversation.currentBudget = { min: requirements.budgetMin, max: requirements.budgetMax, flexible: requirements.budgetFlexible };
    conversation.preferences = [...new Set([...requirements.preferences, ...requirements.selectionCriteria])].slice(0, 16);
    if (result.searchPerformed) {
      const nextSearchState = recordCurrentSearch(searchState, {
        searchId: randomUUID(), query: result.searchQuery, createdAt: new Date(),
        productIds: result.currentProductIds.map((id: unknown) => String(id)),
      });
      conversation.currentSearchId = nextSearchState.currentSearchId;
      conversation.currentSearchQuery = nextSearchState.currentSearchQuery;
      conversation.currentSearchResults = nextSearchState.currentSearchResults as any;
      conversation.previousSearchResults = nextSearchState.previousSearchResults as any;
      conversation.conversationProductReferences = nextSearchState.conversationProductReferences as any;
      conversation.currentProducts = nextSearchState.currentSearchResults as any;
      conversation.lastSearchResults = nextSearchState.currentSearchResults as any;
    } else if (requirementsChanged) {
      const nextSearchState = archiveCurrentSearch(searchState);
      conversation.currentSearchId = nextSearchState.currentSearchId;
      conversation.currentSearchQuery = nextSearchState.currentSearchQuery;
      conversation.currentSearchResults = nextSearchState.currentSearchResults as any;
      conversation.previousSearchResults = nextSearchState.previousSearchResults as any;
      conversation.conversationProductReferences = nextSearchState.conversationProductReferences as any;
      conversation.currentProducts = [] as any;
      conversation.lastSearchResults = [] as any;
    }
    conversation.conversationSummary = summarizeAdvisorRequirements(requirements);
    conversation.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await conversation.save();

    if (streaming) {
      sendValidatedExplanation(res, result.reply);
      finishAdvisorRequestTrace(trace);
      sendAdvisorStreamEvent(res, {
        type: 'complete', conversation_id: conversationId, assistant_message_id: assistantMessageId,
        intent: result.intent, understood_requirements: requirements,
        suggested_questions: result.suggestedQuestions, needs_clarification: result.needsClarification,
        timings_ms: trace.phases,
      });
      return res.end();
    }
    finishAdvisorRequestTrace(trace);
    setServerTiming(res, trace);
    return res.json({
      success: true,
      conversation_id: conversationId,
      message: { role: 'assistant', content: result.reply },
      assistant_message_id: assistantMessageId,
      intent: result.intent,
      understood_requirements: requirements,
      products: result.products,
      suggested_questions: result.suggestedQuestions,
      needs_clarification: result.needsClarification,
      status: 'success',
    });
  } catch (error) {
    finishAdvisorRequestTrace(trace);
    if (streaming) {
      if (!abortController.signal.aborted) {
        const message = error instanceof ProductAdvisorError ? error.message : 'Trá»£ lÃ½ chÆ°a hoÃ n táº¥t cÃ¢u tráº£ lá»i. Báº¡n cÃ³ thá»ƒ thá»­ láº¡i.';
        sendAdvisorStreamEvent(res, { type: 'error', message });
      }
      if (!res.writableEnded) return res.end();
      return undefined;
    }
    setServerTiming(res, trace);
    return publicError(error, next, res);
  }
  }));
  return work.finally(() => { if (heartbeat) clearInterval(heartbeat); });
});

router.get('/conversations/:conversationId', async (req, res, next) => {
  if (!validConversationId(req.params.conversationId)) return res.status(400).json({ success: false, message: 'Mã phiên trò chuyện không hợp lệ.' });
  try {
    const conversation = await AdvisorConversation.findOne({ conversationId: req.params.conversationId }).lean() as any;
    if (!conversation) return res.status(404).json({ success: false, message: 'Phiên trò chuyện không còn tồn tại hoặc đã hết hạn.' });
    const messages = await hydrateConversationMessages(conversation.messages ?? []);
    const messageIds = messages.flatMap((message: any) => message.role === 'assistant' && message.message_id ? [message.message_id] : []);
    const feedbackRows = messageIds.length ? await AdvisorFeedback.find({ conversationId: conversation.conversationId, assistantMessageId: { $in: messageIds } })
      .select('assistantMessageId rating reportType errorCategory productId').lean() as any[] : [];
    const feedbackByMessage = new Map<string, any>();
    for (const row of feedbackRows) {
      const current = feedbackByMessage.get(row.assistantMessageId) ?? { rating: null, report_type: 'none', error_category: null, product_id: null, reported_product_ids: [], issue_reported: false };
      if (row.reportType === 'none') current.rating = row.rating;
      if (row.reportType === 'wrong_advice') { current.issue_reported = true; current.error_category = row.errorCategory; }
      if (row.reportType === 'irrelevant_product' && row.productId) current.reported_product_ids.push(String(row.productId));
      feedbackByMessage.set(row.assistantMessageId, current);
    }
    return res.json({
      success: true, conversation_id: conversation.conversationId,
      messages: messages.map((message: any) => ({ ...message, feedback: message.message_id ? feedbackByMessage.get(message.message_id) ?? null : null })),
      understood_requirements: conversation.requirements ?? EMPTY_ADVISOR_REQUIREMENTS,
      conversation_summary: conversation.conversationSummary ?? '',
      expires_at: conversation.expiresAt,
    });
  } catch (error) { next(error); }
});

router.post('/feedback', async (req, res, next) => {
  const validated = validateAdvisorFeedbackInput(req.body);
  if ('error' in validated) return res.status(400).json({ success: false, message: validated.error });
  const { data } = validated;
  if (data.productId && !isValidObjectId(data.productId)) return res.status(400).json({ success: false, message: 'product_id is invalid' });
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!takeLiveSearchSlot(`advisor-feedback:${ip}`, Date.now(), 20)) return res.status(429).json({ success: false, message: 'feedback rate limit exceeded' });

  return withConversationQueue(data.conversationId, async () => {
    try {
      const conversation = await AdvisorConversation.findOne({ conversationId: data.conversationId });
      if (!conversation) return res.status(404).json({ success: false, message: 'conversation not found' });
      const message = findAssistantFeedbackMessage(conversation.messages as any[], data.assistantMessageId) as any;
      if (!message) return res.status(404).json({ success: false, message: 'assistant message not found in this conversation' });
      if (data.reportType === 'irrelevant_product') {
        if (!data.productId || !isFeedbackProductAttached(message, data.productId)) {
          return res.status(400).json({ success: false, message: 'product_id is not attached to this assistant message' });
        }
      } else if (data.productId) {
        return res.status(400).json({ success: false, message: 'product_id is only valid for irrelevant_product reports' });
      }
      const saved = await AdvisorFeedback.findOneAndUpdate(
        {
          conversationId: data.conversationId, assistantMessageId: data.assistantMessageId,
          reportType: data.reportType, productId: data.productId ?? null,
        },
        { $set: {
          rating: data.rating, reportType: data.reportType, errorCategory: data.errorCategory,
          productId: data.productId ?? null, assistantIntent: message.intent ?? null,
        } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      ).select('_id');
      return res.json({ success: true, feedback: {
        id: String(saved?._id), rating: data.rating, report_type: data.reportType,
        error_category: data.errorCategory, product_id: data.productId,
      } });
    } catch (error) { next(error); }
  });
});

router.get('/feedback/summary', requireAdmin, async (_req, res, next) => {
  try {
    const [totalFeedbackEntries, ratedAssistantMessages, issueReportTotal, ratings, reportTypes, categories, products] = await Promise.all([
      AdvisorFeedback.countDocuments(),
      AdvisorFeedback.countDocuments({ reportType: 'none' }),
      AdvisorFeedback.countDocuments({ reportType: { $ne: 'none' } }),
      AdvisorFeedback.aggregate([{ $match: { reportType: 'none' } }, { $group: { _id: '$rating', count: { $sum: 1 } } }]),
      AdvisorFeedback.aggregate([{ $group: { _id: '$reportType', count: { $sum: 1 } } }]),
      AdvisorFeedback.aggregate([{ $match: { reportType: { $ne: 'none' } } }, { $group: { _id: '$errorCategory', count: { $sum: 1 } } }]),
      AdvisorFeedback.aggregate([
        { $match: { reportType: 'irrelevant_product', productId: { $ne: null } } },
        { $group: { _id: '$productId', reports: { $sum: 1 } } },
        { $sort: { reports: -1 } }, { $limit: 10 },
      ]),
    ]);
    const asCounts = (rows: Array<{ _id: string | null; count: number }>) => Object.fromEntries(rows.map((row) => [row._id ?? 'unclassified', row.count]));
    return res.json({
      success: true, generated_at: new Date().toISOString(), totalFeedbackEntries, ratedAssistantMessages, issueReportTotal,
      byRating: asCounts(ratings), byReportType: asCounts(reportTypes), byErrorCategory: asCounts(categories),
      topIrrelevantProductIds: products.map((row: any) => ({ productId: String(row._id), reports: row.reports })),
    });
  } catch (error) { next(error); }
});

router.delete('/conversations/:conversationId', async (req, res, next) => {
  if (!validConversationId(req.params.conversationId)) return res.status(400).json({ success: false, message: 'Mã phiên trò chuyện không hợp lệ.' });
  try {
    await withConversationQueue(req.params.conversationId, () => AdvisorConversation.deleteOne({ conversationId: req.params.conversationId }).then(() => undefined));
    return res.status(204).end();
  } catch (error) { next(error); }
});

router.post('/conversations/:conversationId/reset', async (req, res, next) => {
  if (!validConversationId(req.params.conversationId)) return res.status(400).json({ success: false, message: 'Mã phiên trò chuyện không hợp lệ.' });
  try {
    const conversation = await AdvisorConversation.findOne({ conversationId: req.params.conversationId });
    if (!conversation) return res.status(404).json({ success: false, message: 'Phiên trò chuyện không còn tồn tại hoặc đã hết hạn.' });
    conversation.messages = [] as any;
    conversation.requirements = EMPTY_ADVISOR_REQUIREMENTS;
    conversation.currentCategory = null;
    conversation.currentBudget = null;
    conversation.preferences = [];
    conversation.currentProducts = [] as any;
    conversation.lastSearchResults = [] as any;
    conversation.currentSearchId = null;
    conversation.currentSearchQuery = '';
    conversation.currentSearchResults = [] as any;
    conversation.previousSearchResults = [] as any;
    conversation.conversationProductReferences = [] as any;
    conversation.conversationSummary = '';
    conversation.expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await conversation.save();
    return res.json({ success: true, conversation_id: conversation.conversationId, status: 'reset' });
  } catch (error) { next(error); }
});

router.get('/suggestions', (_req, res) => res.json({
  suggestions: [
    'Tư vấn laptop học lập trình theo ngân sách',
    'Tìm điện thoại chụp ảnh tốt',
    'So sánh CPU Intel và AMD',
    'Tìm tai nghe học online có microphone rõ',
  ],
}));

export default router;
