import type { AgentProvider } from './types'
import { createClaudeProvider } from './claude'
import { createCodexProvider } from './codex'

export type { AgentProvider, CommandOptions, CommandResult, ProviderEvent } from './types'

const providers: Record<string, () => AgentProvider> = {
  claude: createClaudeProvider,
  codex: createCodexProvider,
}

export function getProvider(name: string): AgentProvider {
  const factory = providers[name]
  if (!factory) {
    throw new Error(`Unknown provider: ${name}. Available: ${Object.keys(providers).join(', ')}`)
  }
  return factory()
}

export function registerProvider(name: string, factory: () => AgentProvider): void {
  providers[name] = factory
}
