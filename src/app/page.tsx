'use client'

import { useEffect, useState } from 'react'
import { useAgentStore } from '@/store/agent-store'
import { AgentList } from '@/components/agent-list'
import { TaskStatusBar } from '@/components/task-status-bar'
import { ChatPanel } from '@/components/chat-panel'
import { ContextPanel } from '@/components/context-panel'
import { PipelineEditor } from '@/components/pipeline-editor'
import { ScheduleManager } from '@/components/schedule-manager'
import { WebhookManager } from '@/components/webhook-manager'

type Tab = 'agents' | 'pipelines' | 'schedules' | 'webhooks'

export default function HomePage() {
  const { selectedAgentId, setAgents, setSkills } = useAgentStore()
  const [tab, setTab] = useState<Tab>('agents')

  useEffect(() => {
    fetch('/api/agents').then(r => r.json()).then(setAgents)
    fetch('/api/skills').then(r => r.json()).then(setSkills)
  }, [setAgents, setSkills])

  return (
    <div className="flex h-screen">
      {/* 左侧导航 */}
      <aside className="w-72 border-r border-gray-200 bg-white flex flex-col">
        {/* Tab 切换 */}
        <div className="flex border-b border-gray-200">
          {(['agents', 'pipelines', 'schedules', 'webhooks'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-xs font-medium ${tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            >
              {t === 'agents' ? 'Agents' : t === 'pipelines' ? 'Pipelines' : t === 'schedules' ? '定时' : 'Webhook'}
            </button>
          ))}
        </div>

        {tab === 'agents' && <AgentList />}
        {tab !== 'agents' && (
          <div className="flex-1 flex items-center justify-center text-xs text-gray-400 p-4">
            {tab === 'pipelines' && 'Pipeline 编辑器在右侧主区域'}
            {tab === 'schedules' && '定时任务管理在右侧主区域'}
            {tab === 'webhooks' && 'Webhook 管理在右侧主区域'}
          </div>
        )}
      </aside>

      {/* 右侧主区域 */}
      <main className="flex-1 flex flex-col">
        {tab === 'pipelines' ? (
          <PipelineEditor />
        ) : tab === 'schedules' ? (
          <ScheduleManager />
        ) : tab === 'webhooks' ? (
          <WebhookManager />
        ) : selectedAgentId ? (
          <>
            <TaskStatusBar />
            <div className="flex-1 flex min-h-0">
              <ChatPanel />
              <ContextPanel />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            选择一个 Agent 开始对话
          </div>
        )}
      </main>
    </div>
  )
}
