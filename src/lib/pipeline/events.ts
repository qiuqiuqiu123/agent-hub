import { EventEmitter } from 'events'

export type PipelineSSEEvent =
  | { type: 'step_start'; stepId: string; timestamp: number }
  | { type: 'step_complete'; stepId: string; status: string; output?: string; usage?: { inputTokens: number; outputTokens: number }; timestamp: number }
  | { type: 'run_complete'; status: string; error?: string; timestamp: number }

const pipelineEvents = new EventEmitter()
pipelineEvents.setMaxListeners(100)

export function emitPipelineEvent(runId: string, event: PipelineSSEEvent) {
  pipelineEvents.emit(runId, event)
}

export function onPipelineEvent(runId: string, listener: (event: PipelineSSEEvent) => void) {
  pipelineEvents.on(runId, listener)
  return () => pipelineEvents.off(runId, listener)
}
