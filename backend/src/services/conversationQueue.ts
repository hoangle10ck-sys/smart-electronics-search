const conversationTails = new Map<string, Promise<void>>();

/** Serialize stateful turns for one conversation while allowing other sessions to run concurrently. */
export async function withConversationQueue<T>(conversationId: string, action: () => Promise<T>): Promise<T> {
  const previous = conversationTails.get(conversationId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  conversationTails.set(conversationId, tail);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (conversationTails.get(conversationId) === tail) conversationTails.delete(conversationId);
  }
}
