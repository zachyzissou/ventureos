import tracker from '@hcengineering/tracker'
import { SortingOrder } from '@hcengineering/core'
import { connectHuly } from '../src/huly-client.mjs'

const client = await connectHuly()
try {
  const projects = await client.findAll(
    tracker.class.Project,
    {},
    { limit: 200, sort: { identifier: SortingOrder.Ascending } }
  )

  console.log(`projects: ${projects.length}`)
  for (const p of projects) {
    console.log(`- ${p.identifier}\t${p.name ?? ''}`)
  }
} finally {
  await client.close()
}
