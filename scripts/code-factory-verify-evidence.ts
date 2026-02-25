import fs from 'node:fs';
import { validateEvidenceSha, type PreflightEvidenceRecord } from '../lib/code-factory';

function getArg(name: string, fallback = ''): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function main(): void {
  const evidencePath = getArg('evidence', '');
  const expectedSha = getArg('sha', process.env.GITHUB_SHA ?? '');
  if (!evidencePath || !fs.existsSync(evidencePath)) {
    console.error(`Evidence file not found: ${evidencePath}`);
    process.exit(1);
  }

  const parsed = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as { evidence?: PreflightEvidenceRecord };
  if (!parsed.evidence) {
    console.error('Evidence payload missing .evidence object');
    process.exit(1);
  }

  if (!validateEvidenceSha(parsed.evidence, expectedSha)) {
    console.error(`Stale evidence: expected SHA ${expectedSha}, got ${parsed.evidence.head_sha}`);
    process.exit(1);
  }

  console.log(`SHA discipline check passed for ${expectedSha}`);
}

main();

