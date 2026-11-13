export function splitValidatedExplanation(text: string, chunkSize = 48) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('chunkSize must be a positive integer');
  const characters = Array.from(text);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += chunkSize) chunks.push(characters.slice(index, index + chunkSize).join(''));
  return chunks;
}

export function encodeAdvisorStreamEvent(event: Record<string, unknown>) {
  return `data: ${JSON.stringify(event)}\n\n`;
}
