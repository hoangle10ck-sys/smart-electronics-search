import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  AdvisorConversationMessage, AdvisorChatResponse, AdvisorFeedbackCategory, AdvisorFeedbackState, AdvisorStreamEvent, Product,
  deleteAdvisorConversation, getAdvisorConversation, sendAdvisorMessageStreaming, submitAdvisorFeedback,
} from '../api';
import ProductCard from './ProductCard';
import Icon from './Icon';

type DisplayMessage = AdvisorConversationMessage & { streamId?: string; streaming?: boolean; streamPhase?: string };
const STORAGE_KEY = 'techfind-advisor-conversation-v1';
const INTRO: DisplayMessage = {
  role: 'assistant',
  content: 'Chào bạn! Mình có thể giúp tìm và so sánh thiết bị điện tử trong catalog. Bạn đang cần mua thiết bị gì, dùng cho mục đích nào ạ?',
  suggested_questions: ['Tư vấn laptop theo ngân sách', 'Tìm điện thoại chụp ảnh tốt', 'So sánh CPU Intel và AMD'],
  products: [],
};

export default function ProductAdvisorWidget({
  comparedIds,
  onToggleCompare,
  onViewProduct,
}: {
  comparedIds: string[];
  onToggleCompare: (product: Product) => void;
  onViewProduct: (product: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamPhase, setStreamPhase] = useState('queued');
  const [error, setError] = useState('');
  const [failedRequest, setFailedRequest] = useState<{ text: string; id: string } | null>(null);
  const [feedbackBusyMessageId, setFeedbackBusyMessageId] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<{ messageId: string; text: string } | null>(null);
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState<AdvisorFeedbackCategory>('query_understanding');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    const savedId = window.localStorage.getItem(STORAGE_KEY);
    if (!savedId) {
      setHistoryReady(true);
      return () => { active = false; };
    }
    setConversationId(savedId);
    getAdvisorConversation(savedId).then((conversation) => {
      if (!active) return;
      setMessages(conversation.messages);
    }).catch(() => {
      if (!active) return;
      setError('Chưa tải được phiên trò chuyện đã lưu. Bạn có thể thử lại hoặc xóa phiên để bắt đầu mới.');
    }).finally(() => {
      if (active) setHistoryReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const openAdvisor = () => setOpen(true);
    window.addEventListener('techfind:open-advisor', openAdvisor);
    return () => window.removeEventListener('techfind:open-advisor', openAdvisor);
  }, []);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages, loading, error]);

  useEffect(() => {
    if (open && historyReady && !loading) inputRef.current?.focus();
  }, [open, historyReady, loading]);

  const send = async (raw: string, retry?: { text: string; id: string }) => {
    const text = raw.trim();
    if (!text || loading || !historyReady) return;
    const requestId = retry?.id ?? crypto.randomUUID();
    let sessionId = conversationId;
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      setConversationId(sessionId);
      window.localStorage.setItem(STORAGE_KEY, sessionId);
    }
    if (!retry) {
      setMessages((current) => [...current, { role: 'user', content: text }]);
      setInput('');
    }
    const streamId = `stream:${requestId}`;
    setMessages((current) => [
      ...current.filter((message) => message.streamId !== streamId),
      { role: 'assistant', content: '', products: [], streamId, streaming: true },
    ]);
    setLoading(true);
    setStreamPhase('queued');
    setError('');
    setFailedRequest(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response: AdvisorChatResponse = await sendAdvisorMessageStreaming(
        text, sessionId, requestId, (event: AdvisorStreamEvent) => {
          if (event.type === 'status') {
            setStreamPhase(event.phase);
            setMessages((current) => current.map((message) => message.streamId === streamId ? { ...message, streamPhase: event.phase } : message));
          } else if (event.type === 'verified_products') {
            setMessages((current) => current.map((message) => message.streamId === streamId ? { ...message, products: event.products } : message));
          } else if (event.type === 'explanation_delta') {
            setMessages((current) => current.map((message) => message.streamId === streamId ? { ...message, content: message.content + event.text } : message));
          }
        }, controller.signal,
      );
      setConversationId(response.conversation_id);
      window.localStorage.setItem(STORAGE_KEY, response.conversation_id);
      setMessages((current) => current.map((message) => message.streamId === streamId ? {
        ...message, streaming: false, streamPhase: undefined, content: response.message.content, intent: response.intent,
        message_id: response.assistant_message_id, needs_clarification: response.needs_clarification,
        suggested_questions: response.suggested_questions, products: response.products,
      } : message));
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Trợ lý chưa kết nối được. Bạn có thể thử lại.';
      setMessages((current) => current.filter((item) => item.streamId !== streamId));
      setError(controller.signal.aborted ? 'Yêu cầu đã bị hủy. Bạn có thể thử lại để khôi phục câu trả lời nếu máy chủ đã lưu xong.' : message);
      setFailedRequest({ text, id: requestId });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
    }
  };

  const cancelRequest = () => abortRef.current?.abort();
  const sendFeedback = async (
    message: DisplayMessage,
    feedback: { rating: 'helpful' | 'not_helpful'; report_type?: 'none' | 'wrong_advice' | 'irrelevant_product'; error_category?: AdvisorFeedbackCategory; product_id?: string },
  ) => {
    if (!conversationId || !message.message_id) return;
    setFeedbackBusyMessageId(message.message_id);
    setFeedbackError(null);
    try {
      const saved = await submitAdvisorFeedback(conversationId, message.message_id, feedback);
      setMessages((current) => current.map((item) => {
        if (item.message_id !== message.message_id) return item;
        const prior: AdvisorFeedbackState = item.feedback ?? { rating: null, report_type: 'none', error_category: null, product_id: null, reported_product_ids: [], issue_reported: false };
        const next: AdvisorFeedbackState = { ...prior, ...saved };
        if (feedback.report_type === 'irrelevant_product' && feedback.product_id) {
          next.reported_product_ids = [...new Set([...(prior.reported_product_ids ?? []), feedback.product_id])];
          next.rating = prior.rating;
        }
        if (feedback.report_type === 'wrong_advice') {
          next.issue_reported = true;
          next.rating = prior.rating;
        }
        if ((feedback.report_type ?? 'none') === 'none') {
          next.error_category = prior.error_category;
          next.issue_reported = prior.issue_reported;
          next.reported_product_ids = prior.reported_product_ids;
        }
        return { ...item, feedback: next };
      }));
      setReportingMessageId(null);
    } catch (submitError) {
      setFeedbackError({ messageId: message.message_id, text: submitError instanceof Error ? submitError.message : 'Chưa gửi được phản hồi.' });
    } finally {
      setFeedbackBusyMessageId(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  };

  const clearConversation = async () => {
    setLoading(true);
    setError('');
    try {
      if (conversationId) await deleteAdvisorConversation(conversationId);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Chưa xóa được phiên trò chuyện.');
      setLoading(false);
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
    setConversationId(null);
    setMessages([]);
    setInput('');
    setFailedRequest(null);
    setLoading(false);
  };

  const visibleMessages = messages.length ? messages : [INTRO];

  return (
    <>
      {open && (
        <section className={`advisor-widget${expanded ? ' is-expanded' : ''}`} aria-label="Trợ lý tư vấn sản phẩm điện tử">
          <header className="advisor-widget-header">
            <span className="advisor-avatar"><Icon name="sparkles" size={19} /></span>
            <div className="advisor-widget-title"><strong>Trợ lý mua sắm</strong><small>{historyReady ? 'Tư vấn từ catalog đã xác minh' : 'Đang tải phiên trò chuyện…'}</small></div>
            <div className="advisor-widget-actions">
              <button type="button" title="Xóa hội thoại" aria-label="Xóa hội thoại" disabled={loading} onClick={() => void clearConversation()}>Xóa</button>
              <button type="button" title={expanded ? 'Thu nhỏ cửa sổ' : 'Mở rộng cửa sổ'} aria-label={expanded ? 'Thu nhỏ cửa sổ' : 'Mở rộng cửa sổ'} onClick={() => setExpanded((value) => !value)}>{expanded ? '⤡' : '⤢'}</button>
              <button type="button" title="Đóng trợ lý" aria-label="Đóng trợ lý" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
            </div>
          </header>

          <div className="advisor-widget-notice"><Icon name="shield" size={14} /> Phiên chat lưu tối đa 30 ngày. Tránh gửi thông tin cá nhân.</div>
          <div className="advisor-chat-log" role="log" aria-live="polite" aria-relevant="additions text">
            {visibleMessages.map((message, index) => (
              <article className={`advisor-message is-${message.role}`} key={message.streamId ?? `${message.created_at ?? 'local'}-${index}`}>
                {message.role === 'assistant' && <span className="advisor-message-avatar"><Icon name="sparkles" size={14} /></span>}
                <div className="advisor-message-content">
                  <div className="advisor-bubble">{message.content}</div>
                  {message.products?.length ? (
                    <div className="advisor-product-list" aria-label="Sản phẩm được đề xuất">
                      {message.products.map((product) => <div className="advisor-product-feedback-item" key={`${index}-${product._id}`}>
                        <ProductCard
                          p={product}
                          compared={comparedIds.includes(product._id)}
                          onToggleCompare={onToggleCompare}
                          onViewDetails={onViewProduct}
                        />
                        {message.role === 'assistant' && message.message_id && <button
                          type="button"
                          className="advisor-product-feedback"
                          disabled={feedbackBusyMessageId === message.message_id || message.feedback?.reported_product_ids?.includes(product._id)}
                          onClick={() => void sendFeedback(message, { rating: 'not_helpful', report_type: 'irrelevant_product', product_id: product._id })}
                        >{message.feedback?.reported_product_ids?.includes(product._id) ? 'Đã báo sản phẩm này' : 'Báo sản phẩm không liên quan'}</button>}
                      </div>)}
                    </div>
                  ) : null}
                  {message.role === 'assistant' && message.message_id && (
                    <div className="advisor-feedback" aria-label="Phản hồi về câu trả lời">
                      <span>{message.feedback?.rating ? 'Cảm ơn bạn đã phản hồi.' : 'Câu trả lời này có hữu ích không?'}</span>
                      <button type="button" disabled={feedbackBusyMessageId === message.message_id} aria-pressed={message.feedback?.rating === 'helpful'} onClick={() => void sendFeedback(message, { rating: 'helpful' })}>Hữu ích</button>
                      <button type="button" disabled={feedbackBusyMessageId === message.message_id} aria-pressed={message.feedback?.rating === 'not_helpful'} onClick={() => void sendFeedback(message, { rating: 'not_helpful' })}>Chưa hữu ích</button>
                      {message.feedback?.issue_reported
                        ? <small>Đã nhận báo cáo tư vấn sai · {message.feedback.error_category}</small>
                        : <button type="button" disabled={feedbackBusyMessageId === message.message_id} onClick={() => { setReportingMessageId(message.message_id!); setFeedbackError(null); }}>Báo tư vấn sai</button>}
                      {reportingMessageId === message.message_id && !message.feedback?.issue_reported && <div className="advisor-feedback-report">
                        <label>
                          Phân loại lỗi
                          <select value={reportCategory} onChange={(event) => setReportCategory(event.target.value as AdvisorFeedbackCategory)}>
                            <option value="query_understanding">Hiểu sai yêu cầu</option>
                            <option value="search">Lỗi tìm kiếm</option>
                            <option value="catalog_data">Dữ liệu catalog sai hoặc thiếu</option>
                            <option value="product_evaluation">Đánh giá sản phẩm sai</option>
                            <option value="qwen_explanation">Giải thích của trợ lý sai</option>
                          </select>
                        </label>
                        <button type="button" disabled={feedbackBusyMessageId === message.message_id} onClick={() => void sendFeedback(message, { rating: 'not_helpful', report_type: 'wrong_advice', error_category: reportCategory })}>Gửi báo cáo</button>
                      </div>}
                      {feedbackError?.messageId === message.message_id && <small role="alert">{feedbackError.text}</small>}
                    </div>
                  )}
                  {message.suggested_questions?.length ? (
                    <div className="advisor-question-chips" aria-label="Câu hỏi gợi ý">
                      {message.suggested_questions.map((question) => <button key={question} type="button" disabled={loading || !historyReady} onClick={() => void send(question)}>{question}</button>)}
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
            {loading && <div className="advisor-thinking" role="status"><span /><span /><span /><small>{streamPhase === 'queued' ? 'Đang xử lý yêu cầu…' : streamPhase === 'understanding' ? 'Đang phân tích nhu cầu…' : streamPhase === 'searching' ? 'Đang đối chiếu catalog…' : 'Đang hoàn tất câu trả lời…'}</small><button type="button" onClick={cancelRequest}>Hủy</button></div>}
            {error && <div className="advisor-error" role="alert"><p>{error}</p>{failedRequest && <button type="button" disabled={loading} onClick={() => void send(failedRequest.text, failedRequest)}>Thử lại</button>}</div>}
            <div ref={endRef} />
          </div>

          {!messages.length && historyReady && (
            <div className="advisor-welcome-prompts">{INTRO.suggested_questions?.map((question) => <button key={question} type="button" disabled={loading} onClick={() => void send(question)}>{question}</button>)}</div>
          )}

          <form className="advisor-composer" onSubmit={submit}>
            <label className="visually-hidden" htmlFor="advisor-message-input">Tin nhắn cho trợ lý</label>
            <textarea
              ref={inputRef}
              id="advisor-message-input"
              value={input}
              maxLength={1000}
              rows={2}
              placeholder="Bạn cần tìm thiết bị nào?"
              disabled={!historyReady || loading || Boolean(failedRequest)}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onInputKeyDown}
            />
            <button className="advisor-send" type="submit" aria-label="Gửi tin nhắn" disabled={!input.trim() || !historyReady || loading || Boolean(failedRequest)}>
              <Icon name="arrow" size={19} />
            </button>
            <small>Enter để gửi · Shift + Enter xuống dòng</small>
          </form>
        </section>
      )}
      <button
        type="button"
        className={`advisor-launcher${open ? ' is-open' : ''}`}
        aria-label={open ? 'Đóng trợ lý tư vấn' : 'Mở trợ lý tư vấn'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <Icon name="close" size={21} /> : <><Icon name="sparkles" size={20} /><span>Hỏi tư vấn</span></>}
      </button>
    </>
  );
}
