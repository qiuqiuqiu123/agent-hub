import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import path from 'path'
import fs from 'fs'
import os from 'os'

function getDataDir(): string {
  if (process.env.AGENT_HUB_DATA_DIR) return process.env.AGENT_HUB_DATA_DIR
  return path.join(os.homedir(), '.agent-hub', 'data')
}

const dbPath = process.env.AGENT_HUB_DB_PATH || path.join(getDataDir(), 'agent-hub.db')
if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
}

const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
sqlite.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  personality TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'ai',
  provider TEXT NOT NULL DEFAULT 'claude',
  api_key TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL DEFAULT '',
  work_dir TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_skills (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_name TEXT NOT NULL,
  input TEXT,
  output TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pipelines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  branch TEXT,
  base_sha TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pipeline_step_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  prompt TEXT NOT NULL,
  output TEXT,
  commits TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  FOREIGN KEY (run_id) REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  name TEXT NOT NULL,
  cron TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at INTEGER,
  next_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pipeline_id TEXT NOT NULL,
  match_rules TEXT NOT NULL DEFAULT '{}',
  extract_input TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
);
`)

const stepRunColumns = sqlite.prepare('PRAGMA table_info(pipeline_step_runs)').all() as Array<{ name: string }>
const stepRunColumnNames = new Set(stepRunColumns.map(column => column.name))
if (!stepRunColumnNames.has('input_tokens')) {
  sqlite.exec('ALTER TABLE pipeline_step_runs ADD COLUMN input_tokens INTEGER')
}
if (!stepRunColumnNames.has('output_tokens')) {
  sqlite.exec('ALTER TABLE pipeline_step_runs ADD COLUMN output_tokens INTEGER')
}

export const db = drizzle(sqlite, { schema })
