import { validateHandoff } from '../handoff-validator';

describe('handoff validator', () => {
  test('validates legacy alias handoff using canonical contract identities', async () => {
    const res = await validateHandoff('oracle', 'archivist', {
      type: 'artifact',
      format: 'markdown',
      data: '## Test Insight\n\nShort summary with source links.'
    });

    expect(res.valid).toBe(true);
    expect(res.contract?.from.agentId).toBe('venture_research');
    expect(res.contract?.to.agentId).toBe('venture_memory');
  });

  test('rejects payload when envelope type does not match resolved contract', async () => {
    const res = await validateHandoff('oracle', 'archivist', {
      type: 'knowledge_artifact',
      format: 'json',
      data: {
        title: 'Mismatch',
        summary: 'Type does not match card contract'
      }
    });

    expect(res.valid).toBe(false);
    expect(res.errors?.join('\n')).toMatch(/Payload type mismatch/i);
  });

  test('rejects handoff when data format does not match contract format', async () => {
    const res = await validateHandoff('oracle', 'archivist', {
      type: 'artifact',
      format: 'markdown',
      data: { unexpected: 'object' }
    });
    expect(res.valid).toBe(false);
    expect(res.errors?.join('\n')).toMatch(/does not match expected format=markdown/i);
  });
});
