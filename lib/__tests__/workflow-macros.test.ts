import {
  PREBUILT_WORKFLOWS,
  WorkflowMacroSystem,
  WorkflowRecorder,
  createDefaultShortcutLibrary,
  type CommandDefinition,
  type WorkflowDefinition,
  type WorkflowProgressEvent,
} from '../workflow-macros';

function makeNow(startIso = '2026-02-15T12:00:00.000Z') {
  let t = Date.parse(startIso);
  return () => {
    const d = new Date(t);
    t += 1000;
    return d;
  };
}

describe('Workflow Macro System (P2 #32)', () => {
  it('registers and lists the 5 prebuilt workflows', () => {
    const system = new WorkflowMacroSystem({
      now: makeNow(),
      sleep: async () => undefined,
    });

    const names = system.listWorkflows().map((w) => w.name);
    expect(PREBUILT_WORKFLOWS).toHaveLength(5);
    expect(names).toEqual([
      'content-batch',
      'deploy-check',
      'incident-response',
      'newco-sprint',
      'weekly-review',
    ]);
  });

  it('executes newco sprint end-to-end with progress updates', async () => {
    const events: WorkflowProgressEvent[] = [];
    const system = new WorkflowMacroSystem({
      now: makeNow(),
      sleep: async () => undefined,
    });

    const result = await system.execute('newco-sprint', {
      onProgress: (event) => events.push(event),
    });

    expect(result.status).toBe('succeeded');
    expect(result.steps).toHaveLength(4);
    expect(result.state.timeline).toBeDefined();
    expect(Array.isArray(result.state.timeline)).toBe(true);
    expect(result.progress.percent).toBe(100);
    expect(events.some((e) => e.type === 'run-started')).toBe(true);
    expect(events.some((e) => e.type === 'run-completed')).toBe(true);
  });

  it('runs content batch with batch processing and item-level progress', async () => {
    const events: WorkflowProgressEvent[] = [];
    const system = new WorkflowMacroSystem({
      now: makeNow(),
      sleep: async () => undefined,
    });

    const result = await system.execute('content-batch', {
      inputs: {
        contentPieces: [
          { title: 'A', channel: 'blog' },
          { title: 'B', channel: 'blog' },
          { title: 'C', channel: 'newsletter' },
          { title: 'D', channel: 'x' },
          { title: 'E', channel: 'linkedin' },
        ],
      },
      onProgress: (event) => events.push(event),
    });

    expect(result.status).toBe('succeeded');

    const batchStep = result.steps.find((s) => s.stepId === 'produce-content-batch');
    expect(batchStep).toBeDefined();
    expect(batchStep?.type).toBe('batch');
    expect(batchStep?.batch?.totalItems).toBe(5);
    expect(batchStep?.batch?.succeeded).toBe(5);
    expect(batchStep?.batch?.failed).toBe(0);

    const batchEvents = events.filter((e) => e.type === 'batch-item-completed');
    expect(batchEvents.length).toBeGreaterThanOrEqual(5);
  });

  it('retries unstable commands and eventually succeeds', async () => {
    const now = makeNow();
    const library = createDefaultShortcutLibrary({ now });

    let attempts = 0;
    const unstable: CommandDefinition = {
      name: 'custom.unstable',
      idempotent: false,
      async handler() {
        attempts += 1;
        if (attempts < 2) throw new Error('transient failure');
        return { output: { ok: true } };
      },
    };
    library.registerCommand(unstable);

    const workflow: WorkflowDefinition = {
      version: 1,
      name: 'retry-workflow',
      description: 'Tests retry semantics',
      steps: [
        {
          id: 'run-unstable',
          commands: [{ command: 'custom.unstable', retry: { maxAttempts: 3, backoffMs: 0 } }],
        },
      ],
    };

    const retries: WorkflowProgressEvent[] = [];
    const system = new WorkflowMacroSystem({
      now,
      sleep: async () => undefined,
      includePrebuiltWorkflows: false,
      commandLibrary: library,
      workflows: [workflow],
    });

    const result = await system.execute('retry-workflow', {
      onProgress: (event) => {
        if (event.type === 'retry') retries.push(event);
      },
    });

    expect(result.status).toBe('succeeded');
    expect(attempts).toBe(2);
    expect(retries.length).toBeGreaterThanOrEqual(1);
    expect(result.steps[0].commands[0].attempts).toBe(2);
  });

  it('rolls back prior successful steps when a later step fails', async () => {
    const now = makeNow();
    const library = createDefaultShortcutLibrary({ now });

    library.registerCommand({
      name: 'custom.create-record',
      idempotent: false,
      handler(_params, ctx) {
        const records = Array.isArray(ctx.state.records) ? (ctx.state.records as string[]) : [];
        records.push('created');
        return { stateUpdates: { records } };
      },
      rollback(_params, ctx) {
        const records = Array.isArray(ctx.state.records) ? (ctx.state.records as string[]) : [];
        records.push('rolled-back');
        ctx.state.records = records;
      },
    });

    library.registerCommand({
      name: 'custom.fail',
      idempotent: false,
      handler() {
        throw new Error('boom');
      },
    });

    const workflow: WorkflowDefinition = {
      version: 1,
      name: 'rollback-workflow',
      description: 'Tests rollback behavior',
      rollbackOnFailure: true,
      steps: [
        {
          id: 'create',
          commands: [{ command: 'custom.create-record' }],
        },
        {
          id: 'explode',
          onError: 'rollback',
          commands: [{ command: 'custom.fail' }],
        },
      ],
    };

    const system = new WorkflowMacroSystem({
      now,
      sleep: async () => undefined,
      includePrebuiltWorkflows: false,
      commandLibrary: library,
      workflows: [workflow],
    });

    const result = await system.execute('rollback-workflow');

    expect(result.status).toBe('failed');
    expect(result.rollback.attempted).toBe(true);
    expect(result.rollback.succeeded).toBe(true);
    expect(result.state.records).toEqual(['created', 'rolled-back']);
  });

  it('supports shortcut aliases in workflow steps', async () => {
    const system = new WorkflowMacroSystem({
      now: makeNow(),
      sleep: async () => undefined,
      includePrebuiltWorkflows: false,
      workflows: [
        {
          version: 1,
          name: 'shortcut-test',
          description: 'Uses deploy shortcut',
          steps: [
            {
              id: 'go-live',
              commands: [{ command: 'deploy.go' }],
            },
          ],
        },
      ],
    });

    const result = await system.execute('shortcut-test');
    expect(result.status).toBe('succeeded');
    expect(result.steps[0].commands[0].resolvedCommand).toBe('deploy.release');
  });

  it('supports dry run mode without side effects', async () => {
    const system = new WorkflowMacroSystem({
      now: makeNow(),
      sleep: async () => undefined,
    });

    const result = await system.execute('weekly-review', { dryRun: true });
    expect(result.status).toBe('dry-run');
    expect(result.steps.every((s) => s.status === 'skipped')).toBe(true);
    expect(result.state.timeline).toBeUndefined();
  });

  it('records multi-step workflows and can derive a workflow from a run', async () => {
    const recorder = new WorkflowRecorder();

    recorder.start({
      name: 'recorded.workflow',
      description: 'Recorded workflow',
    });

    recorder.recordCommand('step-1', { command: 'content.create', params: { title: 'Hello' } });
    recorder.recordCommand('step-2', { command: 'content.go-live', params: { title: 'Hello' } });

    const recorded = recorder.stop();

    expect(recorded.name).toBe('recorded.workflow');
    expect(recorded.steps).toHaveLength(2);
    expect(recorded.steps[0].id).toBe('step-1');

    const system = new WorkflowMacroSystem({
      now: makeNow(),
      sleep: async () => undefined,
      includePrebuiltWorkflows: false,
      workflows: [recorded],
    });

    const run = await system.execute('recorded.workflow');
    const derived = WorkflowRecorder.fromRun(run, { name: 'derived.workflow' });

    expect(derived.name).toBe('derived.workflow');
    expect(derived.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('supports conditional step execution', async () => {
    const system = new WorkflowMacroSystem({
      now: makeNow(),
      sleep: async () => undefined,
      includePrebuiltWorkflows: false,
      workflows: [
        {
          version: 1,
          name: 'conditional-workflow',
          description: 'Conditional steps',
          steps: [
            {
              id: 'always',
              commands: [{ command: 'review.collect-metrics' }],
            },
            {
              id: 'optional',
              condition: '{{inputs.runOptional}}',
              commands: [{ command: 'review.capture-highlights' }],
            },
          ],
        },
      ],
    });

    const result = await system.execute('conditional-workflow', {
      inputs: { runOptional: false },
    });

    expect(result.status).toBe('succeeded');
    const optional = result.steps.find((s) => s.stepId === 'optional');
    expect(optional?.status).toBe('skipped');
  });
});
