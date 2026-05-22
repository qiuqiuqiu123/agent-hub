'use client'

import { useEffect } from 'react'
import { useAgentStore } from '@/store/agent-store'
import { Activity, Zap, Wrench, ListTodo } from 'lucide-react'
import { TASK_STATUS_COLORS, TASK_STATUS_LABELS } from '@/lib/constants'
import type { TaskStatus } from '@/types'

export function ContextPanel() {
  const { selectedAgentId, sessionUsage, usedSkills, tasks, setTasks } = useAgentStore()

  // 每 3 秒轮询 tasks
  useEffect(() => {
    if (!selectedAgentId) return

    const fetchTasks = () => {
      fetch(`/api/tasks?agentId=${selectedAgentId}`)
        .then(r => r.json())
        .then(setTasks)
        .catch(() => {})
    }

    fetchTasks()
    const interval = setInterval(fetchTasks, 3000)
    return () => clearInterval(interval)
  }, [selectedAgentId, setTasks])

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return String(n)
  }

  return (
    <div className="w-64 border-l border-gray-200 bg-gray-50 flex flex-col overflow-y-auto">
      {/* 上下文 Token */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={14} className="text-blue-500" />
          <span className="text-xs font-medium text-gray-700">上下文 Token</span>
        </div>
        <div className="text-2xl font-bold text-blue-600">
          {formatTokens(sessionUsage.inputTokens)}
        </div>
      </div>

      {/* 消耗 Token */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Zap size={14} className="text-orange-500" />
          <span className="text-xs font-medium text-gray-700">消耗 Token</span>
        </div>
        <div className="text-2xl font-bold text-orange-600">
          {formatTokens(sessionUsage.outputTokens)}
        </div>
      </div>

      {/* 使用的 Skill */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Wrench size={14} className="text-purple-500" />
          <span className="text-xs font-medium text-gray-700">使用的 Skill</span>
        </div>
        {usedSkills.length === 0 ? (
          <div className="text-xs text-gray-400">暂无</div>
        ) : (
          <div className="space-y-1">
            {usedSkills.map(skill => (
              <div key={skill} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded">
                {skill}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Todo 列表 */}
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-2">
          <ListTodo size={14} className="text-green-500" />
          <span className="text-xs font-medium text-gray-700">Todo 列表</span>
          <span className="text-[10px] text-gray-400 ml-auto">自动刷新</span>
        </div>
        {tasks.length === 0 ? (
          <div className="text-xs text-gray-400">暂无任务</div>
        ) : (
          <div className="space-y-1.5">
            {tasks.map(task => (
              <div key={task.id} className="text-xs p-2 bg-white rounded border border-gray-100">
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${getStatusDot(task.status as TaskStatus)}`} />
                  <span className="truncate flex-1">{task.title}</span>
                </div>
                <div className={`text-[10px] mt-0.5 ${TASK_STATUS_COLORS[task.status as TaskStatus] || 'text-gray-400'}`}>
                  {TASK_STATUS_LABELS[task.status as TaskStatus] || task.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getStatusDot(status: TaskStatus): string {
  switch (status) {
    case 'running': return 'bg-blue-500'
    case 'completed': return 'bg-green-500'
    case 'paused': return 'bg-yellow-500'
    case 'pending': return 'bg-gray-400'
    default: return 'bg-red-400'
  }
}
