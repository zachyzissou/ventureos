# QA Framework — VentureOS Output Quality Assurance

## Overview

The QA Framework provides automated quality checking for all agent outputs in VentureOS. It validates content structure, correctness, and style compliance, producing actionable feedback and quality scores.

## Architecture

```
┌──────────────────────────────────────────┐
│              VerifierQA                  │
│  (Pre-configured pipeline + feedback)    │
├──────────────────────────────────────────┤
│              QAFramework                 │
│  (Orchestrator: run validators, score)   │
├──────────────┬───────────────────────────┤
│ ScoringEngine│     Quality Rubric        │
│ (Weighted    │  (Clarity, Completeness,  │
│  dimensions) │   Accuracy, Consistency)  │
├──────────────┴───────────────────────────┤
│              Validators                  │
│  ┌──────────┐ ┌───────────┐ ┌─────────┐ │
│  │ Markdown │ │ JSON      │ │Complete-│ │
│  │ Validator│ │ Schema    │ │ness     │ │
│  ├──────────┤ ├───────────┤ ├─────────┤ │
│  │ Link     │ │ Code      │ │ Custom  │ │
│  │ Checker  │ │ Syntax    │ │ ...     │ │
│  └──────────┘ └───────────┘ └─────────┘ │
└──────────────────────────────────────────┘
```

## Quick Start

### Basic Usage

```typescript
import { QAFramework } from './lib/qa-framework';
import { MarkdownValidator } from './lib/validators/markdown-validator';
import { CompletenessChecker } from './lib/validators/completeness-checker';

const qa = new QAFramework({
  validators: [
    new MarkdownValidator(),
    new CompletenessChecker(),
  ],
});

const report = await qa.validate({
  content: '# My Document\n\n## Overview\n\nContent here...',
  contentType: 'markdown',
});

console.log(`Score: ${report.overallScore}/100`);
console.log(`Passed: ${report.passed}`);
console.log(QAFramework.formatReport(report));
```

### Verifier Integration (Full Pipeline)

```typescript
import { VerifierQA } from './lib/verifier-integration';

const verifier = new VerifierQA({
  autoApproveThreshold: 80,
  onFeedback: (feedback) => {
    console.log(`Verdict: ${feedback.verdict}`);
    console.log(`Score: ${feedback.score}`);
  },
});

// Validate a single output
const { report, feedback } = await verifier.validate(
  { content: markdownContent, contentType: 'markdown' },
  'synth' // agent ID
);

// Validate mission artifacts
const result = await verifier.validateArtifacts({
  missionId: 'mission-001',
  artifacts: [
    { name: 'report.md', content: '...', producedBy: 'synth' },
    { name: 'config.json', content: '...', producedBy: 'atlas' },
  ],
});

console.log(VerifierQA.formatVerificationReport(result));
```

## Validators

### Markdown Validator (`markdown`)

Validates markdown structural correctness.

**Checks:**
- H1 header presence (configurable)
- Heading hierarchy (no level skipping)
- Code block closure
- Link syntax (empty URLs, broken references)
- List marker consistency

**Configuration:**
```typescript
new MarkdownValidator({
  requireH1: true,           // Require exactly one H1
  maxHeadingLevel: 6,        // Max heading depth
  checkHeadingHierarchy: true, // Check for skipped levels
  checkCodeBlocks: true,     // Check unclosed fences
  checkLinks: true,          // Check link syntax
  dimension: 'clarity',      // Scoring dimension
});
```

### JSON Schema Validator (`json-schema`)

Validates JSON syntax and schema compliance using Ajv.

**Checks:**
- JSON parse validity
- Schema validation (when schema provided)
- Empty root structure detection

**Configuration:**
```typescript
const v = new JsonSchemaValidator({
  schemas: {
    'my-schema': {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  dimension: 'accuracy',
});

// Validate against schema
await v.validate({
  content: '{"name": "test"}',
  contentType: 'json',
  context: { schema: 'my-schema' },
});
```

### Completeness Checker (`completeness`)

Validates that output includes required sections and sufficient content.

**Checks:**
- Minimum content length
- Maximum content length (optional)
- Required/recommended section presence
- Section minimum length
- YAML frontmatter (for markdown)

**Configuration:**
```typescript
new CompletenessChecker({
  requiredSections: [
    { id: 'intro', name: 'Introduction', patterns: ['introduction'], required: true },
    { id: 'summary', name: 'Summary', patterns: ['summary'], required: false },
  ],
  minContentLength: 100,
  maxContentLength: 50000,
  dimension: 'completeness',
});
```

### Link Checker (`link-checker`)

Validates link integrity in markdown/HTML content.

**Checks:**
- URL format validation
- Scheme allowlisting
- Placeholder URL detection
- Duplicate link detection
- Internal anchor reference validation

**Configuration:**
```typescript
new LinkChecker({
  allowedSchemes: ['https'],
  checkDuplicates: true,
  knownAnchors: ['external-ref'],
  dimension: 'accuracy',
});
```

### Code Syntax Checker (`code-syntax`)

Validates code blocks for basic syntax correctness.

**Checks:**
- Bracket/brace/parenthesis matching
- String literal closure
- `console.log` detection
- TODO/FIXME comment detection
- Extracts and checks code blocks from markdown

**Configuration:**
```typescript
new CodeSyntaxChecker({
  supportedLanguages: ['typescript', 'javascript'],
  checkBrackets: true,
  checkStrings: true,
  checkPatterns: true,
  dimension: 'accuracy',
});
```

## Quality Rubric

The rubric defines four scoring dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Clarity** | 25% | Readability, structure, conciseness |
| **Completeness** | 30% | Coverage of required elements |
| **Accuracy** | 25% | Correctness, valid syntax, references |
| **Consistency** | 20% | Style compliance, formatting uniformity |

### Score Levels

| Score | Level | Meaning |
|-------|-------|---------|
| 90–100 | Excellent | Publication-ready |
| 80–89 | Very Good | Few issues |
| 65–79 | Good | Solid with minor improvements |
| 50–64 | Acceptable | Minimum bar |
| 30–49 | Below Average | Needs improvement |
| 0–29 | Poor | Major revision required |

### Verdicts

- **Approve** (≥80): Auto-approved, no review needed
- **Revise** (40–79): Needs revision before approval
- **Reject** (<40): Does not meet minimum quality bar

## Custom Validators

Implement the `Validator` interface:

```typescript
import type { Validator, ValidatorInput, ValidationResult } from './lib/qa-framework';

class MyValidator implements Validator {
  readonly id = 'my-validator';
  readonly name = 'My Custom Validator';
  readonly supportedTypes = ['markdown'];

  async validate(input: ValidatorInput): Promise<ValidationResult> {
    const findings = [];
    // ... your validation logic ...
    return {
      validatorId: this.id,
      passed: findings.filter(f => f.severity === 'error').length === 0,
      findings,
      score: 100, // 0-100
      durationMs: 0,
      metadata: { dimension: 'clarity' }, // maps to scoring dimension
    };
  }
}
```

## API Reference

### `QAFramework`

- `validate(input: ValidatorInput): Promise<QualityReport>` — Run all validators
- `addValidator(v: Validator): void` — Register a validator
- `removeValidator(id: string): boolean` — Remove a validator
- `getValidators(): ReadonlyArray<Validator>` — List validators
- `QAFramework.formatReport(report): string` — Format report as markdown

### `VerifierQA`

- `validate(input, agentId?): Promise<{report, feedback}>` — Full QA pipeline
- `validateArtifacts(request): Promise<ArtifactValidationResult>` — Validate mission artifacts
- `VerifierQA.formatVerificationReport(result): string` — Format verification report

### `ScoringEngine`

- `computeScores(rawScores): {dimensionScores, overallScore, passed}` — Compute weighted scores
- `getConfig(): ScoringConfig` — Get current configuration

### `createDefaultRubric(): QualityRubric`

Returns the default quality rubric with all four dimensions.

## Files

| File | Purpose |
|------|---------|
| `lib/qa-framework.ts` | Core framework, scoring engine, types |
| `lib/quality-rubric.ts` | Quality rubric definitions and scoring |
| `lib/verifier-integration.ts` | Verifier role integration |
| `lib/validators/index.ts` | Barrel export |
| `lib/validators/markdown-validator.ts` | Markdown validation |
| `lib/validators/json-schema-validator.ts` | JSON schema validation |
| `lib/validators/completeness-checker.ts` | Completeness checking |
| `lib/validators/link-checker.ts` | Link validation |
| `lib/validators/code-syntax-checker.ts` | Code syntax checking |
