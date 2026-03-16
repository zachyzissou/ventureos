import { generateSoulMd, validateCard } from '../schema';
import { nexus } from '../02-nexus';

function extractSection(md: string, header: string, nextHeader: string): string {
  const start = md.indexOf(header);
  if (start === -1) throw new Error(`Missing header: ${header}`);
  const afterStart = md.slice(start + header.length);

  const end = afterStart.indexOf(nextHeader);
  if (end === -1) throw new Error(`Missing next header: ${nextHeader}`);

  return afterStart.slice(0, end);
}

function extractNeverBullets(md: string): string[] {
  const section = extractSection(md, '## Non-Negotiables', '## When to Escalate');

  return section
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

describe('role-cards SOUL.md generator', () => {
  test('generateSoulMd produces key sections and normalizes NEVER rules', () => {
    const card = structuredClone(nexus);

    card.hardBoundaries.hardBans = [
      'never ship secrets',
      'NEVER deploy on friday',
      'Never break laws.',
      'Do not ignore tests!',
      "Don't merge without review.",
    ];
    card.hardBoundaries.rationale = card.hardBoundaries.hardBans.map(() => 'Because.');

    const md = generateSoulMd(validateCard(card));

    expect(md).toContain(`# SOUL.md — ${card.name} (${card.title})`);
    expect(md).toContain('## Identity');
    expect(md).toContain('## Non-Negotiables');

    const bullets = extractNeverBullets(md);
    expect(bullets).toEqual([
      'Never ship secrets.',
      'Never deploy on friday.',
      'Never break laws.',
      'Never ignore tests!',
      'Never merge without review.',
    ]);

    expect(md).toMatch(/^- \*\*task\*\* \(_json_\): /m);
    expect(md).toMatch(/^- \*\*[^:]+:\*\* .+ \(target: .+\)$/m);
  });

  test('generateSoulMd drops empty/whitespace NEVER entries', () => {
    const card = structuredClone(nexus) as any;

    card.hardBoundaries.hardBans = ['', '   ', 'never do this'];
    card.hardBoundaries.rationale = ['', '', ''];

    const md = generateSoulMd(card);
    const bullets = extractNeverBullets(md);

    expect(bullets).toEqual(['Never do this.']);
  });
});
