export interface AdvisorSearchSnapshot {
  searchId: string;
  query: string;
  createdAt: Date | string;
  productIds: string[];
}

export interface AdvisorConversationSearchState {
  currentSearchId: string | null;
  currentSearchQuery: string;
  currentSearchResults: string[];
  previousSearchResults: AdvisorSearchSnapshot[];
  conversationProductReferences: string[];
}

export const EMPTY_ADVISOR_SEARCH_STATE: AdvisorConversationSearchState = {
  currentSearchId: null,
  currentSearchQuery: '',
  currentSearchResults: [],
  previousSearchResults: [],
  conversationProductReferences: [],
};

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map(String).filter(Boolean))];
}

function currentSnapshot(state: AdvisorConversationSearchState): AdvisorSearchSnapshot | null {
  if (!state.currentSearchId && !state.currentSearchResults.length) return null;
  return {
    searchId: state.currentSearchId ?? `legacy-${Date.now()}`,
    query: state.currentSearchQuery ?? '',
    createdAt: new Date(),
    productIds: uniqueIds(state.currentSearchResults ?? []),
  };
}

export function archiveCurrentSearch(state: AdvisorConversationSearchState): AdvisorConversationSearchState {
  const snapshot = currentSnapshot(state);
  if (!snapshot) return state;
  const previous = [...(state.previousSearchResults ?? []), snapshot].slice(-20);
  return {
    ...state,
    currentSearchId: null,
    currentSearchQuery: '',
    currentSearchResults: [],
    previousSearchResults: previous,
    conversationProductReferences: uniqueIds([...(state.conversationProductReferences ?? []), ...snapshot.productIds]).slice(-200),
  };
}

export function recordCurrentSearch(
  state: AdvisorConversationSearchState,
  search: AdvisorSearchSnapshot,
): AdvisorConversationSearchState {
  const archived = archiveCurrentSearch(state);
  const productIds = uniqueIds(search.productIds);
  return {
    ...archived,
    currentSearchId: search.searchId,
    currentSearchQuery: search.query,
    currentSearchResults: productIds,
    conversationProductReferences: uniqueIds([...(archived.conversationProductReferences ?? []), ...productIds]).slice(-200),
  };
}

export function allHistoricalProductReferences(state: AdvisorConversationSearchState): string[] {
  const previousIds = (state.previousSearchResults ?? []).flatMap((search) => search.productIds ?? []);
  return uniqueIds([...(state.conversationProductReferences ?? []), ...previousIds]);
}
