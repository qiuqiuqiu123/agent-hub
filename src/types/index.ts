export type TaskStatus = 'pending' | 'running' | 'paused' | 'completed' | 'unknown'
export type ProviderType = 'claude' | 'codex'

export interface AgentFormData {
  name: string
  role: string
  personality: string
  systemPrompt: string
  provider: ProviderType
}

export interface SkillFormData {
  name: string
  description: string
  content: string
}

export interface TaskFormData {
  title: string
  description: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}
