(function attachFeedSearchHighlight(globalScope) {
  function normalizeSearchTerm(term) {
    if (typeof term !== 'string') return '';
    return term.toLowerCase();
  }

  function renderHighlightedText(container, text, term) {
    if (!container || typeof container.textContent === 'undefined') return false;

    const sourceText = typeof text === 'string' ? text : String(text ?? '');
    const normalizedTerm = normalizeSearchTerm(term);

    container.textContent = '';
    if (!normalizedTerm) {
      container.textContent = sourceText;
      return false;
    }

    const idx = sourceText.toLowerCase().indexOf(normalizedTerm);
    if (idx === -1) {
      container.textContent = sourceText;
      return false;
    }

    if (idx > 0) {
      container.appendChild(document.createTextNode(sourceText.slice(0, idx)));
    }

    const highlight = document.createElement('span');
    highlight.className = 'search-highlight';
    highlight.textContent = sourceText.slice(idx, idx + normalizedTerm.length);
    container.appendChild(highlight);

    const tail = sourceText.slice(idx + normalizedTerm.length);
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
