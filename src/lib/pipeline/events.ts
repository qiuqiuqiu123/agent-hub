import { EventEmitter } from 'events'

export type PipelineSSEEvent =
  | { type: 'step_start'; stepId: string; timestamp: number }
  | { type: 'step_progress'; stepId: string; message: string; tokens?: { inputTokens: number; outputTokens: number }; timestamp: number }
  | { type: 'step_complete'; stepId: string; status: string; output?: string; usage?: { inputTokens: number; outputTokens: number }; timestamp: number }
  | { type: 'run_complete'; status: string; error?: string; timestamp: number }

// Use globalThis to survive HMR and ensure single instance across all route handlers
const globalKey = '__pipeline_events__'
function getEmitter(): EventEmitter {
  if (!(globalThis as Record<string, unknown>)[globalKey]) {
    const emitter = new EventEmitter()
    emitter.setMaxListeners(100)
    ;(globalThis as Record<string, unknown>)[globalKey] = emitter
  }
  return (globalThis as Record<string, unknown>)[globalKey] as EventEmitter
}

export function emitPipelineEvent(runId: string, event: PipelineSSEEvent) {
  const emitter = getEmitter()
  emitter.emit(runId, event)
}

export function onPipelineEvent(runId: string, listener: (event: PipelineSSEEvent) => void) {
  const emitter = getEmitter()
  emitter.on(runId, listener)
  return () => emitter.off(runId, listener)
}
