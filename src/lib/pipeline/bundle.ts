import { db } from '@/db'
import { agents, pipelines } from '@/db/schema'
import { generateId } from '@/lib/constants'
import { eq, or } from 'drizzle-orm'
import type { PipelineConfig, PipelineStep, SingleStep } from './types'

export interface PipelineBundleAgent {
  refId: string
  name: string
  type: 'ai' | 'tool'
  provider: string
  role: string
  personality: string
  systemPrompt: string
  modelId?: string
  config?: string
}

export interface PipelineBundle {
  $schema: string
  version: '1'
  name: string
  description?: string
  input?: PipelineConfig['input']
  steps: PipelineBundleStep[]
  git: PipelineConfig['git']
  agents: PipelineBundleAgent[]
}

type PipelineBundleStep =
  | (Omit<SingleStep, 'agentId'> & { agentRef: string })
  | { id: string; type: 'parallel'; steps: Array<Omit<SingleStep, 'type' | 'dependsOn' | 'agentId'> & { agentRef: string }>; dependsOn?: string[]; onFailure?: SingleStep['onFailure'] }
  | Extract<PipelineStep, { type: 'condition' }>

export async function exportBundle(pipelineId: string): Promise<PipelineBundle | null> {
  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.id, pipelineId))
  if (!pipeline) return null

  const config: PipelineConfig = JSON.parse(pipeline.config)
  const agentIds = collectAgentIds(config.steps)
  const agentRows = await Promise.all(
    agentIds.map(async agentId => (await db.select().from(agents).where(eq(agents.id, agentId)))[0])
  )
  const existingAgents = agentRows.filter(agent => Boolean(agent))
  const refByAgentId = new Map(existingAgents.map(agent => [agent.id, toRefId(agent.name, agent.id)]))

  return {
    $schema: './pipeline.schema.json',
    version: '1',
    name: pipeline.name,
    description: pipeline.description,
    input: config.input,
    steps: replaceAgentIds(config.steps, refByAgentId),
    git: config.git,
    agents: existingAgents.map(agent => ({
      refId: refByAgentId.get(agent.id)!,
      name: agent.name,
      type: agent.type,
      provider: agent.provider,
      role: agent.role,
      personality: agent.personality,
      systemPrompt: agent.systemPrompt,
      modelId: agent.modelId || undefined,
      config: agent.config || '{}',
    })),
  }
}

export async function importBundle(bundle: PipelineBundle) {
  validateBundle(bundle)

  const agentIdByRef = new Map<string, string>()
  for (const agent of bundle.agents || []) {
    const [existing] = await db
      .select()
      .from(agents)
      .where(or(eq(agents.name, agent.name), eq(agents.id, agent.refId)))

    if (existing) {
      agentIdByRef.set(agent.refId, existing.id)
      continue
    }

    const id = generateId()
    const now = new Date()
    await db.insert(agents).values({
      id,
      name: agent.name,
      type: agent.type,
      provider: agent.provider,
      role: agent.role,
      personality: agent.personality,
      systemPrompt: agent.systemPrompt || '',
      modelId: agent.modelId || '',
      config: agent.config || '{}',
      apiKey: '',
      baseUrl: '',
      workDir: '',
      createdAt: now,
      updatedAt: now,
    })
    agentIdByRef.set(agent.refId, id)
  }

  const config: PipelineConfig = {
    version: '1',
    input: bundle.input,
    steps: restoreAgentIds(bundle.steps, agentIdByRef),
    git: bundle.git,
  }

  const id = generateId()
  const now = new Date()
  await db.insert(pipelines).values({
    id,
    name: bundle.name,
    description: bundle.description || '',
    config: JSON.stringify(config),
    createdAt: now,
    updatedAt: now,
  })

  return (await db.select().from(pipelines).where(eq(pipelines.id, id)))[0]
}

function validateBundle(bundle: PipelineBundle) {
  if (!bundle || bundle.version !== '1') throw new Error('仅支持 version=1 的 pipeline bundle')
  if (!bundle.name) throw new Error('bundle.name required')
  if (!Array.isArray(bundle.steps)) throw new Error('bundle.steps required')
  if (!bundle.git || typeof bundle.git.enabled !== 'boolean') throw new Error('bundle.git required')
}

function collectAgentIds(steps: PipelineStep[]): string[] {
  const ids = new Set<string>()
  for (const step of steps) {
    if (step.type === 'single') ids.add(step.agentId)
    if (step.type === 'parallel') step.steps.forEach(sub => ids.add(sub.agentId))
  }
  return Array.from(ids)
}

function replaceAgentIds(steps: PipelineStep[], refByAgentId: Map<string, string>): PipelineBundleStep[] {
  return steps.map(step => {
    if (step.type === 'single') {
      const { agentId, ...rest } = step
      return { ...rest, agentRef: refByAgentId.get(agentId) || agentId }
    }
    if (step.type === 'parallel') {
      return {
        ...step,
        steps: step.steps.map(sub => {
          const { agentId, ...rest } = sub
          return { ...rest, agentRef: refByAgentId.get(agentId) || agentId }
        }),
      }
    }
    return step
  })
}

function restoreAgentIds(steps: PipelineBundleStep[], agentIdByRef: Map<string, string>): PipelineStep[] {
  return steps.map(step => {
    if (step.type === 'single') {
      const { agentRef, ...rest } = step
      const agentId = agentIdByRef.get(agentRef)
      if (!agentId) throw new Error(`未知 agentRef: ${agentRef}`)
      return { ...rest, agentId }
    }
    if (step.type === 'parallel') {
      return {
        ...step,
        steps: step.steps.map(sub => {
          const { agentRef, ...rest } = sub
          const agentId = agentIdByRef.get(agentRef)
          if (!agentId) throw new Error(`未知 agentRef: ${agentRef}`)
          return { ...rest, agentId }
        }),
      }
    }
    return step
  })
}

function toRefId(name: string, fallback: string) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return normalized || fallback
}
