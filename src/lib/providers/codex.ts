import type { AgentProvider, CommandOptions, CommandResult, ProviderEvent } from './types'

export function createCodexProvider(): AgentProvider {
  return {
    name: 'codex',

    buildCommand(options: CommandOptions): CommandResult {
      const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only']

      if (options.model) {
        args.push('-m', options.model)
      }
      if (options.workDir) {
        args.push('-C', options.workDir)
      }

      // system prompt + 用户 prompt 拼接后通过 stdin 传入
      const prompt = options.systemPrompt
        ? `${options.systemPrompt}\n\n用户请求: ${options.prompt}`
        : options.prompt

      const env: Record<string, string> = {}
      if (options.apiKey) env.OPENAI_API_KEY = options.apiKey
      if (options.baseUrl) env.OPENAI_BASE_URL = options.baseUrl

      return { command: 'codex', args, stdin: prompt, env }
    },

    parseOutputLine(line: string): ProviderEvent[] {
      if (!line.trim()) return []

      // 跳过非 JSON 行（如 "Reading prompt from stdin..."）
      if (!line.startsWith('{')) return []

      try {
        const event = JSON.parse(line)

        switch (event.type) {
          case 'thread.started':
            if (event.thread_id) {
              return [{ type: 'session_id', id: event.thread_id }]
            }
            return []

          case 'item.completed':
            if (event.item?.type === 'agent_message' && event.item.text) {
              return [{ type: 'text', content: event.item.text }]
            }
            if (event.item?.type === 'tool_call') {
              return [{ type: 'tool_use', name: event.item.name || 'unknown', input: JSON.stringify(event.item.arguments || '') }]
            }
            if (event.item?.type === 'tool_result') {
              return [{ type: 'tool_result', name: event.item.name || 'unknown', output: event.item.output || '' }]
            }
            return []

          case 'turn.completed':
            if (event.usage) {
              return [{ type: 'usage', inputTokens: event.usage.input_tokens || 0, outputTokens: event.usage.output_tokens || 0 }]
            }
            return []

          default:
            return []
        }
      } catch {
        // JSON 解析失败，当作纯文本
        return [{ type: 'text', content: line }]
      }
    },
  }
}
