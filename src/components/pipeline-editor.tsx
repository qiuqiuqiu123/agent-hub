'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Play, ChevronRight, GitBranch } from 'lucide-react'
import { PipelineRunView } from './pipeline-run-view'

interface Pipeline {
  id: string
  name: string
  description: string
  config: string
  createdAt: string
}

export function PipelineEditor() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selected, setSelected] = useState<Pipeline | null>(null)
  const [configText, setConfigText] = useState('')
  const [showRuns, setShowRuns] = useState(false)
  const [error, setError] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPipelines()
  }, [])

  async function fetchPipelines() {
    const res = await fetch('/api/pipelines')
    if (res.ok) setPipelines(await res.json())
  }

  function selectPipeline(p: Pipeline) {
    setSelected(p)
    setConfigText(formatConfig(p.config))
    setShowRuns(false)
    setError('')
  }

  function formatConfig(config: string): string {
    try {
      return JSON.stringify(JSON.parse(config), null, 2)
    } catch {
      return config
    }
  }

  const validateConfig = useCallback((text: string): boolean => {
    try {
      const parsed = JSON.parse(text)
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        setError('config 必须包含 steps 数组')
        return false
      }
      if (!parsed.git || typeof parsed.git.enabled !== 'boolean') {
        setError('config 必须包含 git 配置')
        return false
      }
      setError('')
      return true
    } catch (e) {
      setError(`JSON 解析错误: ${(e as Error).message}`)
      return false
    }
  }, [])

  async function handleSave() {
    if (!selected || !validateConfig(configText)) return
    await fetch('/api/pipelines', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selected.id, config: configText }),
    })
    fetchPipelines()
  }

  async function handleCreate() {
    const name = prompt('Pipeline 名称:')
    if (!name) return

    const defaultConfig = JSON.stringify({
      steps: [
        { id: 'step-1', type: 'single', agentId: '', prompt: '{{TASK}}', promptArgs: { TASK: '' } }
      ],
      git: { enabled: true, baseBranch: 'main', autoMerge: false }
    }, null, 2)

    const res = await fetch('/api/pipelines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config: defaultConfig }),
    })
    if (res.ok) {
      fetchPipelines()
      const created = await res.json()
      selectPipeline(created)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/pipelines?id=${id}`, { method: 'DELETE' })
    if (selected?.id === id) {
      setSelected(null)
      setConfigText('')
    }
    fetchPipelines()
  }

  async function handleRun() {
    if (!selected) return
    const res = await fetch(`/api/pipelines/${selected.id}/run`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setActiveRunId(data.runId || null)
      setShowRuns(true)
    }
  }

  async function handleExport() {
    if (!selected) return
    window.location.href = `/api/pipelines/${selected.id}/export`
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    const res = await fetch('/api/pipelines/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: text,
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || '导入失败')
      return
    }
    const created = await res.json()
    await fetchPipelines()
    selectPipeline(created)
  }

  // 从 config 解析出流程预览
  function renderPreview() {
    try {
      const config = JSON.parse(configText)
      const steps = config.steps || []
      return (
        <div className="space-y-2">
          {steps.map((step: Record<string, unknown>, i: number) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={12} className="text-gray-400" />}
              <div className={`text-xs px-2 py-1 rounded border ${
                step.type === 'parallel' ? 'border-purple-200 bg-purple-50' : 'border-blue-200 bg-blue-50'
              }`}>
                <span className="font-medium">{step.id as string}</span>
                <span className="text-gray-500 ml-1">({step.type as string})</span>
              </div>
            </div>
          ))}
          {config.git?.enabled && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mt-2">
              <GitBranch size={12} />
              <span>分支: {config.git.baseBranch}</span>
              {config.git.autoMerge && <span className="text-green-600 ml-1">自动合并</span>}
            </div>
          )}
        </div>
      )
    } catch {
      return null
    }
  }

  return (
    <div className="flex h-full">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleImportFile(file)
          e.currentTarget.value = ''
        }}
      />
      {/* 左侧 Pipeline 列表 */}
      <div className="w-56 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-medium">Pipelines</span>
          <div className="flex items-center gap-1">
            <button onClick={() => importInputRef.current?.click()} className="text-xs px-1.5 py-1 rounded hover:bg-gray-100">
              导入
            </button>
            <button onClick={handleCreate} className="p-1 rounded hover:bg-gray-100">
              <Plus size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {pipelines.map(p => (
            <div
              key={p.id}
              onClick={() => selectPipeline(p)}
              className={`flex items-center justify-between px-3 py-2 cursor-pointer border-b border-gray-50 hover:bg-gray-50 ${
                selected?.id === p.id ? 'bg-blue-50' : ''
              }`}
            >
              <span className="text-sm truncate">{p.name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                className="p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧编辑区 */}
      <div className="flex-1 flex flex-col">
        {selected ? (
          <>
            <div className="p-3 border-b border-gray-200 flex items-center gap-3">
              <h3 className="text-sm font-medium">{selected.name}</h3>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => setShowRuns(!showRuns)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  {showRuns ? '编辑' : '执行记录'}
                </button>
                <button
                  onClick={() => importInputRef.current?.click()}
                  className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  导入
                </button>
                <button
                  onClick={handleExport}
                  className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  导出 JSON
                </button>
                <button
                  onClick={handleSave}
                  className="text-xs px-2 py-1 rounded bg-gray-800 text-white hover:bg-gray-700"
                >
                  保存
                </button>
                <button
                  onClick={handleRun}
                  className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
                >
                  <Play size={12} /> 运行
                </button>
              </div>
            </div>

            {showRuns ? (
              <PipelineRunView pipelineId={selected.id} activeRunId={activeRunId} />
            ) : (
              <div className="flex-1 flex">
                {/* JSON 编辑器 */}
                <div className="flex-1 flex flex-col border-r border-gray-200">
                  <textarea
                    value={configText}
                    onChange={e => { setConfigText(e.target.value); validateConfig(e.target.value) }}
                    className="flex-1 p-4 font-mono text-xs resize-none focus:outline-none"
                    spellCheck={false}
                  />
                  {error && (
                    <div className="px-4 py-2 text-xs text-red-500 border-t border-gray-200 bg-red-50">
                      {error}
                    </div>
                  )}
                </div>

                {/* 预览面板 */}
                <div className="w-64 p-4">
                  <div className="text-xs font-medium text-gray-500 mb-3">流程预览</div>
                  {renderPreview()}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            选择或创建一个 Pipeline
          </div>
        )}
      </div>
    </div>
  )
}
