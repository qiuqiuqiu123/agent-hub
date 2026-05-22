'use client'

import { useState, useEffect } from 'react'
import { Play, Square, Clock, CheckCircle, XCircle, SkipForward } from 'lucide-react'

interface PipelineRun {
  id: string
  status: string
  branch: string | null
  startedAt: string
  completedAt: string | null
  error: string | null
  steps: StepRun[]
}

interface StepRun {
  id: string
  stepId: string
  agentId: string
  status: string
  prompt: string
  output: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
}

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock size={14} className="text-gray-400" />,
  running: <Play size={14} className="text-blue-500 animate-pulse" />,
  completed: <CheckCircle size={14} className="text-green-500" />,
  failed: <XCircle size={14} className="text-red-500" />,
  skipped: <SkipForward size={14} className="text-gray-400" />,
  cancelled: <Square size={14} className="text-orange-500" />,
}

export function PipelineRunView({ pipelineId }: { pipelineId: string }) {
  const [runs, setRuns] = useState<PipelineRun[]>([])
  const [selectedRun, setSelectedRun] = useState<PipelineRun | null>(null)

  useEffect(() => {
    fetchRuns()
    const interval = setInterval(fetchRuns, 3000)
    return () => clearInterval(interval)
  }, [pipelineId])

  async function fetchRuns() {
    const res = await fetch(`/api/pipelines/${pipelineId}/runs`)
    if (res.ok) {
      const data = await res.json()
      setRuns(data)
      if (data.length > 0 && !selectedRun) {
        setSelectedRun(data[0])
      }
    }
  }

  if (runs.length === 0) {
    return <div className="text-sm text-gray-500 p-4">暂无执行记录</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Run 列表 */}
      <div className="border-b border-gray-200 p-3">
        <div className="flex gap-2 overflow-x-auto">
          {runs.map(run => (
            <button
              key={run.id}
              onClick={() => setSelectedRun(run)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs whitespace-nowrap border ${
                selectedRun?.id === run.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              {statusIcon[run.status]}
              <span>{new Date(run.startedAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              {run.branch && <span className="text-gray-400 ml-1">{run.branch.split('/').pop()}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Step 详情 */}
      {selectedRun && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4">
            {statusIcon[selectedRun.status]}
            <span className="text-sm font-medium">{selectedRun.status}</span>
            {selectedRun.branch && (
              <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">{selectedRun.branch}</code>
            )}
            {selectedRun.error && (
              <span className="text-xs text-red-500 ml-2">{selectedRun.error}</span>
            )}
          </div>

          <div className="space-y-3">
            {selectedRun.steps.map(step => (
              <div key={step.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  {statusIcon[step.status]}
                  <span className="text-sm font-medium">{step.stepId}</span>
                  {step.startedAt && step.completedAt && (
                    <span className="text-xs text-gray-400 ml-auto">
                      {Math.round((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000)}s
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mb-1 truncate">{step.prompt}</div>
                {step.output && (
                  <pre className="text-xs bg-gray-50 p-2 rounded mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap">
                    {step.output.slice(0, 500)}
                  </pre>
                )}
                {step.error && (
                  <div className="text-xs text-red-500 mt-1">{step.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
