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
  oracle: [
    // Researching
    p('oracle:research:research', /\bresearch\b|\bresearch:/, ActivityType.ORACLE_RESEARCH),
    p('oracle:research:investigate', /\binvestigat(?:e|ing|ion)\b/, ActivityType.ORACLE_RESEARCH),
    p('oracle:research:synthesis', /multi[- ]domain\s+synthesis|\bsynthesis\b/, ActivityType.ORACLE_RESEARCH),
    p('oracle:research:prediction', /outcome\s+prediction|\bforecast\b|\bpredict\b/, ActivityType.ORACLE_RESEARCH),
    p('oracle:research:literature', /literature\s+review|paper\s+review|\bsurvey\b/, ActivityType.ORACLE_RESEARCH),

    // Analyzing
    p('oracle:analyze:analyz', /\banaly(?:z|s)e\b|\banaly(?:z|s)ing\b/, ActivityType.ORACLE_ANALYZE),
    p('oracle:analyze:evaluate', /\bevaluat(?:e|ing|ion)\b|\bassess\b/, ActivityType.ORACLE_ANALYZE),
    p('oracle:analyze:review', /\breview\b|\bcritique\b/, ActivityType.ORACLE_ANALYZE),

    // Writing
    p('oracle:write:spec', /\bspec\b|\bspecification\b|\bdesign\s+spec\b/, ActivityType.ORACLE_WRITE),
    p('oracle:write:writing', /\bwrite\b|\bwriting\b|\bdraft\b/, ActivityType.ORACLE_WRITE),
    p('oracle:write:doc', /\bdoc\b|\bdocs\b|\bdocument(?:ation)?\b/, ActivityType.ORACLE_WRITE)
  ],

  atlas: [
    // Fixing (checked first so rollback/incident beats generic "release")
    p('atlas:fix:rollback', /\brollback\b|\brevert\b|\bmitigation\b/, ActivityType.ATLAS_FIX),
    p('atlas:fix:incident', /\bincident\b|\boutage\b|\bdegrad(?:ation|ed)\b|\bhotfix\b/, ActivityType.ATLAS_FIX),
    p('atlas:fix:fix', /\bfix\b|\bfixing\b|\brepair\b|\bremediate\b/, ActivityType.ATLAS_FIX),

    // Deploying
    p('atlas:deploy:deploy', /\bdeploy\b|\bdeployment\b|\bship\b|\brelease\b|\blaunch\b/, ActivityType.ATLAS_DEPLOY),
    p('atlas:deploy:infra', /\binfra(?:structure)?\b|\bterraform\b|\bprovision\b/, ActivityType.ATLAS_DEPLOY),
    p('atlas:deploy:cron', /\bcron\b|\bscheduler\b|\brotation\b/, ActivityType.ATLAS_DEPLOY),

    // Monitoring
    p('atlas:monitor:monitor', /\bmonitor\b|\bmonitoring\b|\bstatus\b|\bhealth\s*check\b/, ActivityType.ATLAS_MONITOR),
    p('atlas:monitor:backup-validate', /backup\s+validation|\bvalidate\s+backup\b/, ActivityType.ATLAS_MONITOR),
    p('atlas:monitor:observability', /\bmetrics\b|\blogging\b|\btracing\b|\bobservability\b/, ActivityType.ATLAS_MONITOR)
  ],

  sentinel: [
    // Scanning
    p('sentinel:scan:scan', /\bscan\b|\bscanning\b|\baudit\b|\binspect\b/, ActivityType.SENTINEL_SCAN),
    p('sentinel:scan:threat-model', /threat\s+model(?:ing)?|\battack\s+surface\b/, ActivityType.SENTINEL_SCAN),
    p('sentinel:scan:policy', /\bpolicy\b|\bcompliance\b|\bcontrols\b/, ActivityType.SENTINEL_SCAN),

    // Blocking
    p('sentinel:block:block', /\bblock\b|\bblocking\b|\bdeny\b|\breject\b|\bprevent\b/, ActivityType.SENTINEL_BLOCK),
    p('sentinel:block:quarantine', /\bquarantine\b|\bisolate\b|\bcontain\b/, ActivityType.SENTINEL_BLOCK),

    // Escalating
    p('sentinel:escalate:escalat', /\bescalat(?:e|ing|ion)\b/, ActivityType.SENTINEL_ESCALATE),
    p('sentinel:escalate:alert', /\balert\b|\bwarning\b|\bflag\b|\bcritical\b/, ActivityType.SENTINEL_ESCALATE),
    p('sentinel:escalate:incident', /security\s+incident|\bbreach\b/, ActivityType.SENTINEL_ESCALATE)
  ],

  verifier: [
    // Catching bugs (checked first so "failure" beats generic "test")
    p('verifier:bug:fail', /\bfail(?:ed|ure)?\b|\berror\b|\bflake\b/, ActivityType.VERIFIER_BUG),
    p('verifier:bug:break', /\bbreak(?:ing)?\s+change\b|\bcrash\b/, ActivityType.VERIFIER_BUG),
    p('verifier:bug:bug', /\bbug\b|\bissue\b|\bregression\b/, ActivityType.VERIFIER_BUG),

    // Testing
    p('verifier:test:coverage', /test\s+coverage|\bcoverage\b/, ActivityType.VERIFIER_TEST),
    p('verifier:test:test', /\bunit\s*test\b|\bintegration\s*test\b|\btest\b|\btesting\b/, ActivityType.VERIFIER_TEST),
    p('verifier:test:ci', /\bci\b|\bpipeline\b|\bbuild\s+check\b/, ActivityType.VERIFIER_TEST),

    // Validating
    p('verifier:validate:review', /\bcode\s+review\b|\breview\b|\bapprov(?:e|al)\b/, ActivityType.VERIFIER_VALIDATE),
    p('verifier:validate:validat', /\bvalidat(?:e|ing|ion)\b|\bverify\b|\bverification\b/, ActivityType.VERIFIER_VALIDATE)
  ],

  archivist: [
    // Retrieving (checked first so "search" wins over "doc")
    p('archivist:retrieve:search', /\bsearch\b|\bfind\b|\blookup\b|\bquery\b/, ActivityType.ARCHIVIST_RETRIEVE),
    p('archivist:retrieve:crossref', /cross[- ]reference|\bxref\b/, ActivityType.ARCHIVIST_RETRIEVE),
    p('archivist:retrieve:retrieve', /\bretriev(?:e|ing|al)\b|\bfetch\b/, ActivityType.ARCHIVIST_RETRIEVE),

    // Organizing
    p('archivist:organize:structure', /\bstructure\b|\bclean\s*up\b|\brefile\b|\bsort\b/, ActivityType.ARCHIVIST_ORGANIZE),
    p('archivist:organize:organize', /\borgan(?:i|iz)e\b|\borgan(?:i|iz)ing\b/, ActivityType.ARCHIVIST_ORGANIZE),

    // Documenting
    p('archivist:doc:catalog', /pattern\s+catalog(?:ing)?|\bcatalog\b|\bindex\b/, ActivityType.ARCHIVIST_DOCUMENT),
    p('archivist:doc:record', /\brecord\b|\blog\b|\bchangelog\b/, ActivityType.ARCHIVIST_DOCUMENT),
    p('archivist:doc:document', /\bdocument(?:ation)?\b|\bdoc\b|\bdocs\b/, ActivityType.ARCHIVIST_DOCUMENT)
  ],

  synth: [
    // Coding
    p('synth:code:implement', /\bimplement(?:ation|ing)?\b|\bcode\b|\bcoding\b/, ActivityType.SYNTH_CODE),
    p('synth:code:build', /\bbuild\b|\bcompile\b|\bship\b/, ActivityType.SYNTH_CODE),
    p('synth:code:script', /script\s+creation|\bscript\b|\bdashboard\b/, ActivityType.SYNTH_CODE),

    // Prototyping
    p('synth:proto:prototype', /\bprototype\b|\bpoc\b|\bproof\s+of\s+concept\b/, ActivityType.SYNTH_PROTOTYPE),
    p('synth:proto:experiment', /\bexperiment\b|\bspike\b|\bdraft\b/, ActivityType.SYNTH_PROTOTYPE),

    // Iterating
    p('synth:iterate:iterate', /\biterat(?:e|ing|ion)\b/, ActivityType.SYNTH_ITERATE),
    p('synth:iterate:refactor', /\brefactor\b|\brework\b|\brevise\b|\btune\b/, ActivityType.SYNTH_ITERATE),
    p('synth:iterate:improve', /\bimprov(?:e|ing|ement)\b|\boptimi[sz]e\b/, ActivityType.SYNTH_ITERATE)
  ],

  echo: [
    // Orchestrating
    p('echo:orch:orchestrate', /\borchestrat(?:e|ing|ion)\b/, ActivityType.ECHO_ORCHESTRATE),
    p('echo:orch:coordinate', /\bcoordinat(?:e|ing|ion)\b|mission\s+coordination/, ActivityType.ECHO_ORCHESTRATE),
    p('echo:orch:dispatch', /\bdispatch\b|agent\s+dispatch|\bassign\b/, ActivityType.ECHO_ORCHESTRATE),

    // Deciding
    p('echo:decide:strategy', /\bstrateg(?:y|ic)\b|\bpriorit(?:ize|ization)\b/, ActivityType.ECHO_DECIDE),
    p('echo:decide:plan', /\bplan\b|\bplanning\b|\broadmap\b|\bdecision\b/, ActivityType.ECHO_DECIDE),

    // Escalating
    p('echo:escalate:escalat', /\bescalat(?:e|ing|ion)\b/, ActivityType.ECHO_ESCALATE),
    p('echo:escalate:urgent', /\burgent\b|\bcritical\b|\bhigh\s+priority\b/, ActivityType.ECHO_ESCALATE),
    p('echo:escalate:alert', /\balert\b|\bincident\b|\bblocker\b/, ActivityType.ECHO_ESCALATE)
  ],

  nexus: [
    // Coordinating
    p('nexus:coord:coordinate', /\bcoordinat(?:e|ing|ion)\b|\bmanage\b|\boversee\b/, ActivityType.NEXUS_COORDINATE),
    p('nexus:coord:control', /mission\s+control|\btriage\b|\bdispatch\b/, ActivityType.NEXUS_COORDINATE),

    // Monitoring
    p('nexus:monitor:monitor', /\bmonitor\b|\bheartbeat\b|\bcheck\b/, ActivityType.NEXUS_MONITOR),
    p('nexus:monitor:status', /\bstatus\b|\boverview\b|\bdashboard\b/, ActivityType.NEXUS_MONITOR),

    // Alerting
    p('nexus:alert:alert', /\balert\b|\bwarn\b|\bwarning\b/, ActivityType.NEXUS_ALERT),
    p('nexus:alert:error', /\berror\b|\bfailure\b|\bdegrad(?:ation|ed)\b/, ActivityType.NEXUS_ALERT),
    p('nexus:alert:overload', /\boverload(?:ed)?\b|\bstress\b/, ActivityType.NEXUS_ALERT)
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
