import type { ShortcutCommandLibrary, WorkflowDefinition } from './workflow-macros';

// ============================================================================
// Prebuilt Workflow Definitions (DSL)
// ============================================================================

export const PREBUILT_WORKFLOWS: WorkflowDefinition[] = [
  {
    version: 1,
    name: 'newco-sprint',
    description: 'Research + validate + build MVP + test in one command.',
    tags: ['newco', 'sprint', 'build'],
    rollbackOnFailure: true,
    steps: [
      {
        id: 'research',
        description: 'Market and customer research.',
        mode: 'parallel',
        commands: [
          { command: 'research.market-scan', retry: { maxAttempts: 2, backoffMs: 25 } },
          { command: 'research.customer-interviews', retry: { maxAttempts: 2, backoffMs: 25 } },
        ],
      },
      {
        id: 'validate',
        description: 'Validate problem/solution fit.',
        commands: [{ command: 'validate.problem-solution-fit', retry: { maxAttempts: 2, backoffMs: 25 } }],
      },
      {
        id: 'build-mvp',
        description: 'Build MVP scaffold and prototype.',
        commands: [
          { command: 'build.mvp-scaffold' },
          { command: 'build.prototype', retry: { maxAttempts: 2, backoffMs: 25 } },
        ],
      },
      {
        id: 'test-mvp',
        description: 'Run lightweight user testing.',
        commands: [{ command: 'test.user-testing' }],
      },
    ],
  },
  {
    version: 1,
    name: 'content-batch',
    description: 'Write + edit + publish + promote a batch of content pieces.',
    tags: ['content', 'batch'],
    rollbackOnFailure: true,
    defaults: {
      contentPieces: [
        { title: 'Piece 1', channel: 'blog' },
        { title: 'Piece 2', channel: 'blog' },
        { title: 'Piece 3', channel: 'newsletter' },
        { title: 'Piece 4', channel: 'x' },
        { title: 'Piece 5', channel: 'linkedin' },
      ],
    },
    steps: [
      {
        id: 'content-plan',
        description: 'Build topical and channel plan.',
        commands: [{ command: 'content.plan-calendar' }],
      },
      {
        id: 'produce-content-batch',
        type: 'batch',
        itemsPath: 'contentPieces',
        concurrency: 2,
        continueOnItemFailure: true,
        commands: [
          {
            command: 'content.write',
            params: {
              title: '{{item.title}}',
              channel: '{{item.channel}}',
            },
          },
          {
            command: 'content.edit',
            params: {
              title: '{{item.title}}',
            },
          },
          {
            command: 'content.publish',
            params: {
              title: '{{item.title}}',
              channel: '{{item.channel}}',
            },
          },
          {
            command: 'content.promote',
            params: {
              title: '{{item.title}}',
              channel: '{{item.channel}}',
            },
          },
        ],
      },
    ],
  },
  {
    version: 1,
    name: 'deploy-check',
    description: 'Build + test + security scan + deploy + verify.',
    tags: ['deploy', 'ops', 'release'],
    rollbackOnFailure: true,
    steps: [
      {
        id: 'build',
        commands: [{ command: 'deploy.build' }],
      },
      {
        id: 'test',
        commands: [{ command: 'deploy.test', retry: { maxAttempts: 2, backoffMs: 50 } }],
      },
      {
        id: 'security-scan',
        commands: [{ command: 'deploy.security-scan', retry: { maxAttempts: 2, backoffMs: 50 } }],
      },
      {
        id: 'deploy',
        onError: 'rollback',
        commands: [
          {
            command: 'deploy.release',
            rollback: {
              command: 'deploy.rollback',
            },
          },
        ],
      },
      {
        id: 'verify',
        commands: [{ command: 'deploy.verify' }],
      },
    ],
  },
  {
    version: 1,
    name: 'weekly-review',
    description: 'Metrics + highlights + blockers + next-week plan.',
    tags: ['review', 'planning'],
    rollbackOnFailure: false,
    steps: [
      {
        id: 'collect-metrics',
        commands: [{ command: 'review.collect-metrics' }],
      },
      {
        id: 'capture-highlights',
        commands: [{ command: 'review.capture-highlights' }],
      },
      {
        id: 'identify-blockers',
        commands: [{ command: 'review.identify-blockers' }],
      },
      {
        id: 'plan-next-week',
        commands: [{ command: 'review.plan-next-week' }],
      },
    ],
  },
  {
    version: 1,
    name: 'incident-response',
    description: 'Detect + triage + fix + postmortem with rollback safety.',
    tags: ['incident', 'ops', 'response'],
    rollbackOnFailure: true,
    steps: [
      {
        id: 'detect',
        commands: [{ command: 'incident.detect' }],
      },
      {
        id: 'triage',
        commands: [{ command: 'incident.triage' }],
      },
      {
        id: 'fix',
        onError: 'rollback',
        commands: [
          {
            command: 'incident.fix',
            retry: { maxAttempts: 3, backoffMs: 100 },
            rollback: { command: 'incident.revert-fix' },
          },
        ],
      },
      {
        id: 'postmortem',
        commands: [{ command: 'incident.postmortem' }],
      },
    ],
  },
];

// ============================================================================
// Default Shortcut Command Registration
// ============================================================================

export function registerDefaultCommandsAndShortcuts(
  library: Pick<ShortcutCommandLibrary, 'registerCommand' | 'registerShortcut'>,
  now: () => Date,
): void {
  const registerActivityCommand = (name: string, options: { idempotent?: boolean } = {}) => {
    library.registerCommand({
      name,
      description: `${name} command`,
      idempotent: options.idempotent ?? true,
      async handler(params, ctx) {
        if (params.forceFail === true || params.fail === true) {
          throw new Error(`${name} forced failure`);
        }

        const timeline = Array.isArray(ctx.state.timeline)
          ? (ctx.state.timeline as Array<Record<string, unknown>>)
          : [];

        const event = {
          command: name,
          stepId: ctx.stepId,
          attempt: ctx.attempt,
          item: ctx.item,
          params,
          timestamp: now().toISOString(),
        };

        timeline.push(event);

        return {
          output: event,
          stateUpdates: {
            timeline,
            lastCommand: name,
            lastStepId: ctx.stepId,
          },
        };
      },
      async rollback(params, ctx) {
        const timeline = Array.isArray(ctx.state.timeline)
          ? (ctx.state.timeline as Array<Record<string, unknown>>)
          : [];

        timeline.push({
          command: `${name}:rollback`,
          stepId: ctx.stepId,
          params,
          timestamp: now().toISOString(),
        });

        ctx.state.timeline = timeline;
      },
    });
  };

  [
    // NewCo sprint commands
    'research.market-scan',
    'research.customer-interviews',
    'validate.problem-solution-fit',
    'build.mvp-scaffold',
    'build.prototype',
    'test.user-testing',

    // Content batch commands
    'content.plan-calendar',
    'content.write',
    'content.edit',
    'content.publish',
    'content.promote',

    // Deploy commands
    'deploy.build',
    'deploy.test',
    'deploy.security-scan',
    'deploy.release',
    'deploy.verify',
    'deploy.rollback',

    // Weekly review commands
    'review.collect-metrics',
    'review.capture-highlights',
    'review.identify-blockers',
    'review.plan-next-week',

    // Incident commands
    'incident.detect',
    'incident.triage',
    'incident.fix',
    'incident.revert-fix',
    'incident.postmortem',
  ].forEach((commandName) => registerActivityCommand(commandName));

  library.registerShortcut('newco.research', 'research.market-scan');
  library.registerShortcut('newco.interview', 'research.customer-interviews');
  library.registerShortcut('content.create', 'content.write');
  library.registerShortcut('content.go-live', 'content.publish');
  library.registerShortcut('deploy.go', 'deploy.release');
  library.registerShortcut('incident.mitigate', 'incident.fix');
}
