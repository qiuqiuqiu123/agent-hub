import { describe, it, expect } from 'vitest'
import { resolvePrompt } from './prompt-template'

describe('resolvePrompt', () => {
  it('replaces simple variables', () => {
    const result = resolvePrompt('Hello {{NAME}}', { NAME: 'World' })
    expect(result).toBe('Hello World')
  })

  it('leaves unmatched variables as-is', () => {
    const result = resolvePrompt('{{FOO}} and {{BAR}}', { FOO: 'yes' })
    expect(result).toBe('yes and {{BAR}}')
  })

  it('resolves dot-notation from JSON value', () => {
    const args = {
      STEP_ANALYZE_DATA: JSON.stringify({ route: 'backend', summary: 'test' }),
    }
    const result = resolvePrompt('Route: {{STEP_ANALYZE_DATA.route}}', args)
    expect(result).toBe('Route: backend')
  })

  it('resolves dot-notation with array value as JSON', () => {
    const args = {
      STEP_ANALYZE_DATA: JSON.stringify({ tasks: ['a', 'b'] }),
    }
    const result = resolvePrompt('Tasks: {{STEP_ANALYZE_DATA.tasks}}', args)
    expect(result).toBe('Tasks: ["a","b"]')
  })

  it('returns original template when base key not found', () => {
    const result = resolvePrompt('{{MISSING.field}}', {})
    expect(result).toBe('{{MISSING.field}}')
  })

  it('returns original template when field not in JSON', () => {
    const args = { DATA: JSON.stringify({ a: 1 }) }
    const result = resolvePrompt('{{DATA.b}}', args)
    expect(result).toBe('{{DATA.b}}')
  })
})
