/**
 * Pipeline 配置类型定义 (v1)
 */

export interface PipelineConfig {
  version: '1'
  input?: Record<string, PipelineInputParam>
  steps: PipelineStep[]
  git: GitConfig
}

export interface PipelineInputParam {
  type: 'string' | 'number' | 'boolean'
  required?: boolean
  default?: string
  description?: string
}

export interface GitConfig {
  enabled: boolean
  baseBranch: string
  autoMerge: boolean
}

export type PipelineStep = SingleStep | ParallelStep | ConditionStep

export type FailureStrategy = 'stop' | 'skip' | 'retry'

export interface SingleStep {
  id: string
  type: 'single'
  agentId: string
  prompt: string
  promptArgs?: Record<string, string>
  dependsOn?: string[]
  onFailure?: FailureStrategy
  maxRetries?: number
  // Session 恢复：共享前序 step 的 session
  resumeFrom?: string
  // Multi-iteration：循环执行直到完成信号
  maxIterations?: number
  completionSignal?: string
  // Structured Output：从输出中提取结构化数据
  output?: OutputExtraction
}

export interface ParallelStep {
  id: string
  type: 'parallel'
  steps: Omit<SingleStep, 'type' | 'dependsOn'>[]
  dependsOn?: string[]
  onFailure?: FailureStrategy
}

export interface ConditionStep {
  id: string
  type: 'condition'
  input: string  // 模板引用，如 "{{STEP_ANALYZE_DATA}}"
  field: string  // 字段名，用于等值匹配
  branches: Record<string, string[]>  // 值 -> 激活的 step id 列表
  dependsOn?: string[]
}

export interface OutputExtraction {
  tag: string
  parseJson?: boolean
  schema?: Record<string, string>  // 字段名 -> 类型描述，用于 prompt 注入
}

export interface StepResult {
  stepId: string
  status: 'completed' | 'failed' | 'skipped'
  output: string
  structuredOutput?: unknown
  sessionId?: string
  commits: string[]
  iterations?: number
  error?: string
}
