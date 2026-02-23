import { generateSoulMd, validateCard } from "../schema";
import { nexus } from "../02-nexus";

function extractSection(md: string, header: string, nextHeader: string): string {
  const start = md.indexOf(header);
  if (start === -1) throw new Error(`Missing header: ${header}`);
  const afterStart = md.slice(start + header.length);

  const end = afterStart.indexOf(nextHeader);
  if (end === -1) throw new Error(`Missing next header: ${nextHeader}`);

  return afterStart.slice(0, end);
}

function extractNeverBullets(md: string): string[] {
  const section = extractSection(
    md,
    "## NEVER (Void Interdicts — Non‑Negotiable)",
    "## When to Escalate (Psionic Cascade)"
  );

  return section
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2));
}

describe("role-cards SOUL.md generator", () => {
  test("generateSoulMd produces key sections and normalizes NEVER rules", () => {
    const card = structuredClone(nexus);

    card.voidInterdicts.hardBans = [
      "never ship secrets",
      "NEVER deploy on friday",
      "Never break laws.",
      "Do not ignore tests!",
      "Don't merge without review.",
    ];
    card.voidInterdicts.rationale = card.voidInterdicts.hardBans.map(() => "Because.");

    const md = generateSoulMd(validateCard(card));

    expect(md).toContain(`# SOUL.md — ${card.name} (${card.title})`);
    expect(md).toContain("## Identity");
    expect(md).toContain("## NEVER (Void Interdicts — Non‑Negotiable)");

    const bullets = extractNeverBullets(md);
    expect(bullets).toEqual([
      "Never ship secrets.",
      "Never deploy on friday.",
      "Never break laws.",
      "Never ignore tests!",
      "Never merge without review.",
    ]);

    // Spot-check other formatter helpers are being exercised.
    expect(md).toMatch(/^- \*\*task\*\* \(_json_\): /m);
    expect(md).toMatch(/^- \*\*[^:]+:\*\* .+ \(target: .+\)$/m);
  });

  test("generateSoulMd drops empty/whitespace NEVER entries", () => {
    const card = structuredClone(nexus) as any;

    card.voidInterdicts.hardBans = ["", "   ", "never do this"];
    card.voidInterdicts.rationale = ["", "", ""];

    const md = generateSoulMd(card);
    const bullets = extractNeverBullets(md);

    expect(bullets).toEqual(["Never do this."]);
  });
});
