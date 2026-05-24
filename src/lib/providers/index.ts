import type { AgentProvider, ToolProvider } from './types'
import { createClaudeProvider } from './claude'
import { createCodexProvider } from './codex'
import { createFeishuProvider } from './feishu'
import { createGithubIssueProvider } from './github-issue'
import { createEmailProvider } from './email'
import { createImageGenProvider } from './image-gen'
import { createWechatMpProvider } from './wechat-mp'

export type { AgentProvider, ToolProvider, CommandOptions, CommandResult, ProviderEvent, ToolResult } from './types'

// AI Agent providers (CLI spawn)
const agentProviders: Record<string, () => AgentProvider> = {
  claude: createClaudeProvider,
  codex: createCodexProvider,
}

// Tool Agent providers (确定性程序调用)
const toolProviders: Record<string, () => ToolProvider> = {
  feishu: createFeishuProvider,
  'github-issue': createGithubIssueProvider,
  email: createEmailProvider,
  'image-gen': createImageGenProvider,
  'wechat-mp': createWechatMpProvider,
}

export function getProvider(name: string): AgentProvider {
  const factory = agentProviders[name]
  if (!factory) {
    throw new Error(`Unknown agent provider: ${name}. Available: ${Object.keys(agentProviders).join(', ')}`)
  }
  return factory()
}

export function getToolProvider(name: string): ToolProvider {
  const factory = toolProviders[name]
  if (!factory) {
    throw new Error(`Unknown tool provider: ${name}. Available: ${Object.keys(toolProviders).join(', ')}`)
  }
  return factory()
}

export function registerProvider(name: string, factory: () => AgentProvider): void {
  agentProviders[name] = factory
}

export function registerToolProvider(name: string, factory: () => ToolProvider): void {
  toolProviders[name] = factory
}
