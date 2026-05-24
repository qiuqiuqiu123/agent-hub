import { db } from '@/db'
import { agents } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { getToolProvider } from '@/lib/providers'

/**
 * Pipeline 失败告警
 * 通过配置的 Tool Agent 发送通知
 */
export async function sendFailureAlert(options: {
  pipelineName: string
  runId: string
  error: string
  alertAgentId?: string
}): Promise<void> {
  const { pipelineName, runId, error, alertAgentId } = options
  if (!alertAgentId) return

  try {
    const [agent] = await db.select().from(agents).where(eq(agents.id, alertAgentId))
    if (!agent || agent.type !== 'tool') return

    const toolProvider = getToolProvider(agent.provider)
    const agentConfig: Record<string, string> = JSON.parse(agent.config || '{}')

    const content = `Pipeline 执行失败告警\n\nPipeline: ${pipelineName}\nRun ID: ${runId}\n错误: ${error}`

    await toolProvider.execute(
      { CONTENT: content, SUBJECT: `[Alert] Pipeline ${pipelineName} 失败` },
      agentConfig,
    )
  } catch (err) {
    console.error('[Alert] 发送失败告警出错:', err)
  }
}
