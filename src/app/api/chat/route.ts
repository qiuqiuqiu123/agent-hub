import { NextRequest } from 'next/server'
import { db } from '@/db'
import { agents, messages, skills, agentSkills, executionLogs } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generateId } from '@/lib/constants'
import { spawn } from 'child_process'
import { getProvider } from '@/lib/providers'
import type { ProviderEvent } from '@/lib/providers'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { agentId, content, mode } = body

  if (!agentId || !content) {
    return new Response(JSON.stringify({ error: 'agentId and content required' }), { status: 400 })
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId))
  if (!agent) {
    return new Response(JSON.stringify({ error: 'agent not found' }), { status: 404 })
  }

  // 保存用户消息
  await db.insert(messages).values({
    id: generateId(),
    agentId,
    role: 'user',
    content,
    createdAt: new Date(),
  })

  // 终端模式：直接执行命令
  if (mode === 'terminal') {
    return handleTerminal(agent, content)
  }

  // 对话模式：通过 Provider 调用 Agent CLI
  return handleAgentChat(agent, content)
}

function handleTerminal(agent: typeof agents.$inferSelect, command: string) {
  const encoder = new TextEncoder()
  const cwd = agent.workDir || process.cwd()

  const stream = new ReadableStream({
    start(controller) {
      const proc = spawn('bash', ['-c', command], {
        cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
      })

      proc.stdout.on('data', (data: Buffer) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: data.toString() })}\n\n`))
      })

      proc.stderr.on('data', (data: Buffer) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: data.toString(), stderr: true })}\n\n`))
      })

      proc.on('close', (code) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, exitCode: code })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      })

      proc.on('error', (err) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}

async function handleAgentChat(agent: typeof agents.$inferSelect, content: string) {
  const encoder = new TextEncoder()
  const cwd = agent.workDir || process.cwd()

  // 获取 skills 构建 system prompt
  const agentSkillRows = await db
    .select({ skill: skills })
    .from(agentSkills)
    .innerJoin(skills, eq(agentSkills.skillId, skills.id))
    .where(eq(agentSkills.agentId, agent.id))

  const skillsContext = agentSkillRows.length > 0
    ? `\n\n可用技能:\n${agentSkillRows.map(r => `- ${r.skill.name}: ${r.skill.description}`).join('\n')}`
    : ''

  const systemPrompt = `你是 ${agent.name}。角色: ${agent.role}。性格: ${agent.personality}。${agent.systemPrompt || ''}${skillsContext}`

  // 通过 Provider 构建命令
  const provider = getProvider(agent.provider)
  const { command, args, stdin: stdinData, env: providerEnv } = provider.buildCommand({
    prompt: content,
    systemPrompt,
    model: agent.modelId || undefined,
    apiKey: agent.apiKey || undefined,
    baseUrl: agent.baseUrl || undefined,
    workDir: cwd,
  })

  let fullResponse = ''
  const assistantMessageId = generateId()
  const logQueue: Array<{ type: string; name: string; input?: string; output?: string; status: string; error?: string; timestamp: Date }> = []

  const stream = new ReadableStream({
    start(controller) {
      const env = { ...process.env, ...providerEnv } as NodeJS.ProcessEnv

      const proc = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
      if (stdinData) {
        proc.stdin.write(stdinData)
      }
      proc.stdin.end()

      let buffer = ''

      proc.stdout.on('data', (data: Buffer) => {
        buffer += data.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const events = provider.parseOutputLine(line)
          for (const evt of events) {
            handleProviderEvent(evt, controller, encoder, logQueue, fullResponse, (text) => { fullResponse += text })
          }
        }
      })

      proc.stderr.on('data', (data: Buffer) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: data.toString(), stderr: true })}\n\n`))
      })

      proc.on('close', async () => {
        // 处理 buffer 中剩余内容
        if (buffer.trim()) {
          const events = provider.parseOutputLine(buffer)
          for (const evt of events) {
            handleProviderEvent(evt, controller, encoder, logQueue, fullResponse, (text) => { fullResponse += text })
          }
        }

        // 保存 assistant 消息
        if (fullResponse.trim()) {
          await db.insert(messages).values({
            id: assistantMessageId,
            agentId: agent.id,
            role: 'assistant',
            content: fullResponse,
            createdAt: new Date(),
          })
        }

        // 批量写入执行日志
        for (let i = 0; i < logQueue.length; i++) {
          const log = logQueue[i]
          await db.insert(executionLogs).values({
            id: generateId(),
            messageId: assistantMessageId,
            agentId: agent.id,
            sequence: i,
            type: log.type as 'tool',
            targetId: log.name,
            targetName: log.name,
            input: log.input,
            output: log.output,
            status: log.status as 'success' | 'error' | 'running',
            error: log.error,
            startedAt: log.timestamp,
            completedAt: log.status !== 'running' ? new Date() : undefined,
          })
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      })

      proc.on('error', (err) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}

function handleProviderEvent(
  evt: ProviderEvent,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  logQueue: Array<{ type: string; name: string; input?: string; output?: string; status: string; error?: string; timestamp: Date }>,
  fullResponse: string,
  appendText: (text: string) => void,
) {
  switch (evt.type) {
    case 'tool_use':
      logQueue.push({
        type: 'tool',
        name: evt.name,
        input: evt.input,
        status: 'running',
        timestamp: new Date(),
      })
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        log: { type: 'tool', name: evt.name, status: 'running' }
      })}\n\n`))
      break

    case 'tool_result': {
      const lastLog = logQueue[logQueue.length - 1]
      if (lastLog && lastLog.status === 'running') {
        lastLog.output = evt.output
        lastLog.status = evt.error ? 'error' : 'success'
        lastLog.error = evt.error
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        log: { type: 'tool', name: evt.name, status: evt.error ? 'error' : 'success' }
      })}\n\n`))
      break
    }

    case 'text':
      appendText(evt.content)
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: evt.content })}\n\n`))
      break

    case 'result':
      if (!fullResponse.includes(evt.content)) {
        appendText(evt.content)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: evt.content })}\n\n`))
      }
      break

    case 'error':
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: evt.message })}\n\n`))
      break

    case 'usage':
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ usage: { input: evt.inputTokens, output: evt.outputTokens } })}\n\n`))
      break
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get('agentId')
  if (!agentId) return new Response(JSON.stringify({ error: 'agentId required' }), { status: 400 })

  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.agentId, agentId))
    .orderBy(messages.createdAt)

  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
}
