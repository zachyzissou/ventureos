(function attachFeedSearchHighlight(globalScope) {
  function normalizeSearchTerm(term) {
    if (typeof term !== 'string') return '';
    return term;
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function findMatch(text, term) {
    if (!term) return null;

    const regex = new RegExp(escapeRegex(term), 'iu');
    const match = regex.exec(text);
    if (!match || typeof match.index !== 'number') return null;

    return {
      index: match.index,
      value: match[0],
    };
  }

  function renderHighlightedText(container, text, term) {
    if (!container || typeof container.textContent === 'undefined') return false;

    const sourceText = typeof text === 'string' ? text : String(text ?? '');
    const normalizedTerm = normalizeSearchTerm(typeof term === 'string' ? term : String(term ?? ''));

    container.textContent = '';
    if (!normalizedTerm) {
      container.textContent = sourceText;
      return false;
    }

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
