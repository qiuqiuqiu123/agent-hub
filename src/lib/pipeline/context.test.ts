import { describe, expect, it } from 'vitest'
import { buildTemplateArgs, isDependencySatisfied } from './runner'
import type { StepResult } from './types'

describe('pipeline prompt context', () => {
  it('does not inject large base64 payloads into default step output variables', () => {
    const largeBase64 = 'a'.repeat(1024 * 1024)
    const results = new Map<string, StepResult>([
      ['generate_images', {
        stepId: 'generate_images',
        status: 'completed',
        output: JSON.stringify({ b64_json: largeBase64, url: '', revised_prompt: 'prompt' }),
        structuredOutput: { b64_json: largeBase64, url: '', revised_prompt: 'prompt' },
        commits: [],
      }],
    ])

    const args = buildTemplateArgs(results, {}, '')

    expect(args.STEP_GENERATE_IMAGES_OUTPUT.length).toBeLessThan(1000)
    expect(args.STEP_GENERATE_IMAGES_DATA.length).toBeLessThan(1000)
    expect(args.STEP_GENERATE_IMAGES_DATA_B64_JSON).toBe(largeBase64)
  })
})

describe('pipeline dependency status', () => {
  it('does not treat dependency-skipped steps as satisfied', () => {
    expect(isDependencySatisfied({ stepId: 'format', status: 'skipped', output: '', commits: [], error: 'Dependency not completed' })).toBe(false)
  })

  it('treats explicitly skipped steps as satisfied', () => {
    expect(isDependencySatisfied({ stepId: 'optional', status: 'skipped', output: '', commits: [] })).toBe(true)
  })
})
