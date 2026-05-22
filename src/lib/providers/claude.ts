import type { AgentProvider, CommandOptions, CommandResult, ProviderEvent } from './types'

export function createClaudeProvider(): AgentProvider {
  return {
    name: 'claude',

    buildCommand(options: CommandOptions): CommandResult {
      const args = [
        '-p', `${options.systemPrompt || ''}\n\n用户请求: ${options.prompt}`,
        '--output-format', 'stream-json',
        '--verbose',
      ]
      if (options.model) {
        args.push('--model', options.model)
      }
      if (options.sessionId) {
        args.push('--resume', options.sessionId)
      }

      const env: Record<string, string> = {}
      if (options.apiKey) env.ANTHROPIC_API_KEY = options.apiKey
      if (options.baseUrl) env.ANTHROPIC_BASE_URL = options.baseUrl

      return { command: 'claude', args, env }
    },

    parseOutputLine(line: string): ProviderEvent[] {
      if (!line.trim()) return []

      try {
        const event = JSON.parse(line)
        const events: ProviderEvent[] = []

        // 提取 session id
        if (event.type === 'system' && event.session_id) {
          events.push({ type: 'session_id', id: event.session_id })
        }

        if (event.type === 'tool_use' && event.tool) {
          events.push({
            type: 'tool_use',
            name: event.tool.name || 'unknown',
            input: JSON.stringify(event.tool.input || {}),
          })
        }

        if (event.type === 'tool_result' && event.tool) {
          events.push({
            type: 'tool_result',
            name: event.tool.name || 'unknown',
            output: JSON.stringify(event.result || {}),
            error: event.error,
          })
        }

        if (event.type === 'assistant' && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === 'text') {
              events.push({ type: 'text', content: block.text })
            }
          }
        }

        if (event.type === 'result' && event.result) {
          events.push({ type: 'result', content: event.result })
        }

        // 解析 usage 信息（可能出现在 result 或 usage 事件中）
        if (event.usage) {
          events.push({ type: 'usage', inputTokens: event.usage.input_tokens || 0, outputTokens: event.usage.output_tokens || 0 })
        }

        // session_id 也可能在 result 事件中
        if (event.session_id) {
          events.push({ type: 'session_id', id: event.session_id })
        }

        return events
      } catch {
        return [{ type: 'text', content: line }]
      }
    },
  }
}
