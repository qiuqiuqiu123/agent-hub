'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Play, Pause, Clock } from 'lucide-react'

interface Schedule {
  id: string
  pipelineId: string
  name: string
  cron: string
  input: string
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdAt: string
}

interface Pipeline {
  id: string
  name: string
}

export function ScheduleManager() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [editing, setEditing] = useState<Schedule | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', pipelineId: '', cron: '', input: '{}', enabled: true })

  useEffect(() => {
    fetchSchedules()
    fetch('/api/pipelines').then(r => r.json()).then(setPipelines)
  }, [])

  async function fetchSchedules() {
    const res = await fetch('/api/schedules')
    if (res.ok) setSchedules(await res.json())
  }

  function startCreate() {
    setEditing(null)
    setForm({ name: '', pipelineId: pipelines[0]?.id || '', cron: '0 9 * * *', input: '{}', enabled: true })
    setShowForm(true)
  }

  function startEdit(s: Schedule) {
    setEditing(s)
    setForm({ name: s.name, pipelineId: s.pipelineId, cron: s.cron, input: s.input, enabled: s.enabled })
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name || !form.pipelineId || !form.cron) return
    try { JSON.parse(form.input) } catch { return }

    if (editing) {
      await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...form, input: JSON.parse(form.input) }),
      })
    } else {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, input: JSON.parse(form.input) }),
      })
    }
    setShowForm(false)
    fetchSchedules()
  }

  async function handleDelete(id: string) {
    if (!confirm('确认删除？')) return
    await fetch(`/api/schedules?id=${id}`, { method: 'DELETE' })
    fetchSchedules()
  }

  async function handleToggle(s: Schedule) {
    await fetch('/api/schedules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id, enabled: !s.enabled }),
    })
    fetchSchedules()
  }

  const pipelineName = (id: string) => pipelines.find(p => p.id === id)?.name || id.slice(0, 8)

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700">定时任务</h2>
        <button
          onClick={startCreate}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Plus size={12} /> 新建
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {schedules.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-8">暂无定时任务</p>
        )}
        {schedules.map(s => (
          <div
            key={s.id}
            className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock size={14} className={s.enabled ? 'text-green-500' : 'text-gray-300'} />
                <span className="text-sm font-medium text-gray-800">{s.name}</span>
                <span className="text-xs text-gray-400 font-mono">{s.cron}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggle(s)}
                  className="p-1 rounded hover:bg-gray-100"
                  title={s.enabled ? '暂停' : '启用'}
                >
                  {s.enabled ? <Pause size={12} className="text-yellow-500" /> : <Play size={12} className="text-green-500" />}
                </button>
                <button
                  onClick={() => startEdit(s)}
                  className="p-1 rounded hover:bg-gray-100 text-xs text-blue-600"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <Trash2 size={12} className="text-red-400" />
                </button>
              </div>
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              <span>Pipeline: {pipelineName(s.pipelineId)}</span>
              {s.lastRunAt && <span>上次: {new Date(s.lastRunAt).toLocaleString('zh-CN')}</span>}
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
                placeholder="每日代码审查"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">Cron 表达式</label>
              <input
                value={form.cron}
                onChange={e => setForm({ ...form, cron: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded font-mono"
                placeholder="0 9 * * 1-5"
              />
            </div>
          </div>
          <div className="flex gap-3">
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
            <div className="flex-1">
              <label className="text-xs text-gray-500">Input (JSON)</label>
              <input
                value={form.input}
                onChange={e => setForm({ ...form, input: e.target.value })}
                className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded font-mono"
                placeholder='{"KEY": "value"}'
              />
            </div>
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
