'use client'

import { useState } from 'react'
import { useAgentStore } from '@/store/agent-store'
import type { Agent } from '@/db/schema'
import type { ProviderType } from '@/types'
import { Plus, Trash2, Bot, Pencil } from 'lucide-react'

export function AgentList() {
  const { agents, selectedAgentId, selectAgent, setAgents, setTasks, setMessages } = useAgentStore()
  const [showForm, setShowForm] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)

  async function handleSelect(agent: Agent) {
    selectAgent(agent.id)
    const [tasksRes, msgsRes] = await Promise.all([
      fetch(`/api/tasks?agentId=${agent.id}`),
      fetch(`/api/chat?agentId=${agent.id}`),
    ])
    setTasks(await tasksRes.json())
    setMessages(await msgsRes.json())
  }

  async function handleDelete(id: string) {
    await fetch(`/api/agents?id=${id}`, { method: 'DELETE' })
    const res = await fetch('/api/agents')
    setAgents(await res.json())
    if (selectedAgentId === id) selectAgent(null)
  }

  function handleEdit(e: React.MouseEvent, agent: Agent) {
    e.stopPropagation()
    setEditingAgent(agent)
    setShowForm(true)
  }

  function handleCreate() {
    setEditingAgent(null)
    setShowForm(true)
  }

  return (
    <>
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-lg">Agents</h2>
        <button
          onClick={handleCreate}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-600"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {agents.map(agent => (
          <div
            key={agent.id}
            onClick={() => handleSelect(agent)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
              selectedAgentId === agent.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
            }`}
          >
            <Bot size={20} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{agent.name}</div>
              <div className="text-xs text-gray-500 truncate">{agent.role}</div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
              {agent.provider}
            </span>
            <button
              onClick={(e) => handleEdit(e, agent)}
              className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(agent.id) }}
              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {showForm && (
        <AgentForm
          agent={editingAgent}
          onClose={() => { setShowForm(false); setEditingAgent(null) }}
        />
      )}
    </>
  )
}

function AgentForm({ agent, onClose }: { agent: Agent | null; onClose: () => void }) {
  const { setAgents } = useAgentStore()
  const isEdit = agent !== null

  const [form, setForm] = useState({
    name: agent?.name || '',
    role: agent?.role || '',
    personality: agent?.personality || '',
    systemPrompt: agent?.systemPrompt || '',
    provider: (agent?.provider || 'claude') as ProviderType,
    apiKey: agent?.apiKey || '',
    baseUrl: agent?.baseUrl || '',
    modelId: agent?.modelId || '',
    workDir: agent?.workDir || '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isEdit) {
      await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: agent.id, ...form }),
      })
    } else {
      await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
    }
    const res = await fetch('/api/agents')
    setAgents(await res.json())
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg p-6 w-[480px] max-h-[80vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{isEdit ? '编辑 Agent' : '创建 Agent'}</h3>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">名称</span>
          <input
            required
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="如：代码审查员"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">角色</span>
          <input
            required
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="如：负责代码质量审查和改进建议"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">性格</span>
          <textarea
            required
            value={form.personality}
            onChange={e => setForm({ ...form, personality: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={2}
            placeholder="如：严谨、注重细节、善于发现潜在问题"
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">系统提示词（可选）</span>
          <textarea
            value={form.systemPrompt}
            onChange={e => setForm({ ...form, systemPrompt: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            rows={3}
            placeholder="额外的指令或上下文..."
          />
        </label>

        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700">Provider</span>
          <select
            value={form.provider}
            onChange={e => setForm({ ...form, provider: e.target.value as ProviderType })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="claude">Claude Code</option>
            <option value="codex">Codex</option>
          </select>
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">API Key（可选，留空用全局配置）</span>
          <input
            type="password"
            value={form.apiKey}
            onChange={e => setForm({ ...form, apiKey: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="sk-..."
          />
        </label>

        <label className="block mb-3">
          <span className="text-sm font-medium text-gray-700">Base URL（可选）</span>
          <input
            value={form.baseUrl}
            onChange={e => setForm({ ...form, baseUrl: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="如：https://api.openai.com/v1"
          />
        </label>

        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700">模型 ID（可选，留空用默认）</span>
          <input
            value={form.modelId}
            onChange={e => setForm({ ...form, modelId: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder={form.provider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-4o'}
          />
        </label>

        <label className="block mb-4">
          <span className="text-sm font-medium text-gray-700">工作目录（可选）</span>
          <input
            value={form.workDir}
            onChange={e => setForm({ ...form, workDir: e.target.value })}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="/Users/you/projects/my-project"
          />
          <span className="text-xs text-gray-400 mt-1 block">Agent 可读取此目录内容，输出也会写入此目录</span>
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">
            取消
          </button>
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">
            {isEdit ? '保存' : '创建'}
          </button>
        </div>
      </form>
    </div>
  )
}
