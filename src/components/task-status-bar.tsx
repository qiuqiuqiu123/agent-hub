'use client'

import { useState } from 'react'
import { useAgentStore } from '@/store/agent-store'
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS } from '@/lib/constants'
import type { TaskStatus } from '@/types'
import { Plus, Play, Pause, CheckCircle, XCircle } from 'lucide-react'

const STATUS_ORDER: TaskStatus[] = ['pending', 'running', 'paused', 'completed', 'unknown']

export function TaskStatusBar() {
  const { tasks, selectedAgentId, setTasks } = useAgentStore()
  const [showForm, setShowForm] = useState(false)

  const grouped = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = tasks.filter(t => t.status === status)
    return acc
  }, {} as Record<TaskStatus, typeof tasks>)

  async function updateStatus(taskId: string, status: TaskStatus) {
    await fetch('/api/tasks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: taskId, status }),
    })
    const res = await fetch(`/api/tasks?agentId=${selectedAgentId}`)
    setTasks(await res.json())
  }

  async function handleCreateTask(title: string) {
    if (!selectedAgentId || !title.trim()) return
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: selectedAgentId, title }),
    })
    const res = await fetch(`/api/tasks?agentId=${selectedAgentId}`)
    setTasks(await res.json())
    setShowForm(false)
  }

  return (
    <div className="border-b border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm text-gray-700">任务状态</h3>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
        >
          <Plus size={14} /> 新任务
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto">
        {STATUS_ORDER.map(status => (
          <div key={status} className="min-w-[140px]">
            <div className={`text-xs font-medium px-2 py-1 rounded mb-2 ${TASK_STATUS_COLORS[status]}`}>
              {TASK_STATUS_LABELS[status]} ({grouped[status].length})
            </div>
            <div className="space-y-1">
              {grouped[status].map(task => (
                <div key={task.id} className="text-xs p-2 bg-gray-50 rounded border border-gray-100 group">
                  <div className="truncate">{task.title}</div>
                  <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {status !== 'running' && (
                      <button onClick={() => updateStatus(task.id, 'running')} title="执行">
                        <Play size={12} className="text-blue-500" />
                      </button>
                    )}
                    {status === 'running' && (
                      <button onClick={() => updateStatus(task.id, 'paused')} title="暂停">
                        <Pause size={12} className="text-yellow-500" />
                      </button>
                    )}
                    {status !== 'completed' && (
                      <button onClick={() => updateStatus(task.id, 'completed')} title="完成">
                        <CheckCircle size={12} className="text-green-500" />
                      </button>
                    )}
                    {status !== 'unknown' && (
                      <button onClick={() => updateStatus(task.id, 'unknown')} title="未知">
                        <XCircle size={12} className="text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && <TaskForm onSubmit={handleCreateTask} onClose={() => setShowForm(false)} />}
    </div>
  )
}

function TaskForm({ onSubmit, onClose }: { onSubmit: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')

  return (
    <div className="mt-3 flex gap-2">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onSubmit(title)}
        placeholder="任务标题..."
        className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5"
      />
      <button onClick={() => onSubmit(title)} className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded">
        添加
      </button>
      <button onClick={onClose} className="text-sm px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded">
        取消
      </button>
    </div>
  )
}
