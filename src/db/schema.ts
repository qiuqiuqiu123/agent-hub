import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  personality: text('personality').notNull(),
  systemPrompt: text('system_prompt').notNull().default(''),
  type: text('type', { enum: ['ai', 'tool'] }).notNull().default('ai'),
  provider: text('provider').notNull().default('claude'),
  apiKey: text('api_key').notNull().default(''),
  baseUrl: text('base_url').notNull().default(''),
  modelId: text('model_id').notNull().default(''),
  workDir: text('work_dir').notNull().default(''),
  config: text('config').notNull().default('{}'), // Tool Agent 配置 JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const agentSkills = sqliteTable('agent_skills', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  skillId: text('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status', { enum: ['pending', 'running', 'paused', 'completed', 'unknown'] }).notNull().default('pending'),
  result: text('result'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const executionLogs = sqliteTable('execution_logs', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(), // 执行顺序
  type: text('type', { enum: ['skill', 'agent', 'tool'] }).notNull(),
  targetId: text('target_id').notNull(), // skill_id 或 agent_id 或 tool 名称
  targetName: text('target_name').notNull(),
  input: text('input'), // 输入参数
  output: text('output'), // 输出结果
  status: text('status', { enum: ['pending', 'running', 'success', 'error'] }).notNull().default('pending'),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

export type Agent = typeof agents.$inferSelect
export type NewAgent = typeof agents.$inferInsert
export type Skill = typeof skills.$inferSelect
export type NewSkill = typeof skills.$inferInsert
export type Task = typeof tasks.$inferSelect
export type Message = typeof messages.$inferSelect
export type ExecutionLog = typeof executionLogs.$inferSelect
export type NewExecutionLog = typeof executionLogs.$inferInsert

// Pipeline 相关表

export const pipelines = sqliteTable('pipelines', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  config: text('config').notNull(), // JSON: PipelineConfig
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const pipelineRuns = sqliteTable('pipeline_runs', {
  id: text('id').primaryKey(),
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] }).notNull().default('pending'),
  branch: text('branch'),
  baseSha: text('base_sha'),
  workspaceRunId: text('workspace_run_id'),
  inputJson: text('input_json'),  // JSON string of pipeline input params
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

export const pipelineStepRuns = sqliteTable('pipeline_step_runs', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => pipelineRuns.id, { onDelete: 'cascade' }),
  stepId: text('step_id').notNull(), // 来自 config 中的 step.id
  agentId: text('agent_id').notNull().references(() => agents.id),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed', 'skipped'] }).notNull().default('pending'),
  prompt: text('prompt').notNull(),
  output: text('output'),
  commits: text('commits'), // JSON: string[]
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
})

export type Pipeline = typeof pipelines.$inferSelect
export type NewPipeline = typeof pipelines.$inferInsert
export type PipelineRun = typeof pipelineRuns.$inferSelect
export type PipelineStepRun = typeof pipelineStepRuns.$inferSelect

// 定时任务表

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  cron: text('cron').notNull(),
  input: text('input').notNull().default('{}'), // JSON: Pipeline input 参数
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Webhook 表

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pipelineId: text('pipeline_id').notNull().references(() => pipelines.id, { onDelete: 'cascade' }),
  matchRules: text('match_rules').notNull().default('{}'), // JSON: 字段等值匹配规则
  extractInput: text('extract_input').notNull().default('{}'), // JSON: payload 字段 -> pipeline input 映射
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export type Schedule = typeof schedules.$inferSelect
export type NewSchedule = typeof schedules.$inferInsert
export type Webhook = typeof webhooks.$inferSelect
export type NewWebhook = typeof webhooks.$inferInsert
