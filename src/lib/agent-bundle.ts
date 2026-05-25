import { db } from '@/db'
import { agentSkills, agents, skills } from '@/db/schema'
import { generateId } from '@/lib/constants'
import { eq } from 'drizzle-orm'

export interface AgentBundleItem {
  name: string
  type: 'ai' | 'tool'
  provider: string
  role: string
  personality: string
  systemPrompt: string
  modelId?: string
  skills?: string[]
  config?: string
}

export interface AgentBundle {
  agents: AgentBundleItem[]
}

export async function exportAgents(ids?: string[]): Promise<AgentBundle> {
  const allAgents = await db.select().from(agents).orderBy(agents.createdAt)
  const selectedAgents = ids?.length
    ? allAgents.filter(agent => ids.includes(agent.id))
    : allAgents

  const bundleAgents = await Promise.all(selectedAgents.map(async agent => {
    const skillRows = await db
      .select({ skill: skills })
      .from(agentSkills)
      .innerJoin(skills, eq(agentSkills.skillId, skills.id))
      .where(eq(agentSkills.agentId, agent.id))

    return {
      name: agent.name,
      type: agent.type,
      provider: agent.provider,
      role: agent.role,
      personality: agent.personality,
      systemPrompt: agent.systemPrompt,
      modelId: agent.modelId || undefined,
      skills: skillRows.map(row => row.skill.name),
      config: agent.config || '{}',
    }
  }))

  return { agents: bundleAgents }
}

export async function importAgents(bundle: AgentBundle) {
  if (!bundle || !Array.isArray(bundle.agents)) throw new Error('agents required')

  const warnings: string[] = []
  const imported = []
  const existingSkills = await db.select().from(skills)
  const skillByName = new Map(existingSkills.map(skill => [skill.name, skill]))

  for (const item of bundle.agents) {
    validateAgent(item)
    const [existing] = await db.select().from(agents).where(eq(agents.name, item.name))
    const id = existing?.id || generateId()
    const now = new Date()

    if (existing) {
      await db.update(agents)
        .set({
          type: item.type,
          provider: item.provider,
          role: item.role,
          personality: item.personality,
          systemPrompt: item.systemPrompt || '',
          modelId: item.modelId || '',
          config: item.config || '{}',
          updatedAt: now,
        })
        .where(eq(agents.id, id))
    } else {
      await db.insert(agents).values({
        id,
        name: item.name,
        type: item.type,
        provider: item.provider,
        role: item.role,
        personality: item.personality,
        systemPrompt: item.systemPrompt || '',
        modelId: item.modelId || '',
        config: item.config || '{}',
        apiKey: '',
        baseUrl: '',
        workDir: '',
        createdAt: now,
        updatedAt: now,
      })
    }

    for (const skillName of item.skills || []) {
      const skill = skillByName.get(skillName)
      if (!skill) {
        warnings.push(`Skill not found: ${skillName}`)
        continue
      }
      const existingLinks = await db
        .select()
        .from(agentSkills)
        .where(eq(agentSkills.agentId, id))
      if (!existingLinks.some(link => link.skillId === skill.id)) {
        await db.insert(agentSkills).values({ id: generateId(), agentId: id, skillId: skill.id })
      }
    }

    imported.push((await db.select().from(agents).where(eq(agents.id, id)))[0])
  }

  return { agents: imported, warnings }
}

function validateAgent(agent: AgentBundleItem) {
  if (!agent.name) throw new Error('agent.name required')
  if (agent.type !== 'ai' && agent.type !== 'tool') throw new Error(`invalid agent.type: ${agent.type}`)
  if (!agent.provider) throw new Error('agent.provider required')
  if (!agent.role) throw new Error('agent.role required')
  if (!agent.personality) throw new Error('agent.personality required')
}
