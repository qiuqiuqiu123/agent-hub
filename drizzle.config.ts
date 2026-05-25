import { defineConfig } from 'drizzle-kit'
import path from 'path'
import os from 'os'

function getDatabaseUrl() {
  if (process.env.AGENT_HUB_DB_PATH) return process.env.AGENT_HUB_DB_PATH
  if (process.env.AGENT_HUB_DATA_DIR) return path.join(process.env.AGENT_HUB_DATA_DIR, 'agent-hub.db')
  return path.join(os.homedir(), '.agent-hub', 'data', 'agent-hub.db')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
})
