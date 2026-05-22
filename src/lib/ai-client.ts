import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import type { ProviderType } from '@/types'
import type { Agent, Message } from '@/db/schema'

interface ChatOptions {
  agent: Agent
  systemPrompt: string
  messages: Pick<Message, 'role' | 'content'>[]
}

export async function* streamChat(options: ChatOptions): AsyncGenerator<string> {
  const { agent, systemPrompt, messages } = options
  const model = agent.provider as 'claude' | 'codex'

  if (model === 'claude') {
    const anthropic = new Anthropic({
      apiKey: agent.apiKey || process.env.ANTHROPIC_API_KEY || '',
      ...(agent.baseUrl ? { baseURL: agent.baseUrl } : {}),
    })

    const stream = anthropic.messages.stream({
      model: agent.modelId || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text
      }
    }
  } else {
    const openai = new OpenAI({
      apiKey: agent.apiKey || process.env.OPENAI_API_KEY || '',
      ...(agent.baseUrl ? { baseURL: agent.baseUrl } : {}),
    })

    const stream = await openai.chat.completions.create({
      model: agent.modelId || 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ],
    })

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content
      if (text) yield text
    }
  }
}
