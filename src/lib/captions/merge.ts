/**
 * Meet rewrites caption text in place: words get corrected as the recognizer
 * gains confidence, and very long blocks can lose their beginning. Given the
 * text we had before and the text now on screen, return our best guess at the
 * full utterance.
 */
export function mergeCaptionText(previous: string, next: string): string {
  const prev = previous.trim();
  const curr = next.trim();

  if (!prev) return curr;
  if (!curr) return prev;

  // The common case: same start, the tail grew or was corrected.
  if (sharesStart(prev, curr)) return curr;

  // Meet trimmed the front of the block. Find where the new text begins
  // inside what we already have and stitch the two together.
  for (const anchorLength of [40, 20]) {
    if (curr.length < anchorLength) continue;
    const anchor = curr.slice(0, anchorLength);
    const at = prev.lastIndexOf(anchor);
    if (at > 0) return prev.slice(0, at) + curr;
  }

  // Unrelated text. Trust what is on screen.
  return curr;
}

function sharesStart(a: string, b: string): boolean {
  const probe = Math.min(a.length, b.length, 12);
  return a.slice(0, probe).toLowerCase() === b.slice(0, probe).toLowerCase();
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
