import { validateHandoff } from '../handoff-validator';

describe('handoff validator', () => {
  test('validates oracle -> archivist knowledge artifact handoff', async () => {
    const res = await validateHandoff('oracle', 'archivist', {
      type: 'knowledge_artifact',
      format: 'json',
      data: {
        title: 'Test Insight',
        summary: 'Short summary',
        sources: [{ url: 'https://example.com', note: 'Example source' }]
      }
    });

    expect(res.valid).toBe(true);
    expect(res.contract?.from.agentId).toBe('oracle');
    expect(res.contract?.to.agentId).toBe('archivist');
  });

  test('rejects invalid payload missing required fields', async () => {
    const res = await validateHandoff('oracle', 'archivist', {
      type: 'knowledge_artifact',
      format: 'json',
      data: {
        title: 'Missing sources',
        summary: 'No sources array'
      }
    });

    expect(res.valid).toBe(false);
    expect(res.errors?.join('\n')).toMatch(/Schema validation failed/i);
  });

  test('rejects handoff when no explicit contract exists', async () => {
    const res = await validateHandoff('atlas', 'oracle', { type: 'deployment_status', format: 'json', data: {} });
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/No contract/);
  });
});
