import { describe, expect, it } from 'vitest';
import { listVisualPatterns, parseVisualCommand, renderVisualExplainer } from '../../server/visual-explainer.js';

describe('visual-explainer core', () => {
  it('supports at least five distinct patterns', () => {
    expect(listVisualPatterns()).toEqual(['table', 'flow', 'timeline', 'hierarchy', 'comparison']);
  });

  it('parses slash commands', () => {
    const explain = parseVisualCommand('/explain product strategy > roadmap');
    const visualize = parseVisualCommand('/visualize A, B --pattern=comparison');
    expect(explain?.mode).toBe('explain');
    expect(explain?.subject).toContain('product strategy');
    expect(visualize?.requestedPattern).toBe('comparison');
  });

  it('renders interactive HTML output', () => {
    const rendered = renderVisualExplainer({
      command: '/visualize intake > classify > route --pattern=flow',
    });
    expect(rendered.renderTimeMs).toBeLessThan(3000);
    expect(rendered.pattern).toBe('flow');
    expect(rendered.html).toContain('<details');
    expect(rendered.html).toContain('data-tip=');
  });
});

