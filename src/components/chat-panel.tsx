'use client'

import { useState, useRef, useEffect } from 'react'
import { useAgentStore } from '@/store/agent-store'
import { generateId } from '@/lib/constants'
import { Send, Loader2, Terminal, MessageSquare } from 'lucide-react'
import { ExecutionTrace } from './execution-trace'

type ChatMode = 'chat' | 'terminal'

export function ChatPanel() {
  const { selectedAgentId, messages, addMessage, appendToLastMessage, addUsage, addUsedSkill } = useAgentStore()
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [mode, setMode] = useState<ChatMode>('chat')
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || !selectedAgentId || isStreaming) return

    const userContent = input.trim()
    setInput('')

    const assistantMsgId = generateId()
    setCurrentMessageId(assistantMsgId)

    addMessage({
      id: generateId(),
      agentId: selectedAgentId,
      role: 'user',
      content: mode === 'terminal' ? `$ ${userContent}` : userContent,
      createdAt: new Date(),
    })

    addMessage({
      id: assistantMsgId,
      agentId: selectedAgentId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    })

    setIsStreaming(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgentId, content: userContent, mode }),
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) return

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.text) {
                appendToLastMessage(parsed.text)
              }
              if (parsed.error) {
                appendToLastMessage(`\n[错误: ${parsed.error}]`)
              }
              if (parsed.usage) {
                addUsage(parsed.usage.input, parsed.usage.output)
              }
              if (parsed.log?.type === 'skill') {
                addUsedSkill(parsed.log.name)
              }
              // log 事件会触发 ExecutionTrace 组件重新获取
            } catch { /* ignore */ }
          }
        }
      }
    } catch (error) {
      appendToLastMessage(`\n[错误: ${error instanceof Error ? error.message : '请求失败'}]`)
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* 模式切换 */}
      <div className="flex items-center gap-1 px-4 pt-3">
        <button
          onClick={() => setMode('chat')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === 'chat' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <MessageSquare size={14} />
          对话模式
        </button>
        <button
          onClick={() => setMode('terminal')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            mode === 'terminal' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Terminal size={14} />
          终端模式
        </button>
      </div>

      {/* 消息列表 */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${mode === 'terminal' ? 'bg-gray-900' : ''}`}>
        {messages.map(msg => (
          <div key={msg.id}>
            {mode === 'terminal' ? (
              <div className={`font-mono text-sm whitespace-pre-wrap ${
                msg.role === 'user' ? 'text-green-400' : 'text-gray-300'
              }`}>
                {msg.content || (isStreaming ? '▊' : '')}
              </div>
            ) : (
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {msg.content || (isStreaming ? '...' : '')}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 执行轨迹 */}
      {mode === 'chat' && currentMessageId && <ExecutionTrace messageId={currentMessageId} />}

      {/* 输入框 */}
      <div className={`border-t p-4 ${mode === 'terminal' ? 'bg-gray-900 border-gray-700' : 'border-gray-200'}`}>
        <div className="flex gap-2">
          {mode === 'terminal' && (
            <span className="flex items-center text-green-400 font-mono text-sm">$</span>
          )}
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={mode === 'terminal' ? '输入命令...' : '输入消息...'}
            disabled={isStreaming}
            className={`flex-1 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 ${
              mode === 'terminal'
                ? 'bg-gray-800 border-gray-600 text-green-400 font-mono focus:ring-green-500 border'
                : 'border border-gray-300 focus:ring-blue-500'
            }`}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className={`px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === 'terminal'
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isStreaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <div className="mt-2 text-[11px] text-gray-400">
          {mode === 'terminal'
            ? '直接执行 shell 命令，工作目录为 Agent 配置的工作目录'
            : 'Agent 通过 Claude Code / Codex CLI 处理请求，具备完整代码能力'}
        </div>
      </div>
    </div>
  )
}
