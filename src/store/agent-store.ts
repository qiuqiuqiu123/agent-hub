import { create } from 'zustand'
import type { Agent, Skill, Task, Message } from '@/db/schema'

interface AgentStore {
  agents: Agent[]
  skills: Skill[]
  selectedAgentId: string | null
  tasks: Task[]
  messages: Message[]
  sessionUsage: { inputTokens: number; outputTokens: number }
  usedSkills: string[]
  setAgents: (agents: Agent[]) => void
  setSkills: (skills: Skill[]) => void
  selectAgent: (id: string | null) => void
  setTasks: (tasks: Task[]) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  appendToLastMessage: (text: string) => void
  addUsage: (input: number, output: number) => void
  addUsedSkill: (name: string) => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  skills: [],
  selectedAgentId: null,
  tasks: [],
  messages: [],
  sessionUsage: { inputTokens: 0, outputTokens: 0 },
  usedSkills: [],
  setAgents: (agents) => set({ agents }),
  setSkills: (skills) => set({ skills }),
  selectAgent: (id) => set({ selectedAgentId: id, messages: [], tasks: [], sessionUsage: { inputTokens: 0, outputTokens: 0 }, usedSkills: [] }),
  setTasks: (tasks) => set({ tasks }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  appendToLastMessage: (text) => set((s) => {
    const msgs = [...s.messages]
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: last.content + text }
    }
    return { messages: msgs }
  }),
  addUsage: (input, output) => set((s) => ({
    sessionUsage: {
      inputTokens: s.sessionUsage.inputTokens + input,
      outputTokens: s.sessionUsage.outputTokens + output,
    }
  })),
  addUsedSkill: (name) => set((s) => ({
    usedSkills: s.usedSkills.includes(name) ? s.usedSkills : [...s.usedSkills, name]
  })),
}))
