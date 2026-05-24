// === AI Agent Provider (CLI spawn) ===

export interface AgentProvider {
  readonly name: string
  buildCommand(options: CommandOptions): CommandResult
  parseOutputLine(line: string): ProviderEvent[]
}

export interface CommandOptions {
  prompt: string
  systemPrompt?: string
  model?: string
  apiKey?: string
  baseUrl?: string
  workDir?: string
  sessionId?: string
}

export interface CommandResult {
  command: string
  args: string[]
  stdin?: string
  env: Record<string, string>
}

export type ProviderEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_use'; name: string; input: string }
  | { type: 'tool_result'; name: string; output: string; error?: string }
  | { type: 'result'; content: string }
  | { type: 'error'; message: string }
  | { type: 'session_id'; id: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }

// === Tool Agent Provider (确定性程序调用) ===

export interface ToolProvider {
  readonly name: string
  execute(input: Record<string, string>, config: Record<string, string>): Promise<ToolResult>
}

export interface ToolResult {
  success: boolean
  output: string
  error?: string
}
