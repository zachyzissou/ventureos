import 'dotenv/config'
import * as apiClient from '@hcengineering/api-client'

export function hulyConfig () {
  const url = process.env.HULY_URL
  const workspace = process.env.HULY_WORKSPACE
  const token = process.env.HULY_TOKEN
  const email = process.env.HULY_EMAIL
  const password = process.env.HULY_PASSWORD

  if (!url) throw new Error('Missing HULY_URL')
  if (!workspace) throw new Error('Missing HULY_WORKSPACE')

  const options = {
    workspace,
    socketFactory: apiClient.NodeWebSocketFactory,
    connectionTimeout: 30000
  }

  if (token) {
    options.token = token
  } else if (email && password) {
    options.email = email
    options.password = password
  } else {
    throw new Error('Missing auth: set HULY_TOKEN or (HULY_EMAIL + HULY_PASSWORD)')
  }

  return { url, options }
}

export async function connectHuly () {
  const { url, options } = hulyConfig()
  return await apiClient.connect(url, options)
}
