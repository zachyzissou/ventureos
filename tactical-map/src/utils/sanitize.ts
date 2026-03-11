import DOMPurify from 'dompurify';

/**
 * Sanitize untrusted (DB/API) strings before rendering.
 *
 * - For DOM-rendered text: strips all tags/attrs (P0-3).
 * - For canvas text (Pixi Text): defense-in-depth; Pixi treats text as plain text.
 */
export function sanitizePlainText(input: unknown, maxLen = 2_000): string {
  const raw = String(input ?? '');
  const capped = raw.slice(0, Math.max(0, maxLen));

  // DOMPurify only works when a DOM is available.
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    return DOMPurify.sanitize(capped, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  }

  // Node/test fallback: strip obvious HTML control chars.
  return capped.replace(/[<>]/g, '');
}
