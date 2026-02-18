/**
 * Tests for Observer Prompt Template — Issue #231
 *
 * Validates prompt construction, cache-friendliness (static system prompt),
 * and correct message formatting.
 */

import {
  OBSERVER_SYSTEM_PROMPT,
  buildObserverUserPrompt,
  type ObserverMessageInput,
} from '../prompts/observer';

describe('Observer Prompt Template', () => {
  describe('OBSERVER_SYSTEM_PROMPT', () => {
    it('is a non-empty static string', () => {
      expect(typeof OBSERVER_SYSTEM_PROMPT).toBe('string');
      expect(OBSERVER_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    });

    it('includes priority definitions', () => {
      expect(OBSERVER_SYSTEM_PROMPT).toContain('🔴 high');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('🟡 medium');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('🟢 info');
    });

    it('specifies JSON output format', () => {
      expect(OBSERVER_SYSTEM_PROMPT).toContain('JSON array');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('content');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('priority');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('referenced_date');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('source_message_ids');
    });

    it('instructs to preserve specifics', () => {
      expect(OBSERVER_SYSTEM_PROMPT).toContain('proper nouns');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('numbers');
    });

    it('instructs to drop noise', () => {
      expect(OBSERVER_SYSTEM_PROMPT).toContain('pleasantries');
      expect(OBSERVER_SYSTEM_PROMPT).toContain('filler');
    });

    it('targets 5-15 observations', () => {
      expect(OBSERVER_SYSTEM_PROMPT).toContain('5-15 observations');
    });
  });

  describe('buildObserverUserPrompt', () => {
    const sampleMessages: ObserverMessageInput[] = [
      { messageId: 'msg-001', from: 'user', content: 'Can we switch to Postgres?', createdAt: '2026-02-18T10:00:00Z' },
      { messageId: 'msg-002', from: 'oracle', content: 'Yes, PostgreSQL would be better.', createdAt: '2026-02-18T10:01:00Z' },
      { messageId: 'msg-003', from: 'user', content: 'Great, let\'s do it by Friday.', createdAt: '2026-02-18T10:02:00Z' },
    ];

    it('includes current date', () => {
      const prompt = buildObserverUserPrompt(sampleMessages, '2026-02-18');
      expect(prompt).toContain('Current date: 2026-02-18');
    });

    it('includes message count', () => {
      const prompt = buildObserverUserPrompt(sampleMessages, '2026-02-18');
      expect(prompt).toContain('Message count: 3');
    });

    it('includes message delimiters', () => {
      const prompt = buildObserverUserPrompt(sampleMessages, '2026-02-18');
      expect(prompt).toContain('--- BEGIN MESSAGES ---');
      expect(prompt).toContain('--- END MESSAGES ---');
    });

    it('formats each message with ID, timestamp, sender, and content', () => {
      const prompt = buildObserverUserPrompt(sampleMessages, '2026-02-18');
      expect(prompt).toContain('[msg-001] 2026-02-18T10:00:00Z | user: Can we switch to Postgres?');
      expect(prompt).toContain('[msg-002]');
      expect(prompt).toContain('[msg-003]');
    });

    it('handles empty message array', () => {
      const prompt = buildObserverUserPrompt([], '2026-02-18');
      expect(prompt).toContain('Message count: 0');
      expect(prompt).toContain('--- BEGIN MESSAGES ---');
      expect(prompt).toContain('--- END MESSAGES ---');
    });

    it('handles large batches without truncation', () => {
      const largeMessages: ObserverMessageInput[] = Array.from({ length: 50 }, (_, i) => ({
        messageId: `msg-${i}`,
        from: i % 2 === 0 ? 'user' : 'oracle',
        content: `Message number ${i} with some content about the project.`,
        createdAt: `2026-02-18T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
      }));

      const prompt = buildObserverUserPrompt(largeMessages, '2026-02-18');
      expect(prompt).toContain('Message count: 50');
      expect(prompt).toContain('[msg-0]');
      expect(prompt).toContain('[msg-49]');
    });
  });
});
