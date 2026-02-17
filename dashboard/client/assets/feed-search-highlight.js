(function attachFeedSearchHighlight(globalScope) {
  function normalizeSearchTerm(term) {
    if (typeof term !== 'string') return '';
    return term;
  }

  // Escape regex special characters to prevent regex injection and ReDoS attacks
  // Note: Hyphen is NOT escaped because it only has special meaning inside character
  // classes (e.g., [a-z]). Escaping it as `\-` with the `u` flag causes an error.
  // All other regex metacharacters are properly escaped.
  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findMatch(text, term) {
    if (!term) return null;

    // Limit search term length to prevent ReDoS attacks
    if (term.length > 200) return null;

    try {
      const escaped = escapeRegex(term);
      const regex = new RegExp(escaped, 'iu');
      const match = regex.exec(text);
      if (!match || typeof match.index !== 'number') return null;

      return {
        index: match.index,
        value: match[0],
      };
    } catch (err) {
      // Silently fail if regex execution throws (e.g., stack overflow)
      return null;
    }
  }

  // Safely render highlighted text using DOM APIs to prevent XSS
  // Uses textContent and createTextNode instead of innerHTML
  function renderHighlightedText(container, text, term) {
    if (!container || typeof container.textContent === 'undefined') return false;

    const sourceText = typeof text === 'string' ? text : String(text ?? '');
    const normalizedTerm = normalizeSearchTerm(typeof term === 'string' ? term : String(term ?? ''));

    if (!normalizedTerm) {
      container.textContent = sourceText;
      return false;
    }

    container.textContent = '';

    const found = findMatch(sourceText, normalizedTerm);
    if (!found) {
      container.textContent = sourceText;
      return false;
    }

    if (found.index > 0) {
      container.appendChild(document.createTextNode(sourceText.slice(0, found.index)));
    }

    const highlight = document.createElement('span');
    highlight.className = 'search-highlight';
    highlight.textContent = found.value;
    container.appendChild(highlight);

    const tail = sourceText.slice(found.index + found.value.length);
    if (tail) {
      container.appendChild(document.createTextNode(tail));
    }

    return true;
  }

  const api = { normalizeSearchTerm, renderHighlightedText };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (globalScope) {
    globalScope.feedSearchHighlight = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
