/**
 * Pipeline 配置类型定义
 */

export interface PipelineConfig {
  steps: PipelineStep[]
  git: GitConfig
}

export interface GitConfig {
  enabled: boolean
  baseBranch: string
  autoMerge: boolean
}

export type PipelineStep = SingleStep | ParallelStep

export interface SingleStep {
  id: string
  type: 'single'
  agentId: string
  prompt: string
  promptArgs?: Record<string, string>
  dependsOn?: string[]
  // Session 恢复：共享前序 step 的 session
  resumeFrom?: string  // step id，复用该 step 的 sessionId
  // Multi-iteration：循环执行直到完成信号
  maxIterations?: number  // 默认 1
  completionSignal?: string  // 默认 '<done>COMPLETE</done>'
  // Structured Output：从输出中提取结构化数据
  output?: OutputExtraction
}

export interface ParallelStep {
  id: string
  type: 'parallel'
  steps: Omit<SingleStep, 'type' | 'dependsOn'>[]
  dependsOn?: string[]
}

export interface OutputExtraction {
  tag: string  // XML tag 名，如 "plan"、"result"
  parseJson?: boolean  // 是否 JSON.parse tag 内容
}

export interface StepResult {
  stepId: string
  status: 'completed' | 'failed' | 'skipped'
  output: string
  structuredOutput?: unknown  // OutputExtraction 解析结果
  sessionId?: string  // Claude session id，供后续 step 复用
  commits: string[]
  iterations?: number  // 实际执行了几轮
  error?: string
}
