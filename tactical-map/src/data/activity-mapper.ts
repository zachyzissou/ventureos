import type { AgentId } from '@/config';

/**
 * ActivityType
 *
 * Intentionally verbose enum (agent-scoped) so:
 * - we can drive per-agent visuals without extra lookups
 * - test fixtures are unambiguous
 */
export enum ActivityType {
  IDLE = 'IDLE',

  // Oracle
  ORACLE_RESEARCH = 'ORACLE_RESEARCH',
  ORACLE_ANALYZE = 'ORACLE_ANALYZE',
  ORACLE_WRITE = 'ORACLE_WRITE',

  // Atlas
  ATLAS_DEPLOY = 'ATLAS_DEPLOY',
  ATLAS_MONITOR = 'ATLAS_MONITOR',
  ATLAS_FIX = 'ATLAS_FIX',

  // Sentinel
  SENTINEL_SCAN = 'SENTINEL_SCAN',
  SENTINEL_BLOCK = 'SENTINEL_BLOCK',
  SENTINEL_ESCALATE = 'SENTINEL_ESCALATE',

  // Verifier
  VERIFIER_TEST = 'VERIFIER_TEST',
  VERIFIER_VALIDATE = 'VERIFIER_VALIDATE',
  VERIFIER_BUG = 'VERIFIER_BUG',

  // Archivist
  ARCHIVIST_DOCUMENT = 'ARCHIVIST_DOCUMENT',
  ARCHIVIST_ORGANIZE = 'ARCHIVIST_ORGANIZE',
  ARCHIVIST_RETRIEVE = 'ARCHIVIST_RETRIEVE',

  // Synth
  SYNTH_CODE = 'SYNTH_CODE',
  SYNTH_PROTOTYPE = 'SYNTH_PROTOTYPE',
  SYNTH_ITERATE = 'SYNTH_ITERATE',

  // Echo
  ECHO_ORCHESTRATE = 'ECHO_ORCHESTRATE',
  ECHO_DECIDE = 'ECHO_DECIDE',
  ECHO_ESCALATE = 'ECHO_ESCALATE',

  // Nexus
  NEXUS_COORDINATE = 'NEXUS_COORDINATE',
  NEXUS_MONITOR = 'NEXUS_MONITOR',
  NEXUS_ALERT = 'NEXUS_ALERT'
}

export type ActivityPattern = {
  /** Human label for docs/debugging. */
  name: string;
  /** Pre-compiled regex. Must be simple and linear-time. */
  re: RegExp;
  /** The activity assigned if matched. */
  activity: ActivityType;
};

// SECURITY: Cap input length before regex matching (P2-3, ReDoS hardening).
export const MAX_SESSION_LABEL_CHARS = 200 as const;

export function normalizeSessionLabel(sessionLabel: string): string {
  const raw = String(sessionLabel ?? '');
  // Trim & collapse whitespace; cap length.
  const capped = raw.slice(0, MAX_SESSION_LABEL_CHARS);
  return capped.replace(/\s+/g, ' ').trim().toLowerCase();
}

function p(name: string, re: RegExp, activity: ActivityType): ActivityPattern {
  return { name, re, activity };
}

/**
 * Pattern catalog.
 *
 * NOTE:
 * - Keep regexes simple (no catastrophic backtracking).
 * - Prefer word-boundaries and short alternations.
 * - Order matters: earlier patterns win.
 */
export const ACTIVITY_PATTERNS: Record<AgentId, ActivityPattern[]> = {
  venture_research: [
    // Researching
    p('venture_research:research:research', /\bresearch\b|\bresearch:/, ActivityType.ORACLE_RESEARCH),
    p('venture_research:research:investigate', /\binvestigat(?:e|ing|ion)\b/, ActivityType.ORACLE_RESEARCH),
    p('venture_research:research:synthesis', /multi[- ]domain\s+synthesis|\bsynthesis\b/, ActivityType.ORACLE_RESEARCH),
    p('venture_research:research:prediction', /outcome\s+prediction|\bforecast\b|\bpredict\b/, ActivityType.ORACLE_RESEARCH),
    p('venture_research:research:literature', /literature\s+review|paper\s+review|\bsurvey\b/, ActivityType.ORACLE_RESEARCH),

    // Analyzing
    p('venture_research:analyze:analyz', /\banaly(?:z|s)e\b|\banaly(?:z|s)ing\b/, ActivityType.ORACLE_ANALYZE),
    p('venture_research:analyze:evaluate', /\bevaluat(?:e|ing|ion)\b|\bassess\b/, ActivityType.ORACLE_ANALYZE),
    p('venture_research:analyze:review', /\breview\b|\bcritique\b/, ActivityType.ORACLE_ANALYZE),

    // Writing
    p('venture_research:write:spec', /\bspec\b|\bspecification\b|\bdesign\s+spec\b/, ActivityType.ORACLE_WRITE),
    p('venture_research:write:writing', /\bwrite\b|\bwriting\b|\bdraft\b/, ActivityType.ORACLE_WRITE),
    p('venture_research:write:doc', /\bdoc\b|\bdocs\b|\bdocument(?:ation)?\b/, ActivityType.ORACLE_WRITE)
  ],

  venture_infrastructure: [
    // Fixing (checked first so rollback/incident beats generic "release")
    p('venture_infrastructure:fix:rollback', /\brollback\b|\brevert\b|\bmitigation\b/, ActivityType.ATLAS_FIX),
    p('venture_infrastructure:fix:incident', /\bincident\b|\boutage\b|\bdegrad(?:ation|ed)\b|\bhotfix\b/, ActivityType.ATLAS_FIX),
    p('venture_infrastructure:fix:fix', /\bfix\b|\bfixing\b|\brepair\b|\bremediate\b/, ActivityType.ATLAS_FIX),

    // Deploying
    p('venture_infrastructure:deploy:deploy', /\bdeploy\b|\bdeployment\b|\bship\b|\brelease\b|\blaunch\b/, ActivityType.ATLAS_DEPLOY),
    p('venture_infrastructure:deploy:infra', /\binfra(?:structure)?\b|\bterraform\b|\bprovision\b/, ActivityType.ATLAS_DEPLOY),
    p('venture_infrastructure:deploy:cron', /\bcron\b|\bscheduler\b|\brotation\b/, ActivityType.ATLAS_DEPLOY),

    // Monitoring
    p('venture_infrastructure:monitor:monitor', /\bmonitor\b|\bmonitoring\b|\bstatus\b|\bhealth\s*check\b/, ActivityType.ATLAS_MONITOR),
    p('venture_infrastructure:monitor:backup-validate', /backup\s+validation|\bvalidate\s+backup\b/, ActivityType.ATLAS_MONITOR),
    p('venture_infrastructure:monitor:observability', /\bmetrics\b|\blogging\b|\btracing\b|\bobservability\b/, ActivityType.ATLAS_MONITOR)
  ],

  venture_security: [
    // Scanning
    p('venture_security:scan:scan', /\bscan\b|\bscanning\b|\baudit\b|\binspect\b/, ActivityType.SENTINEL_SCAN),
    p('venture_security:scan:threat-model', /threat\s+model(?:ing)?|\battack\s+surface\b/, ActivityType.SENTINEL_SCAN),
    p('venture_security:scan:policy', /\bpolicy\b|\bcompliance\b|\bcontrols\b/, ActivityType.SENTINEL_SCAN),

    // Blocking
    p('venture_security:block:block', /\bblock\b|\bblocking\b|\bdeny\b|\breject\b|\bprevent\b/, ActivityType.SENTINEL_BLOCK),
    p('venture_security:block:quarantine', /\bquarantine\b|\bisolate\b|\bcontain\b/, ActivityType.SENTINEL_BLOCK),

    // Escalating
    p('venture_security:escalate:escalat', /\bescalat(?:e|ing|ion)\b/, ActivityType.SENTINEL_ESCALATE),
    p('venture_security:escalate:alert', /\balert\b|\bwarning\b|\bflag\b|\bcritical\b/, ActivityType.SENTINEL_ESCALATE),
    p('venture_security:escalate:incident', /security\s+incident|\bbreach\b/, ActivityType.SENTINEL_ESCALATE)
  ],

  venture_evidence: [
    // Catching bugs (checked first so "failure" beats generic "test")
    p('venture_evidence:bug:fail', /\bfail(?:ed|ure)?\b|\berror\b|\bflake\b/, ActivityType.VERIFIER_BUG),
    p('venture_evidence:bug:break', /\bbreak(?:ing)?\s+change\b|\bcrash\b/, ActivityType.VERIFIER_BUG),
    p('venture_evidence:bug:bug', /\bbug\b|\bissue\b|\bregression\b/, ActivityType.VERIFIER_BUG),

    // Testing
    p('venture_evidence:test:coverage', /test\s+coverage|\bcoverage\b/, ActivityType.VERIFIER_TEST),
    p('venture_evidence:test:test', /\bunit\s*test\b|\bintegration\s*test\b|\btest\b|\btesting\b/, ActivityType.VERIFIER_TEST),
    p('venture_evidence:test:ci', /\bci\b|\bpipeline\b|\bbuild\s+check\b/, ActivityType.VERIFIER_TEST),

    // Validating
    p('venture_evidence:validate:review', /\bcode\s+review\b|\breview\b|\bapprov(?:e|al)\b/, ActivityType.VERIFIER_VALIDATE),
    p('venture_evidence:validate:validat', /\bvalidat(?:e|ing|ion)\b|\bverify\b|\bverification\b/, ActivityType.VERIFIER_VALIDATE)
  ],

  venture_memory: [
    // Retrieving (checked first so "search" wins over "doc")
    p('venture_memory:retrieve:search', /\bsearch\b|\bfind\b|\blookup\b|\bquery\b/, ActivityType.ARCHIVIST_RETRIEVE),
    p('venture_memory:retrieve:crossref', /cross[- ]reference|\bxref\b/, ActivityType.ARCHIVIST_RETRIEVE),
    p('venture_memory:retrieve:retrieve', /\bretriev(?:e|ing|al)\b|\bfetch\b/, ActivityType.ARCHIVIST_RETRIEVE),

    // Organizing
    p('venture_memory:organize:structure', /\bstructure\b|\bclean\s*up\b|\brefile\b|\bsort\b/, ActivityType.ARCHIVIST_ORGANIZE),
    p('venture_memory:organize:organize', /\borgan(?:i|iz)e\b|\borgan(?:i|iz)ing\b/, ActivityType.ARCHIVIST_ORGANIZE),

    // Documenting
    p('venture_memory:doc:catalog', /pattern\s+catalog(?:ing)?|\bcatalog\b|\bindex\b/, ActivityType.ARCHIVIST_DOCUMENT),
    p('venture_memory:doc:record', /\brecord\b|\blog\b|\bchangelog\b/, ActivityType.ARCHIVIST_DOCUMENT),
    p('venture_memory:doc:document', /\bdocument(?:ation)?\b|\bdoc\b|\bdocs\b/, ActivityType.ARCHIVIST_DOCUMENT)
  ],

  venture_delivery: [
    // Coding
    p('venture_delivery:code:implement', /\bimplement(?:ation|ing)?\b|\bcode\b|\bcoding\b/, ActivityType.SYNTH_CODE),
    p('venture_delivery:code:build', /\bbuild\b|\bcompile\b|\bship\b/, ActivityType.SYNTH_CODE),
    p('venture_delivery:code:script', /script\s+creation|\bscript\b|\bdashboard\b/, ActivityType.SYNTH_CODE),

    // Prototyping
    p('venture_delivery:proto:prototype', /\bprototype\b|\bpoc\b|\bproof\s+of\s+concept\b/, ActivityType.SYNTH_PROTOTYPE),
    p('venture_delivery:proto:experiment', /\bexperiment\b|\bspike\b|\bdraft\b/, ActivityType.SYNTH_PROTOTYPE),

    // Iterating
    p('venture_delivery:iterate:iterate', /\biterat(?:e|ing|ion)\b/, ActivityType.SYNTH_ITERATE),
    p('venture_delivery:iterate:refactor', /\brefactor\b|\brework\b|\brevise\b|\btune\b/, ActivityType.SYNTH_ITERATE),
    p('venture_delivery:iterate:improve', /\bimprov(?:e|ing|ement)\b|\boptimi[sz]e\b/, ActivityType.SYNTH_ITERATE)
  ],

  venture_strategy: [
    // Orchestrating
    p('venture_strategy:orch:orchestrate', /\borchestrat(?:e|ing|ion)\b/, ActivityType.ECHO_ORCHESTRATE),
    p('venture_strategy:orch:coordinate', /\bcoordinat(?:e|ing|ion)\b|mission\s+coordination/, ActivityType.ECHO_ORCHESTRATE),
    p('venture_strategy:orch:dispatch', /\bdispatch\b|agent\s+dispatch|\bassign\b/, ActivityType.ECHO_ORCHESTRATE),

    // Deciding
    p('venture_strategy:decide:strategy', /\bstrateg(?:y|ic)\b|\bpriorit(?:ize|ization)\b/, ActivityType.ECHO_DECIDE),
    p('venture_strategy:decide:plan', /\bplan\b|\bplanning\b|\broadmap\b|\bdecision\b/, ActivityType.ECHO_DECIDE),

    // Escalating
    p('venture_strategy:escalate:escalat', /\bescalat(?:e|ing|ion)\b/, ActivityType.ECHO_ESCALATE),
    p('venture_strategy:escalate:urgent', /\burgent\b|\bcritical\b|\bhigh\s+priority\b/, ActivityType.ECHO_ESCALATE),
    p('venture_strategy:escalate:alert', /\balert\b|\bincident\b|\bblocker\b/, ActivityType.ECHO_ESCALATE)
  ],

  venture_control: [
    // Coordinating
    p('venture_control:coord:coordinate', /\bcoordinat(?:e|ing|ion)\b|\bmanage\b|\boversee\b/, ActivityType.NEXUS_COORDINATE),
    p('venture_control:coord:control', /mission\s+control|\btriage\b|\bdispatch\b/, ActivityType.NEXUS_COORDINATE),

    // Monitoring
    p('venture_control:monitor:monitor', /\bmonitor\b|\bheartbeat\b|\bcheck\b/, ActivityType.NEXUS_MONITOR),
    p('venture_control:monitor:status', /\bstatus\b|\boverview\b|\bdashboard\b/, ActivityType.NEXUS_MONITOR),

    // Alerting
    p('venture_control:alert:alert', /\balert\b|\bwarn\b|\bwarning\b/, ActivityType.NEXUS_ALERT),
    p('venture_control:alert:error', /\berror\b|\bfailure\b|\bdegrad(?:ation|ed)\b/, ActivityType.NEXUS_ALERT),
    p('venture_control:alert:overload', /\boverload(?:ed)?\b|\bstress\b/, ActivityType.NEXUS_ALERT)
  ]
};

export function classifyActivity(sessionLabel: string, agentId: string): ActivityType {
  const id = agentId as AgentId;
  const patterns = (ACTIVITY_PATTERNS as Record<string, ActivityPattern[]>)[id];
  if (!patterns) return ActivityType.IDLE;

  const label = normalizeSessionLabel(sessionLabel);
  if (!label) return ActivityType.IDLE;

  for (const pat of patterns) {
    if (pat.re.test(label)) return pat.activity;
  }

  return ActivityType.IDLE;
}

export const __test = { p };
