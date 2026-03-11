/**
 * JSON Schema Validator Tests — VentureOS QA Framework (P1 #31)
 */

import { JsonSchemaValidator } from '../validators/json-schema-validator';

describe('JsonSchemaValidator', () => {
  const validator = new JsonSchemaValidator();

  it('passes valid JSON', async () => {
    const result = await validator.validate({
      content: '{"name": "test", "value": 42}',
      contentType: 'json',
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.metadata?.parseable).toBe(true);
  });

  it('fails on invalid JSON syntax', async () => {
    const result = await validator.validate({
      content: '{"name": "test", value: 42}',
      contentType: 'json',
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    const parseErr = result.findings.find((f) => f.ruleId === 'json.syntax.parse-error');
    expect(parseErr).toBeDefined();
    expect(parseErr!.severity).toBe('error');
  });

  it('validates against registered schema', async () => {
    const v = new JsonSchemaValidator({
      schemas: {
        'test-schema': {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          required: ['name', 'age'],
        },
      },
    });

    const valid = await v.validate({
      content: '{"name": "Alice", "age": 30}',
      contentType: 'json',
      context: { schema: 'test-schema' },
    });
    expect(valid.passed).toBe(true);

    const invalid = await v.validate({
      content: '{"name": "Alice"}',
      contentType: 'json',
      context: { schema: 'test-schema' },
    });
    expect(invalid.passed).toBe(false);
    const reqErr = invalid.findings.find((f) => f.ruleId === 'json.schema.required');
    expect(reqErr).toBeDefined();
    expect(reqErr!.suggestion).toContain('age');
  });

  it('warns when schema not found in registry', async () => {
    const result = await validator.validate({
      content: '{"name": "test"}',
      contentType: 'json',
      context: { schema: 'nonexistent' },
    });

    const notFound = result.findings.find((f) => f.ruleId === 'json.schema.not-found');
    expect(notFound).toBeDefined();
    expect(notFound!.severity).toBe('warning');
  });

  it('reports empty root object', async () => {
    const result = await validator.validate({
      content: '{}',
      contentType: 'json',
    });

    const empty = result.findings.find((f) => f.ruleId === 'json.structure.empty-object');
    expect(empty).toBeDefined();
    expect(empty!.severity).toBe('info');
  });

  it('reports empty root array', async () => {
    const result = await validator.validate({
      content: '[]',
      contentType: 'json',
    });

    const empty = result.findings.find((f) => f.ruleId === 'json.structure.empty-array');
    expect(empty).toBeDefined();
  });

  it('handles nested JSON correctly', async () => {
    const v = new JsonSchemaValidator({
      schemas: {
        nested: {
          type: 'object',
          properties: {
            data: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: { type: 'number' },
                },
              },
              required: ['items'],
            },
          },
          required: ['data'],
        },
      },
    });

    const valid = await v.validate({
      content: '{"data": {"items": [1, 2, 3]}}',
      contentType: 'json',
      context: { schema: 'nested' },
    });
    expect(valid.passed).toBe(true);

    const wrongType = await v.validate({
      content: '{"data": {"items": ["not", "numbers"]}}',
      contentType: 'json',
      context: { schema: 'nested' },
    });
    expect(wrongType.passed).toBe(false);
  });

  it('can register schemas after construction', async () => {
    const v = new JsonSchemaValidator();
    v.registerSchema('dynamic', {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    });

    expect(v.getSchema('dynamic')).toBeDefined();

    const result = await v.validate({
      content: '{"id": "abc"}',
      contentType: 'json',
      context: { schema: 'dynamic' },
    });
    expect(result.passed).toBe(true);
  });

  it('maps to accuracy dimension by default', async () => {
    const result = await validator.validate({
      content: '{"ok": true}',
      contentType: 'json',
    });

    expect(result.metadata?.dimension).toBe('accuracy');
  });

  it('handles schemaName as alternative context key', async () => {
    const v = new JsonSchemaValidator({
      schemas: {
        alt: { type: 'object', required: ['x'] },
      },
    });

    const result = await v.validate({
      content: '{}',
      contentType: 'json',
      context: { schemaName: 'alt' },
    });

    expect(result.passed).toBe(false);
  });
});
