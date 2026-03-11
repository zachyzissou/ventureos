import fs from 'node:fs';
import path from 'node:path';
import {
  loadRiskPolicy,
  analyzeRiskTier,
  buildPreflightEvidence,
} from '../lib/code-factory';

function getArg(name: string, fallback = ''): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

function parseIntSafe(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function readChangedFiles(source: string): string[] {
  if (!source) return [];
  if (fs.existsSync(source)) {
    return fs.readFileSync(source, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean);
  }
  return source.split(',').map((line) => line.trim()).filter(Boolean);
}

function writeGithubOutput(key: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `${key}=${value}\n`);
}

function main(): void {
  const policyPath = getArg('policy', path.join(process.cwd(), '.github', 'code-factory', 'risk-policy.json'));
  const changedSource = getArg('changed-files', '');
  const prNumber = parseIntSafe(getArg('pr', process.env.PR_NUMBER ?? '0'), 0);
  const headSha = getArg('sha', process.env.GITHUB_SHA ?? '');
  const outputPath = getArg('out', path.join(process.cwd(), 'data', 'code-factory', `preflight-${headSha || 'unknown'}.json`));

  const changedFiles = readChangedFiles(changedSource);
  const policy = loadRiskPolicy(policyPath);
  const analysis = analyzeRiskTier(changedFiles, policy);
  const requiredChecks = analysis.requiredChecks.filter((check) => (
    check !== 'browser-evidence' || analysis.uiAffecting
  ));
  const evidence = buildPreflightEvidence({
    prNumber,
    headSha,
    analysis: {
      ...analysis,
      requiredChecks,
    },
  });

  const payload = {
    policy_version: policy.version,
    evidence,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));

  console.log(JSON.stringify({
    risk_tier: analysis.riskTier,
    required_checks: requiredChecks,
    ui_affecting: analysis.uiAffecting,
    evidence_path: outputPath,
  }));

  writeGithubOutput('risk_tier', analysis.riskTier);
  writeGithubOutput('required_checks', requiredChecks.join(','));
  writeGithubOutput('ui_affecting', analysis.uiAffecting ? 'true' : 'false');
  writeGithubOutput('evidence_path', outputPath);
}

main();
