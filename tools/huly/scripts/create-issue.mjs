import * as core from '@hcengineering/core'
import * as rank from '@hcengineering/rank'
import * as tracker from '@hcengineering/tracker'
import { connectHuly } from '../src/huly-client.mjs'

function getArg (name, def = undefined) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1) return def
  const v = process.argv[idx + 1]
  if (!v || v.startsWith('--')) return true
  return v
}

const title = getArg('title')
const body = getArg('body', '')
const priorityArg = (getArg('priority', 'normal') || 'normal').toLowerCase()

if (!title || title === true) {
  console.error('Missing --title')
  process.exit(2)
}

const projectIdentifier = process.env.HULY_PROJECT_IDENTIFIER
if (!projectIdentifier) {
  console.error('Missing HULY_PROJECT_IDENTIFIER (set in .env)')
  process.exit(2)
}

const priorityMap = {
  urgent: tracker.IssuePriority.Urgent,
  high: tracker.IssuePriority.High,
  normal: tracker.IssuePriority.Normal,
  low: tracker.IssuePriority.Low
}
const priority = priorityMap[priorityArg] ?? tracker.IssuePriority.Normal

const client = await connectHuly()
try {
  const project = await client.findOne(tracker.class.Project, { identifier: projectIdentifier })
  if (!project) throw new Error(`Project not found: ${projectIdentifier}`)

  const issueId = core.generateId()

  // Increment project sequence to get issue number
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
      rank: rank.makeRank(lastOne?.rank, undefined)
    },
    issueId
  )

  const issue = await client.findOne(tracker.class.Issue, { _id: issueId })
  console.log('created:', issue?.identifier, '-', issue?.title)
} finally {
  await client.close()
}
