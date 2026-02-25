import fs from 'node:fs/promises'
import path from 'node:path'

import * as core from '@hcengineering/core'
import * as rank from '@hcengineering/rank'
import * as tracker from '@hcengineering/tracker'

import { connectHuly } from '../src/huly-client.mjs'

const PROJECT_IDENTIFIER = process.env.HULY_PROJECT_IDENTIFIER
if (!PROJECT_IDENTIFIER) {
  console.error('Missing HULY_PROJECT_IDENTIFIER')
  process.exit(2)
}

function priorityFromText (s) {
  const t = (s || '').toLowerCase()
  if (t.includes('p0')) return tracker.IssuePriority.Urgent
  if (t.includes('p1')) return tracker.IssuePriority.High
  if (t.includes('p2')) return tracker.IssuePriority.Normal
  if (t.includes('p3')) return tracker.IssuePriority.Low
  return tracker.IssuePriority.Normal
}

async function ensureMilestone (client, projectId, label) {
  const existing = await client.findOne(tracker.class.Milestone, { space: projectId, label })
  if (existing) return existing

  const id = core.generateId()
  await client.createDoc(
    tracker.class.Milestone,
    projectId,
    {
      label,
      status: tracker.MilestoneStatus.InProgress,
      targetDate: Date.now() + 1000 * 60 * 60 * 24 * 30,
      comments: 0
    },
    id
  )
  const created = await client.findOne(tracker.class.Milestone, { _id: id })
  if (!created) throw new Error('Failed to create milestone')
  return created
}

async function createOrUpdateIssue (client, project, title, body, priority, milestoneId) {
  const existing = await client.findOne(tracker.class.Issue, { space: project._id, title })

  if (existing) {
    const description = body
      ? await client.uploadMarkup(tracker.class.Issue, existing._id, 'description', body, 'markdown')
      : null

    await client.updateDoc(
      tracker.class.Issue,
      project._id,
      existing._id,
      {
        ...(description ? { description } : {}),
        ...(milestoneId ? { milestone: milestoneId } : {}),
        priority
      }
    )
    console.log('updated:', existing.identifier, '-', existing.title)
    return
  }

  // Create new issue
  const issueId = core.generateId()

  const incResult = await client.updateDoc(
    tracker.class.Project,
    core.space.Space,
    project._id,
    { $inc: { sequence: 1 } },
    true
  )
  const sequence = incResult?.object?.sequence

  const lastOne = await client.findOne(
    tracker.class.Issue,
    { space: project._id },
    { sort: { rank: core.SortingOrder.Descending } }
  )

  const description = body
    ? await client.uploadMarkup(tracker.class.Issue, issueId, 'description', body, 'markdown')
    : null

  await client.addCollection(
    tracker.class.Issue,
    project._id,
    project._id,
    project._class,
    'issues',
    {
      title,
      description,
      status: project.defaultIssueStatus,
      number: sequence,
      kind: tracker.taskTypes.Issue,
      identifier: `${project.identifier}-${sequence}`,
      priority,
      assignee: null,
      component: null,
      estimation: 0,
      remainingTime: 0,
      reportedTime: 0,
      reports: 0,
      subIssues: 0,
      parents: [],
      childInfo: [],
      dueDate: null,
      milestone: milestoneId ?? null,
      rank: rank.makeRank(lastOne?.rank, undefined)
    },
    issueId
  )

  const issue = await client.findOne(tracker.class.Issue, { _id: issueId })
  console.log('created:', issue?.identifier, '-', issue?.title)
}

function parseImplementationTasks (md) {
  // Heuristic parser:
  // - sections like "## A) ... (P0)" set current bucket
  // - tasks like "### A1 — Title" define an item; capture until next ### or ##
  const lines = md.split(/\r?\n/)
  const items = []
  let bucket = null
  let current = null

  const flush = () => {
    if (!current) return
    current.body = current.body.join('\n').trim()
    items.push(current)
    current = null
  }

  for (const line of lines) {
    const mBucket = line.match(/^##\s+(.+?)(?:\s+\((P\d)\))?\s*$/)
    if (mBucket) {
      flush()
      bucket = { title: mBucket[1].trim(), prio: mBucket[2] || '' }
      continue
    }

    const mTask = line.match(/^###\s+([^—]+)—\s+(.+)$/)
    if (mTask) {
      flush()
      current = {
        code: mTask[1].trim(),
        title: mTask[2].trim(),
        prio: bucket?.prio || '',
        bucket: bucket?.title || '',
        body: []
      }
      continue
    }

    if (current) current.body.push(line)
  }

  flush()
  return items
}

function milestoneForBucket (bucketTitle) {
  const t = (bucketTitle || '').toLowerCase()
  if (t.startsWith('a)') || t.startsWith('b)') || t.startsWith('c)') || t.startsWith('d)') || t.startsWith('e)') || t.startsWith('f)') {
    return 'Phase 0.5 — Policy & Ops'
  }
  if (t.startsWith('g)')) return 'Phase 1 — Reliability'
  if (t.startsWith('h)')) return 'Phase 2 — Proactive Engine'
  if (t.startsWith('i)')) return 'Phase 3 — Quality Upgrades'
  if (t.startsWith('j)')) return 'Phase 4 — Workflow Acceleration'
  if (t.startsWith('k)')) return 'Phase 5 — Autonomy Optimization'
  return 'Phase 0.5 — Policy & Ops'
}

const client = await connectHuly()
try {
  const project = await client.findOne(tracker.class.Project, { identifier: PROJECT_IDENTIFIER })
  if (!project) {
    throw new Error(`Huly project not found: ${PROJECT_IDENTIFIER}. Create it in the Huly UI, then set HULY_PROJECT_IDENTIFIER.`)
  }

  const repoRoot = path.resolve(process.cwd(), '..', '..')
  const implTasksPath = path.join(repoRoot, 'docs', 'IMPLEMENTATION_TASKS.md')
  const md = await fs.readFile(implTasksPath, 'utf8')

  const items = parseImplementationTasks(md)
  console.log(`parsed items: ${items.length}`)

  // Create milestones up front
  const milestones = new Map()
  for (const label of [
    'Phase 0.5 — Policy & Ops',
    'Phase 1 — Reliability',
    'Phase 2 — Proactive Engine',
    'Phase 3 — Quality Upgrades',
    'Phase 4 — Workflow Acceleration',
    'Phase 5 — Autonomy Optimization'
  ]) {
    const ms = await ensureMilestone(client, project._id, label)
    milestones.set(label, ms._id)
  }

  // Seed issues
  for (const it of items) {
    const msLabel = milestoneForBucket(it.bucket)
    const milestoneId = milestones.get(msLabel)
    const prio = priorityFromText(it.prio)

    const title = `${it.code} — ${it.title}`
    const body = `## Source\n\n- From: \`docs/IMPLEMENTATION_TASKS.md\`\n- Bucket: **${it.bucket}**\n\n---\n\n${it.body}\n`

    await createOrUpdateIssue(client, project, title, body, prio, milestoneId)
  }
} finally {
  await client.close()
}
