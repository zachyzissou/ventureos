/**
 * JSON Schema Validator — VentureOS QA Framework (P1 #31)
 *
 * Validates JSON content against JSON Schema definitions using Ajv.
 * Supports:
 * - Basic JSON syntax validation
 * - Schema-based structural validation
 * - Custom schema registry for reuse
 */

import Ajv, { type ErrorObject } from 'ajv';

import type { Validator, ValidatorInput, ValidationResult, ValidationFinding } from '../qa-framework';

export interface JsonSchemaValidatorConfig {
  /** Pre-registered schemas keyed by $id or name. */
  schemas?: Record<string, object>;
  /** Ajv options override. */
  ajvOptions?: Record<string, unknown>;
  /** Scoring dimension this validator maps to. Default: 'accuracy' */
  dimension?: string;
}

export class JsonSchemaValidator implements Validator {
  readonly id = 'json-schema';
  readonly name = 'JSON Schema Validator';
  readonly supportedTypes = ['json'];

  private readonly ajv: Ajv;
  private readonly schemas: Map<string, object>;
  private readonly dimension: string;

  constructor(config: JsonSchemaValidatorConfig = {}) {
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      ...(config.ajvOptions ?? {}),
    });
    this.schemas = new Map();
    this.dimension = config.dimension ?? 'accuracy';

    if (config.schemas) {
      for (const [key, schema] of Object.entries(config.schemas)) {
        this.registerSchema(key, schema);
      }
    }
  }

  /** Register a schema for later use. */
  registerSchema(name: string, schema: object): void {
    this.schemas.set(name, schema);
    try {
      this.ajv.addSchema(schema, name);
    } catch {
      // Schema may already be registered; Ajv throws on duplicates.
      this.ajv.removeSchema(name);
      this.ajv.addSchema(schema, name);
    }
  }

  /** Get a registered schema by name. */
  getSchema(name: string): object | undefined {
    return this.schemas.get(name);
  }

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const start = performance.now();
    const findings: ValidationFinding[] = [];

    // Step 1: Parse JSON.
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Try to extract line info from the error.
      const posMatch = msg.match(/position\s+(\d+)/i);
      const pos = posMatch ? Number(posMatch[1]) : undefined;
      let line: number | undefined;
      if (pos !== undefined) {
        line = input.content.slice(0, pos).split('\n').length;
      }

      findings.push({
        ruleId: 'json.syntax.parse-error',
        severity: 'error',
        message: `Invalid JSON: ${msg}`,
        line,
      });

      return {
        validatorId: this.id,
        passed: false,
        findings,
        score: 0,
        durationMs: Math.round(performance.now() - start),
        metadata: { dimension: this.dimension },
      };
    }

    // Step 2: Schema validation (if a schema name is provided in context).
    const schemaName = (input.context?.schema as string) ?? (input.context?.schemaName as string);
    if (schemaName) {
      const schema = this.schemas.get(schemaName);
      if (!schema) {
        findings.push({
          ruleId: 'json.schema.not-found',
          severity: 'warning',
          message: `Schema "${schemaName}" not found in registry.`,
        });
      } else {
        const validate = this.ajv.getSchema(schemaName);
        if (validate) {
          const valid = validate(parsed);
          if (!valid && validate.errors) {
            for (const err of validate.errors) {
              findings.push(this.ajvErrorToFinding(err));
            }
          }
        }
      }
    }

    // Step 3: Basic structural checks.
    this.checkStructure(parsed, findings);

    const errorCount = findings.filter((f) => f.severity === 'error').length;
    const warningCount = findings.filter((f) => f.severity === 'warning').length;
    const score = Math.max(0, 100 - errorCount * 20 - warningCount * 5);

    return {
      validatorId: this.id,
      passed: errorCount === 0,
      findings,
      score,
      durationMs: Math.round(performance.now() - start),
      metadata: {
        dimension: this.dimension,
        parseable: true,
        schemaValidated: !!schemaName,
      },
    };
  }

  private ajvErrorToFinding(err: ErrorObject): ValidationFinding {
    const path = err.instancePath || '/';
    return {
      ruleId: `json.schema.${err.keyword}`,
      severity: 'error',
      message: `${path}: ${err.message ?? 'Schema validation failed'} (keyword: ${err.keyword})`,
      suggestion: err.keyword === 'required'
        ? `Add the missing property: ${(err.params as { missingProperty?: string })?.missingProperty ?? '?'}`
        : undefined,
    };
  }

  private checkStructure(parsed: unknown, findings: ValidationFinding[]): void {
    // Warn on empty objects/arrays at the root.
    if (parsed !== null && typeof parsed === 'object') {
      if (Array.isArray(parsed) && parsed.length === 0) {
        findings.push({
          ruleId: 'json.structure.empty-array',
          severity: 'info',
          message: 'Root value is an empty array.',
        });
      } else if (!Array.isArray(parsed) && Object.keys(parsed as object).length === 0) {
        findings.push({
          ruleId: 'json.structure.empty-object',
          severity: 'info',
          message: 'Root value is an empty object.',
        });
      }
    }
  }
}
