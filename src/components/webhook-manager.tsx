'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Webhook, ToggleLeft, ToggleRight } from 'lucide-react'

interface WebhookItem {
  id: string
  name: string
  pipelineId: string
  matchRules: string
  extractInput: string
  enabled: boolean
  createdAt: string
}

interface Pipeline {
  id: string
  name: string
}

export function WebhookManager() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [editing, setEditing] = useState<WebhookItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '',
    pipelineId: '',
    matchRules: '{}',
    extractInput: '{}',
    enabled: true,
  })

  useEffect(() => {
    fetchWebhooks()
    fetch('/api/pipelines').then(r => r.json()).then(setPipelines)
  }, [])

  async function fetchWebhooks() {
    const res = await fetch('/api/webhooks')
    if (res.ok) setWebhooks(await res.json())
  }

  function startCreate() {
    setEditing(null)
    setForm({ name: '', pipelineId: pipelines[0]?.id || '', matchRules: '{}', extractInput: '{}', enabled: true })
    setShowForm(true)
  }

  function startEdit(w: WebhookItem) {
    setEditing(w)
    setForm({
      name: w.name,
      pipelineId: w.pipelineId,
      matchRules: formatJson(w.matchRules),
      extractInput: formatJson(w.extractInput),
      enabled: w.enabled,
    })
    setShowForm(true)
  }

  function formatJson(s: string): string {
    try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
  }

  function isValidJson(s: string): boolean {
    try { JSON.parse(s); return true } catch { return false }
  }

  async function handleSave() {
    if (!form.name || !form.pipelineId) return
    if (!isValidJson(form.matchRules) || !isValidJson(form.extractInput)) return

    if (editing) {
      await fetch('/api/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          name: form.name,
          pipelineId: form.pipelineId,
          matchRules: JSON.parse(form.matchRules),
          extractInput: JSON.parse(form.extractInput),
          enabled: form.enabled,
        }),
      })
    } else {
      await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          pipelineId: form.pipelineId,
          matchRules: JSON.parse(form.matchRules),
          extractInput: JSON.parse(form.extractInput),
          enabled: form.enabled,
        }),
      })
    }
    setShowForm(false)
    fetchWebhooks()
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除？')) return
    await fetch(`/api/webhooks?id=${id}`, { method: 'DELETE' })
    fetchWebhooks()
  }

  async function handleToggle(w: WebhookItem) {
    await fetch('/api/webhooks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, enabled: !w.enabled }),
    })
    fetchWebhooks()
  }

  const pipelineName = (id: string) => pipelines.find(p => p.id === id)?.name || id.slice(0, 8)

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Webhook</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            入口: POST /api/webhook/incoming
          </p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus size={12} /> 新建
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {webhooks.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">暂无 Webhook 配置</p>
        )}
        {webhooks.map(w => (
          <div
            key={w.id}
            className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Webhook size={14} className={w.enabled ? 'text-blue-500' : 'text-gray-300'} />
                <span className="text-sm font-medium text-gray-800">{w.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggle(w)}
                  className="p-1 rounded hover:bg-gray-100"
                  title={w.enabled ? '禁用' : '启用'}
                >
                  {w.enabled
                    ? <ToggleRight size={16} className="text-green-500" />
                    : <ToggleLeft size={16} className="text-gray-400" />
                  }
                </button>
                <button
                  onClick={() => startEdit(w)}
                  className="p-1 rounded hover:bg-gray-100 text-xs text-blue-600"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(w.id)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              Pipeline: {pipelineName(w.pipelineId)}
            </div>
            <div className="mt-1 text-xs text-gray-400 font-mono truncate">
              match: {w.matchRules}
            </div>
          </div>
        ))}
      </div>

      {/* 编辑表单 */}
      {showForm && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500">名称</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded"
                placeholder="GitLab MR 触发代码审查"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Pipeline</label>
              <select
                value={form.pipelineId}
                onChange={e => setForm({ ...form, pipelineId: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded"
              >
                {pipelines.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Match Rules (JSON)</label>
            <textarea
              value={form.matchRules}
              onChange={e => setForm({ ...form, matchRules: e.target.value })}
              className={`w-full mt-1 px-2 py-1 text-xs border rounded font-mono h-16 resize-none ${
                isValidJson(form.matchRules) ? 'border-gray-300' : 'border-red-400'
              }`}
              placeholder='{"headers.x-gitlab-event": "Merge Request Hook"}'
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Extract Input (JSON)</label>
            <textarea
              value={form.extractInput}
              onChange={e => setForm({ ...form, extractInput: e.target.value })}
              className={`w-full mt-1 px-2 py-1 text-xs border rounded font-mono h-16 resize-none ${
                isValidJson(form.extractInput) ? 'border-gray-300' : 'border-red-400'
              }`}
              placeholder='{"MR_URL": "body.object_attributes.url"}'
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
