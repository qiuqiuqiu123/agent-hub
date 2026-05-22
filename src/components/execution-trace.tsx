'use client'

import { useState, useEffect } from 'react'
import { Wrench, Users, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

interface ExecutionLog {
  id: string
  sequence: number
  type: 'skill' | 'agent' | 'tool'
  targetName: string
  input?: string
  output?: string
  status: 'pending' | 'running' | 'success' | 'error'
  error?: string
  startedAt: Date
  completedAt?: Date
}

interface Props {
  messageId: string
}

export function ExecutionTrace({ messageId }: Props) {
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (!messageId) return
    fetch(`/api/execution-logs?messageId=${messageId}`)
      .then(r => r.json())
      .then(setLogs)
  }, [messageId])

  if (logs.length === 0) return null

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        执行轨迹 ({logs.length} 步)
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {logs.map((log, idx) => (
            <div key={log.id} className="flex items-start gap-2 text-xs">
              <span className="text-gray-400 font-mono w-6">{idx + 1}.</span>

              {log.type === 'tool' && <Wrench size={14} className="text-blue-500 mt-0.5" />}
              {log.type === 'skill' && <Wrench size={14} className="text-purple-500 mt-0.5" />}
              {log.type === 'agent' && <Users size={14} className="text-green-500 mt-0.5" />}

              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700">{log.targetName}</span>
                  {log.status === 'running' && <Loader2 size={12} className="animate-spin text-blue-500" />}
                  {log.status === 'success' && <CheckCircle size={12} className="text-green-500" />}
                  {log.status === 'error' && <XCircle size={12} className="text-red-500" />}
                </div>

                {log.input && (
                  <div className="mt-1 text-gray-500 truncate">
                    输入: {log.input.length > 100 ? log.input.slice(0, 100) + '...' : log.input}
                  </div>
                )}

                {log.error && (
                  <div className="mt-1 text-red-600">错误: {log.error}</div>
                )}

                {log.completedAt && (
                  <div className="mt-1 text-gray-400">
                    耗时: {Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000)}s
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
