import { db } from '@/db'
import { webhooks, pipelines, agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runPipeline } from '@/lib/pipeline/runner'
import type { PipelineConfig } from '@/lib/pipeline/types'

/**
 * 从嵌套对象中按点号路径取值
 * 如 "body.object_attributes.url" -> obj.body.object_attributes.url
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * 匹配 webhook 规则
 * matchRules: { "headers.x-gitlab-event": "Merge Request Hook", "body.action": "open" }
 * 所有规则必须全部匹配（AND 逻辑）
 */
export function matchWebhook(
  matchRules: Record<string, string>,
  payload: { headers: Record<string, string>; body: Record<string, unknown> },
): boolean {
  for (const [path, expected] of Object.entries(matchRules)) {
    const actual = getNestedValue(payload as unknown as Record<string, unknown>, path)
    if (String(actual) !== expected) return false
  }
  return true
}

/**
 * 从 payload 中提取 input 参数
 * extractInput: { "MR_URL": "body.object_attributes.url" }
 */
export function extractInputFromPayload(
  extractRules: Record<string, string>,
  payload: { headers: Record<string, string>; body: Record<string, unknown> },
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, path] of Object.entries(extractRules)) {
    const value = getNestedValue(payload as unknown as Record<string, unknown>, path)
    if (value !== undefined) {
      result[key] = String(value)
    }
  }
  return result
}

/**
 * 处理 incoming webhook 请求
 */
export async function handleIncomingWebhook(
  headers: Record<string, string>,
  body: Record<string, unknown>,
): Promise<{ matched: boolean; pipelineId?: string; runId?: string; error?: string }> {
  const allWebhooks = await db.select().from(webhooks).where(eq(webhooks.enabled, true))

  const payload = { headers, body }

  for (const webhook of allWebhooks) {
    const matchRules: Record<string, string> = JSON.parse(webhook.matchRules || '{}')
    if (!matchWebhook(matchRules, payload)) continue

    // 匹配成功
    const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, webhook.pipelineId))
    if (!pipeline) {
      return { matched: true, error: `Pipeline ${webhook.pipelineId} not found` }
    }

    const config: PipelineConfig = JSON.parse(pipeline.config)
    const extractRules: Record<string, string> = JSON.parse(webhook.extractInput || '{}')
    const input = extractInputFromPayload(extractRules, payload)

    // 确定工作目录
    let workDir = process.cwd()
    const firstStep = config.steps[0]
    if (firstStep?.type === 'single') {
      const [agent] = await db.select().from(agents).where(eq(agents.id, firstStep.agentId))
      if (agent?.workDir) workDir = agent.workDir
    }

    const runId = await runPipeline({
      pipelineId: webhook.pipelineId,
      pipelineName: pipeline.name,
      config,
      workDir,
      input,
    })

    return { matched: true, pipelineId: webhook.pipelineId, runId }
  }

  return { matched: false }
}
