/** Optional env fallbacks. Paste keys in the Grimoire, or set GEMINI_API_KEY / OPENAI_API_KEY. */
export function resolveGeminiKey(override?: string): string {
  const fromClient = override?.trim() ?? "";
  if (fromClient) return fromClient;
  return process.env.GEMINI_API_KEY?.trim() ?? "";
}

export function resolveOpenaiKey(override?: string): string {
  const fromClient = override?.trim() ?? "";
  if (fromClient) return fromClient;
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}
