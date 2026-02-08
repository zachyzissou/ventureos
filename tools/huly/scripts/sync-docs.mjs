import fs from 'node:fs/promises'
import path from 'node:path'

import * as core from '@hcengineering/core'
import * as rank from '@hcengineering/rank'
import * as document from '@hcengineering/document'

import { connectHuly } from '../src/huly-client.mjs'

const TEAMSPACE_NAME = process.env.HULY_TEAMSPACE_NAME || 'VentureOS'

function stripFrontMatter (s) {
  if (s.startsWith('---')) {
    const idx = s.indexOf('\n---', 3)
    if (idx !== -1) return s.slice(idx + 4)
  }
  return s
}

function inferTitle (file, content) {
  const m = content.match(/^#\s+(.+)$/m)
  if (m) return m[1].trim()
  return path.basename(file, path.extname(file))
}

async function ensureTeamspace (client) {
  const existing = await client.findOne(document.class.Teamspace, { name: TEAMSPACE_NAME, archived: false })
  if (existing) return existing

  const account = client.getAccount()
  const id = await client.createDoc(
    document.class.Teamspace,
    core.space.Space,
    {
      name: TEAMSPACE_NAME,
      description: `Synced docs for VentureOS / OpenClaw-Upgrade (${new Date().toISOString()})`,
      private: false,
      archived: false,
      members: [account._id],
      owners: [account._id],
      icon: document.icon.Teamspace,
      type: document.spaceType.DefaultTeamspaceType
    }
  )
  const created = await client.findOne(document.class.Teamspace, { _id: id })
  if (!created) throw new Error('Failed to create teamspace')
  return created
}

async function upsertDoc (client, teamspaceId, title, markdown) {
  const existing = await client.findOne(document.class.Document, { space: teamspaceId, title })

  const docId = existing?._id ?? core.generateId()
  const content = await client.uploadMarkup(document.class.Document, docId, 'content', markdown, 'markdown')

  if (existing) {
    await client.updateDoc(document.class.Document, teamspaceId, existing._id, { content })
    return { id: existing._id, created: false }
  }

  const lastOne = await client.findOne(document.class.Document, { space: teamspaceId }, { sort: { rank: core.SortingOrder.Descending } })
  await client.createDoc(
    document.class.Document,
    teamspaceId,
    {
      title,
      content,
      parent: document.ids.NoParent,
      rank: rank.makeRank(lastOne?.rank, undefined)
    },
    docId
  )
  return { id: docId, created: true }
}

const client = await connectHuly()
try {
  const teamspace = await ensureTeamspace(client)

  const repoRoot = path.resolve(process.cwd(), '..', '..') // tools/huly -> (repo)/tools
  const docsDir = path.join(repoRoot, 'docs')

  const files = (await fs.readdir(docsDir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(docsDir, f))

  let created = 0
  let updated = 0
  const indexLines = [`# VentureOS / OpenClaw-Upgrade Docs (Synced)`, '', `Teamspace: **${TEAMSPACE_NAME}**`, '', '## Files', '']

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const content = stripFrontMatter(raw).trim()
    const title = inferTitle(file, content)

    const md = `> Source: \`${path.relative(repoRoot, file)}\`\n\n${content}\n`

    const res = await upsertDoc(client, teamspace._id, title, md)
    if (res.created) created++
    else updated++

    indexLines.push(`- ${title}`)
  }

  await upsertDoc(client, teamspace._id, 'VentureOS Docs Index', indexLines.join('\n'))

  console.log(`teamspace: ${TEAMSPACE_NAME}`)
  console.log(`docs: ${files.length} (created ${created}, updated ${updated})`)
} finally {
  await client.close()
}
