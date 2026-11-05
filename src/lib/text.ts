export const MAX_TEXT_LENGTH = 2_000;

export function normalizeText(text: string): string {
  // Only repair a word broken by an actual line break. Keep inline hyphens/math intact.
  return text.replace(/([A-Za-z])[-\u00ad]\s*\r?\n\s*([a-z])/g, "$1$2")
    .replace(/\s+/g, " ").trim();
}

export function characterCount(text: string): number {
  return Array.from(text).length;
}
